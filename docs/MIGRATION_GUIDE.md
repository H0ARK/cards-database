# PostgreSQL Migration Guide

This guide documents the migration from an in-memory JSON architecture to a PostgreSQL database for the TCGdex card database API.

## Table of Contents

1. [Why Migrate?](#why-migrate)
2. [Architecture Overview](#architecture-overview)
3. [Migration Steps](#migration-steps)
4. [Database Schema](#database-schema)
5. [Server Code Changes](#server-code-changes)
6. [Testing](#testing)
7. [Rollback Plan](#rollback-plan)

---

## Why Migrate?

### Current Architecture Problems

**In-Memory JSON Limitations:**
- ❌ **High Memory Usage**: All cards for all languages loaded into RAM
- ❌ **Worker Duplication**: 2 workers = 2x memory (each loads full dataset)
- ❌ **No Scalability**: Cannot handle multiple card games (Magic, Yu-Gi-Oh, etc.)
- ❌ **Slow Updates**: Requires full recompile and redeploy for any data change
- ❌ **Startup Time**: Loading all JSON files takes time (will get worse as data grows)

**Scale Requirements:**
- Pokemon: ~20,000 cards × 18 languages = 360,000 records
- Magic: The Gathering: ~27,000 cards × 15 languages = 405,000 records
- Yu-Gi-Oh: ~12,000 cards × 10 languages = 120,000 records
- **Total potential: 1,000,000+ card records**

Loading 1M+ records into memory per worker is completely impractical.

### PostgreSQL Benefits

- ✅ **Memory Efficient**: Only cache active data, shared across workers
- ✅ **Scalable**: Handles millions of rows easily
- ✅ **Incremental Updates**: Update individual cards/prices without recompile
- ✅ **Multi-Game Support**: Single schema supports Pokemon, Magic, Yu-Gi-Oh, etc.
- ✅ **Better Queries**: Indexes, full-text search, complex filters
- ✅ **Price Updates**: Update prices without touching card data
- ✅ **Already Running**: PostgreSQL container already exists

---

## Architecture Overview

### Before (In-Memory JSON)

```
┌─────────────────────────────────────────┐
│  Docker Container (Worker 1)            │
│  ┌────────────────────────────────────┐ │
│  │ Load ALL cards.json (2.2MB)        │ │
│  │ Load ALL sets.json                 │ │
│  │ Memory: ~4-5MB + caches            │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Docker Container (Worker 2)            │
│  ┌────────────────────────────────────┐ │
│  │ Load ALL cards.json (2.2MB) AGAIN  │ │
│  │ Load ALL sets.json AGAIN           │ │
│  │ Memory: ~4-5MB + caches DUPLICATE  │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘

Total Memory: 8-10MB + duplicate caches
Scalability: Poor (will break with more games)
```

### After (PostgreSQL)

```
┌─────────────────────────────────────────┐
│  Docker Container (Worker 1)            │
│  ┌────────────────────────────────────┐ │
│  │ Query PostgreSQL on-demand         │ │
│  │ Cache hot cards in memory (Redis)  │ │
│  │ Memory: ~500KB + smart cache       │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
              ↓ ↑
┌─────────────────────────────────────────┐
│  PostgreSQL Database (Shared)           │
│  ┌────────────────────────────────────┐ │
│  │ Cards: 1M+ rows (indexed)          │ │
│  │ Prices: Separate table (updatable) │ │
│  │ Sets, Series, Sealed Products      │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
              ↓ ↑
┌─────────────────────────────────────────┐
│  Docker Container (Worker 2)            │
│  ┌────────────────────────────────────┐ │
│  │ Query PostgreSQL on-demand         │ │
│  │ Shared cache (no duplication)      │ │
│  │ Memory: ~500KB + smart cache       │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘

Total Memory: ~1MB + shared cache
Scalability: Excellent (handles millions)
```

---

## Migration Steps

### Step 1: Setup Environment

Create `.env` file from template:

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cards_db
DB_USER=postgres
DB_PASSWORD=postgres
```

### Step 2: Initialize Database

Run the setup script to create the database and apply schema:

```bash
./scripts/setup-database.sh
```

This will:
1. Check PostgreSQL connection
2. Create `cards_db` database (or drop/recreate if exists)
3. Apply all migrations from `migrations/*.sql`
4. Show database table information

**Expected output:**
```
✅ PostgreSQL is running
📦 Creating database 'cards_db'...
✅ Database ready
🚀 Running migrations...
   📄 Applying 001_initial_schema.sql...
✅ Migrations completed
```

### Step 3: Migrate Data

Import all Pokemon card data from TypeScript files into PostgreSQL:

```bash
bun scripts/migrate-to-postgres.ts
```

This will:
1. Scan `data/` directory for all series/sets/cards
2. Import series → sets → cards → variants → sealed products
3. Show progress and statistics

**Expected output:**
```
🚀 Starting Pokemon data migration to PostgreSQL...
✅ Database connection successful

📦 Found 15 series to migrate

📚 Migrating series: Scarlet & Violet
   📦 Migrating set: Prismatic Evolutions
      🃏 Found 245 cards
      📦 Found 8 sealed products

✅ Migration completed successfully!

📊 Statistics:
   Series: 15
   Sets: 236
   Cards: 20,465
   Variants: 260
   Sealed Products: 2,645
   Errors: 0
```

**Migration time estimate:** ~5-10 minutes for full Pokemon dataset

### Step 4: Verify Data

Check that data was imported correctly:

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d cards_db
```

```sql
-- Check counts
SELECT COUNT(*) FROM cards;
-- Expected: ~20,000+

SELECT COUNT(*) FROM card_variants;
-- Expected: ~260

SELECT COUNT(*) FROM sealed_products;
-- Expected: ~2,600+

-- Check a specific card
SELECT id, name, rarity, attributes->>'hp' as hp
FROM cards
WHERE id = 'sv08-001';

-- Check variants
SELECT c.id, c.name, v.variant_type, v.third_party
FROM cards c
JOIN card_variants v ON c.id = v.card_id
WHERE c.id = 'sv08-079'
ORDER BY v.variant_type;

-- Exit
\q
```

### Step 5: Install Database Dependencies

Add PostgreSQL client to the server:

```bash
cd server
bun add pg @types/pg
```

### Step 6: Update Server Code

Replace in-memory JSON loading with PostgreSQL queries.

**Key files to update:**

1. **`server/src/V2/Components/Card.ts`**
   - Replace JSON imports with database queries
   - Add connection pool
   - Update `findCards()`, `getCardById()`, etc.

2. **`server/src/V2/Components/Set.ts`**
   - Replace set JSON loading with DB queries

3. **`server/src/V2/Components/Serie.ts`**
   - Replace series JSON loading with DB queries

4. **`server/src/libs/providers/tcgplayer.ts`**
   - Update to write prices to `prices` table
   - Add price history tracking

5. **`server/src/libs/providers/cardmarket.ts`**
   - Update to write prices to `prices` table

**Example: Card.ts refactored**

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20, // connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export async function findCards(lang: string, query: any) {
  // Build SQL query from filters
  const sql = buildCardQuery(lang, query);
  const result = await pool.query(sql);
  return result.rows;
}

export async function getCardById(lang: string, id: string) {
  const result = await pool.query(
    'SELECT * FROM cards WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}
```

### Step 7: Add Caching Layer (Optional but Recommended)

Use Redis for caching hot cards to reduce database load:

```bash
cd server
bun add ioredis @types/ioredis
```

Update docker-compose.yml:

```yaml
services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

### Step 8: Test Migration

Run the server and test endpoints:

```bash
cd server
bun run dev
```

Test key endpoints:

```bash
# Get all cards
curl http://localhost:4000/v2/en/cards | jq

# Get specific card
curl http://localhost:4000/v2/en/cards/sv08-001 | jq

# Get card with variants
curl http://localhost:4000/v2/en/cards/sv08-079 | jq

# Get prices
curl http://localhost:4000/v2/en/cards/sv08-001/prices | jq

# Get sets
curl http://localhost:4000/v2/en/sets | jq
```

**Performance testing:**

```bash
# Test response times (should be <50ms)
time curl -s http://localhost:4000/v2/en/cards/sv08-001 > /dev/null

# Load test (optional)
ab -n 1000 -c 10 http://localhost:4000/v2/en/cards
```

### Step 9: Deploy

Update Docker build and deploy:

```bash
# Rebuild Docker image
docker build -t local-tcgdex .

# Stop current container
docker-compose down

# Start with PostgreSQL
docker-compose up -d

# Check logs
docker-compose logs -f stable
```

---

## Database Schema

### Core Tables

#### `games`
Card games (Pokemon, Magic, Yu-Gi-Oh)
```sql
- id (PK): "pokemon", "magic", "yugioh"
- name: "Pokémon Trading Card Game"
- slug: "pokemon"
- metadata: JSONB for game-specific data
```

#### `series`
Series within a game (e.g., "Scarlet & Violet")
```sql
- id (PK): "sv"
- game_id (FK): "pokemon"
- name: JSONB {"en": "Scarlet & Violet", "fr": "..."}
- slug: "scarlet-violet"
```

#### `sets`
Card sets/expansions
```sql
- id (PK): "sv08"
- game_id (FK): "pokemon"
- series_id (FK): "sv"
- name: JSONB {"en": "Prismatic Evolutions"}
- card_count: JSONB {"total": 245}
- release_date: "2024-11-01"
```

#### `cards`
Individual cards (language-agnostic)
```sql
- id (PK): "sv08-001"
- game_id (FK): "pokemon"
- set_id (FK): "sv08"
- local_id: "001"
- name: JSONB {"en": "Pikachu", "ja": "ピカチュウ"}
- rarity: "Common"
- attributes: JSONB {hp: 60, types: ["Lightning"]}
- third_party: JSONB {tcgplayer: {...}}
```

#### `card_variants`
Card variants (holos, patterns, etc.)
```sql
- id (PK): UUID
- card_id (FK): "sv08-079"
- variant_type: "masterball", "pokeball", "holo"
- third_party: JSONB {tcgplayer: {productId: 642349}}
```

#### `sealed_products`
Booster boxes, ETBs, tins, etc.
```sql
- id (PK): "sv08-booster-box"
- game_id (FK): "pokemon"
- set_id (FK): "sv08"
- name: JSONB {"en": "Booster Box"}
- product_type: "booster-box"
- pack_count: 36
```

#### `prices`
Current prices from providers
```sql
- id (PK): UUID
- card_id (FK): "sv08-001"
- provider: "tcgplayer"
- price_data: JSONB {low: 1.99, market: 2.50}
- updated_at: timestamp
```

#### `price_history`
Historical price tracking
```sql
- id (PK): UUID
- card_id (FK): "sv08-001"
- provider: "tcgplayer"
- price_data: JSONB
- recorded_at: timestamp
```

### Key Indexes

```sql
-- Card lookups
CREATE INDEX idx_cards_game ON cards(game_id);
CREATE INDEX idx_cards_set ON cards(set_id);
CREATE INDEX idx_cards_local_id ON cards(set_id, local_id);

-- Full-text search
CREATE INDEX idx_cards_name_search ON cards USING gin(...);

-- Price queries
CREATE INDEX idx_prices_card ON prices(card_id);
CREATE INDEX idx_prices_updated ON prices(updated_at);
```

---

## Server Code Changes

### Connection Pool Setup

Create `server/src/libs/db.ts`:

```typescript
import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'cards_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected database error', err);
});
```

### Query Builder

Create `server/src/libs/QueryBuilder.ts`:

```typescript
export class CardQueryBuilder {
  private conditions: string[] = [];
  private params: any[] = [];
  private paramCounter = 1;

  where(field: string, value: any) {
    this.conditions.push(`${field} = $${this.paramCounter}`);
    this.params.push(value);
    this.paramCounter++;
    return this;
  }

  whereIn(field: string, values: any[]) {
    this.conditions.push(`${field} = ANY($${this.paramCounter})`);
    this.params.push(values);
    this.paramCounter++;
    return this;
  }

  build() {
    return {
      sql: this.conditions.length > 0
        ? `WHERE ${this.conditions.join(' AND ')}`
        : '',
      params: this.params,
    };
  }
}
```

### Update Component Files

**Before (Card.ts):**
```typescript
import en from '../../../generated/en/cards.json'
const cards = { en: en, fr: fr, ... }
```

**After (Card.ts):**
```typescript
import { pool } from '../../libs/db';

export async function findCards(lang: string, query: any) {
  const qb = new CardQueryBuilder();
  
  if (query.set) qb.where('set_id', query.set);
  if (query.rarity) qb.where('rarity', query.rarity);
  
  const { sql, params } = qb.build();
  
  const result = await pool.query(`
    SELECT * FROM cards ${sql}
  `, params);
  
  return result.rows;
}
```

---

## Testing

### Unit Tests

Test database queries:

```typescript
import { describe, it, expect } from 'bun:test';
import { findCards, getCardById } from './Card';

describe('Card Database', () => {
  it('should find cards by set', async () => {
    const cards = await findCards('en', { set: 'sv08' });
    expect(cards.length).toBeGreaterThan(0);
  });

  it('should get card by ID', async () => {
    const card = await getCardById('en', 'sv08-001');
    expect(card).toBeDefined();
    expect(card.id).toBe('sv08-001');
  });
});
```

### Integration Tests

```bash
# Test all endpoints
curl http://localhost:4000/v2/en/cards
curl http://localhost:4000/v2/en/sets
curl http://localhost:4000/v2/en/series
```

### Performance Tests

```bash
# Response time test
ab -n 100 -c 10 http://localhost:4000/v2/en/cards/sv08-001

# Expected: <50ms average
```

---

## Rollback Plan

If migration fails, rollback to in-memory JSON:

### 1. Stop new server

```bash
docker-compose down
```

### 2. Restore old code

```bash
git stash  # or git reset --hard <commit>
```

### 3. Rebuild and restart

```bash
docker build -t local-tcgdex .
docker-compose up -d
```

### 4. Verify

```bash
curl http://localhost:4000/v2/en/cards | jq
```

---

## Next Steps After Migration

1. **Add more games**
   - Import Magic: The Gathering data
   - Import Yu-Gi-Oh data
   - Update schema as needed

2. **Optimize queries**
   - Add more indexes based on slow query log
   - Use `EXPLAIN ANALYZE` to optimize

3. **Add caching**
   - Redis for hot cards
   - CDN for static assets

4. **Price automation**
   - Cron job to update prices daily
   - Price history tracking

5. **Monitoring**
   - Query performance monitoring
   - Database size/growth tracking
   - Error rate tracking

---

## Troubleshooting

### Connection refused

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:** Ensure PostgreSQL is running:
```bash
docker ps | grep postgres
docker-compose up -d
```

### Migration fails with "relation already exists"

**Solution:** Drop and recreate database:
```bash
./scripts/setup-database.sh
# Choose "Yes" when prompted to drop existing database
```

### Slow queries

**Solution:** Check indexes:
```sql
EXPLAIN ANALYZE SELECT * FROM cards WHERE set_id = 'sv08';
```

Add missing indexes as needed.

---

## Support

For issues or questions:
1. Check logs: `docker-compose logs -f stable`
2. Review migration output for errors
3. Test database connection: `psql -h localhost -U postgres -d cards_db`

---

**Migration Status:** Ready to execute
**Estimated Time:** 1-2 hours (setup + data migration + testing)
**Risk Level:** Low (rollback plan available)
**Benefits:** High (scalability, multi-game support, better performance)
