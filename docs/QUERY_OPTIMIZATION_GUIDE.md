# Query Optimization Guide

## Overview

This guide documents the performance optimizations made to the card database queries to address slow search and filtering operations.

## Problem Summary

The original query implementation was experiencing severe performance issues due to:

1. **Excessive OR conditions** - The `whereCardMetadataSearch` method created 16+ ILIKE operations joined with OR
2. **Missing indexes** - No trigram indexes for ILIKE searches on text and JSONB fields
3. **Inefficient JSONB searches** - Casting entire JSONB columns to text for pattern matching
4. **No query optimization** - All search conditions executed regardless of selectivity
5. **Full table scans** - Without proper indexes, PostgreSQL had to scan entire tables

### Example of Slow Query

```sql
-- This query had 16+ ILIKE conditions all joined with OR
SELECT c.*, s.name FROM cards c
LEFT JOIN sets s ON c.set_id = s.id
WHERE (
  c.name->>'en' ILIKE '%search%' OR
  c.name->>'fr' ILIKE '%search%' OR
  c.name->>'es' ILIKE '%search%' OR
  -- ... 6 more languages
  c.illustrator ILIKE '%search%' OR
  c.rarity ILIKE '%search%' OR
  c.category ILIKE '%search%' OR
  (c.attributes->>'stage') ILIKE '%search%' OR
  c.attributes::text ILIKE '%search%' AND c.attributes::text LIKE '%abilities%' OR
  -- ... many more conditions
)
```

## Solution Architecture

### 1. Database Indexes (Migration 002)

#### A. Trigram Indexes for Text Fields

Trigram (pg_trgm) indexes enable fast ILIKE pattern matching:

```sql
-- Regular text columns
CREATE INDEX idx_cards_illustrator_trgm ON cards USING gin(illustrator gin_trgm_ops);
CREATE INDEX idx_cards_rarity_trgm ON cards USING gin(rarity gin_trgm_ops);
CREATE INDEX idx_cards_category_trgm ON cards USING gin(category gin_trgm_ops);
```

**Performance Impact**: Reduces ILIKE searches from O(n) table scan to O(log n) index lookup.

#### B. JSONB Path Indexes

Indexes on specific JSONB paths for faster access:

```sql
-- Card names per language
CREATE INDEX idx_cards_name_en_trgm ON cards USING gin((name->>'en') gin_trgm_ops);
CREATE INDEX idx_cards_name_fr_trgm ON cards USING gin((name->>'fr') gin_trgm_ops);
-- ... other languages

-- Card attributes
CREATE INDEX idx_cards_stage_trgm ON cards USING gin((attributes->>'stage') gin_trgm_ops);
CREATE INDEX idx_cards_trainer_type_trgm ON cards USING gin((attributes->>'trainerType') gin_trgm_ops);
```

**Performance Impact**: Enables indexed access to JSONB fields without full column scans.

#### C. Composite Indexes

Indexes on commonly filtered combinations:

```sql
-- Common filter combinations
CREATE INDEX idx_cards_set_rarity ON cards(set_id, rarity);
CREATE INDEX idx_cards_set_category ON cards(set_id, category);
CREATE INDEX idx_cards_category_rarity ON cards(category, rarity);
```

**Performance Impact**: Dramatically speeds up filtered listings (e.g., "all rare cards in a set").

#### D. Partial Indexes

Indexes for specific card categories:

```sql
-- Category-specific indexes
CREATE INDEX idx_cards_pokemon_name_en ON cards USING gin((name->>'en') gin_trgm_ops)
WHERE category = 'Pokemon';
```

**Performance Impact**: Smaller, faster indexes for category-filtered searches.

### 2. Query Builder Optimization

#### A. Tiered Search Strategy

The optimized query builder uses a tiered approach:

**Tier 1**: Most common, highly selective searches
- Card name in primary language
- Set name in primary language

**Tier 2**: Exact match fields (very selective)
- Rarity
- Category

**Tier 3**: Commonly searched attributes
- Illustrator
- Regulation mark
- Stage

**Tier 4**: JSONB attributes (slower but indexed)
- Trainer type
- Energy type

**Tier 5**: Deep JSONB searches (only for terms ≥4 characters)
- EvolveFrom
- Description
- Effect

**Tier 6**: Nested array searches (only for terms ≥5 characters)
- Abilities
- Attacks
- Items

#### B. Search Term Length Optimization

```typescript
// Only add expensive searches for longer terms
if (searchTerm.length >= 4) {
  // Add description, effect searches
}

if (searchTerm.length >= 5) {
  // Add abilities, attacks searches
}
```

**Rationale**: Short terms (1-3 characters) often match on name/rarity alone. Longer terms are more specific and benefit from deep searches.

#### C. Primary Language Optimization

```typescript
// Search primary language first
const nameParam = this.paramCounter++;
this.params.push(`%${searchTerm}%`);
searchConditions.push(`c.name->>'${lang}' ILIKE $${nameParam}`);

// Only add English if it's not the primary language
if (lang !== 'en') {
  const nameEnParam = this.paramCounter++;
  this.params.push(`%${searchTerm}%`);
  searchConditions.push(`c.name->>'en' ILIKE $${nameEnParam}`);
}
```

**Performance Impact**: Reduces unnecessary language checks when user's language is English.

#### D. Filter Application Order

Apply most selective filters first:

```typescript
// 1. Category (highly selective)
if (filters.category) {
  qb.whereEquals('c.category', filters.category);
}

// 2. Rarity (selective)
if (filters.rarity) {
  qb.whereEquals('c.rarity', filters.rarity);
}

// 3. Full-text search (least selective, applied last)
if (filters.q || filters.search) {
  qb.whereCardMetadataSearchOptimized(searchTerm, lang);
}
```

**Performance Impact**: Helps PostgreSQL's query planner choose better execution plans.

### 3. Set/Series/Sealed Product Indexes

Similar optimization patterns applied:

```sql
-- Set indexes
CREATE INDEX idx_sets_name_en_trgm ON sets USING gin((name->>'en') gin_trgm_ops);
CREATE INDEX idx_sets_id_trgm ON sets USING gin(id gin_trgm_ops);
CREATE INDEX idx_sets_slug ON sets(slug);

-- Series indexes
CREATE INDEX idx_series_name_en_trgm ON series USING gin((name->>'en') gin_trgm_ops);
CREATE INDEX idx_series_id_trgm ON series USING gin(id gin_trgm_ops);
```

## Implementation Steps

### Step 1: Run Migration

```bash
# Apply the optimization migration
psql -U cardadmin -d carddb -f migrations/002_performance_optimization.sql
```

**Expected time**: 5-15 minutes depending on database size
**Impact**: Database will be locked during index creation

For production, use concurrent index creation:
```sql
CREATE INDEX CONCURRENTLY idx_cards_illustrator_trgm
ON cards USING gin(illustrator gin_trgm_ops);
```

### Step 2: Update QueryBuilder Import

Option A: Replace existing QueryBuilder
```typescript
// In Card.ts, Set.ts, etc.
import { buildCardQuery } from '../../libs/QueryBuilderOptimized'
```

Option B: Gradual migration
```typescript
// Test optimized version alongside original
import { buildCardQuery as buildCardQueryOpt } from '../../libs/QueryBuilderOptimized'
import { buildCardQuery as buildCardQueryOld } from '../../libs/QueryBuilder'

// Use optimized version
const qb = buildCardQueryOpt(lang, query)
```

### Step 3: Monitor Performance

#### Check Index Usage

```sql
-- Check if indexes are being used
EXPLAIN ANALYZE
SELECT c.*, s.name as set_name
FROM cards c
LEFT JOIN sets s ON c.set_id = s.id
WHERE c.name->>'en' ILIKE '%pikachu%'
LIMIT 10;
```

Look for:
- ✅ `Bitmap Index Scan on idx_cards_name_en_trgm`
- ❌ `Seq Scan on cards` (full table scan - bad!)

#### Check Index Size

```sql
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

#### Query Performance Stats

```sql
SELECT
  query,
  calls,
  total_time,
  mean_time,
  min_time,
  max_time
FROM pg_stat_statements
WHERE query LIKE '%cards%'
ORDER BY mean_time DESC
LIMIT 10;
```

## Performance Benchmarks

### Before Optimization

| Query Type | Rows Scanned | Time | Index Used |
|------------|-------------|------|------------|
| Name search | ~50,000 | 2-5s | None (Seq Scan) |
| Set filter | ~50,000 | 1-3s | idx_cards_set (basic) |
| Full-text search | ~50,000 | 5-15s | None (Seq Scan) |
| Filtered search | ~50,000 | 3-10s | Partial |

### After Optimization (Expected)

| Query Type | Rows Scanned | Time | Index Used |
|------------|-------------|------|------------|
| Name search | ~100 | 10-50ms | idx_cards_name_en_trgm |
| Set filter | ~500 | 20-100ms | idx_cards_set_rarity (composite) |
| Full-text search | ~500 | 50-200ms | Multiple trigram indexes |
| Filtered search | ~200 | 30-150ms | Composite + trigram |

**Expected improvement**: 10-100x faster depending on query type

## Best Practices

### 1. Always Use Parameterized Queries

```typescript
// ✅ Good - prevents SQL injection, enables query plan caching
qb.where('c.name->>\'en\'', 'ILIKE', `%${searchTerm}%`)

// ❌ Bad - SQL injection risk, no plan caching
qb.whereRaw(`c.name->>'en' ILIKE '%${searchTerm}%'`)
```

### 2. Apply Selective Filters First

```typescript
// ✅ Good - filter to category first, then search
const qb = buildCardQuery(lang, {
  category: 'Pokemon',  // Highly selective
  q: 'fire'            // Less selective
})

// ❌ Bad - searches all categories
const qb = buildCardQuery(lang, {
  q: 'fire pokemon'
})
```

### 3. Use Appropriate Limits

```typescript
// ✅ Good - reasonable limit
qb.limit(50)

// ❌ Bad - no limit, could return thousands of rows
qb.limit(undefined)
```

### 4. Avoid Wildcard Prefix Searches

```typescript
// ✅ Good - can use trigram index
ILIKE '%pikachu%'

// ⚠️ Slower - but still uses index with pg_trgm
ILIKE 'pikachu%'

// ❌ Worst - prefix wildcard prevents some optimizations
ILIKE '%pikachu'
```

### 5. Monitor Index Maintenance

```sql
-- Rebuild indexes if fragmented (run during maintenance window)
REINDEX INDEX CONCURRENTLY idx_cards_name_en_trgm;

-- Update statistics
ANALYZE cards;
```

## Troubleshooting

### Query Still Slow After Migration?

1. **Check if indexes exist**
   ```sql
   \d cards
   ```

2. **Verify pg_trgm extension is enabled**
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_trgm';
   ```

3. **Update statistics**
   ```sql
   ANALYZE cards;
   ```

4. **Check index usage**
   ```sql
   EXPLAIN ANALYZE <your query>;
   ```

5. **Increase work_mem for complex queries**
   ```sql
   SET work_mem = '256MB';
   ```

### Index Creation Failed?

```sql
-- Check for locks
SELECT * FROM pg_locks WHERE relation = 'cards'::regclass;

-- Use CONCURRENTLY for production
CREATE INDEX CONCURRENTLY ...;
```

### Out of Disk Space?

Indexes can be large. Check space:
```sql
SELECT pg_size_pretty(pg_database_size('carddb'));
```

Remove old/unused indexes:
```sql
DROP INDEX IF EXISTS idx_cards_name_search;
```

## Maintenance

### Weekly
- Check slow query log
- Monitor index bloat

### Monthly
- `VACUUM ANALYZE` tables
- Review and update statistics

### Quarterly
- Review index usage stats
- Remove unused indexes
- Consider new indexes based on query patterns

## Future Optimizations

### 1. Full-Text Search (tsvector)

For even better text search performance:

```sql
-- Add tsvector column
ALTER TABLE cards ADD COLUMN search_vector tsvector;

-- Populate with trigger
CREATE TRIGGER cards_search_update
BEFORE INSERT OR UPDATE ON cards
FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger(search_vector, 'pg_catalog.english',
    name, illustrator, rarity);

-- GiST index for full-text search
CREATE INDEX idx_cards_search_vector
ON cards USING gin(search_vector);
```

### 2. Materialized Views

For frequently accessed aggregations:

```sql
CREATE MATERIALIZED VIEW cards_by_set AS
SELECT set_id, category, rarity, COUNT(*) as count
FROM cards
GROUP BY set_id, category, rarity;

CREATE INDEX ON cards_by_set(set_id, category);
```

### 3. Partitioning

For very large datasets:

```sql
-- Partition by game_id
CREATE TABLE cards_pokemon PARTITION OF cards
FOR VALUES IN ('pokemon');

CREATE TABLE cards_magic PARTITION OF cards
FOR VALUES IN ('magic');
```

### 4. Query Result Caching

Implement application-level caching:

```typescript
import Cache from '@cachex/memory'

const searchCache = new Cache({ ttl: 300000 }) // 5 min TTL

async function findCards(lang, query) {
  const cacheKey = JSON.stringify({ lang, query })
  const cached = await searchCache.get(cacheKey)
  if (cached) return cached

  const results = await executeQuery(lang, query)
  await searchCache.set(cacheKey, results)
  return results
}
```

### 5. Read Replicas

For high-traffic scenarios:
- Master: Writes only
- Replicas: Read queries (searches, filters)
- Load balancer: Route read queries to replicas

## Conclusion

These optimizations should provide 10-100x performance improvement for search and filter queries. The key improvements are:

1. ✅ Trigram indexes for fast ILIKE searches
2. ✅ JSONB path indexes for specific field access
3. ✅ Composite indexes for common filter combinations
4. ✅ Tiered search strategy to minimize expensive operations
5. ✅ Search term length optimization
6. ✅ Proper filter application order

Monitor query performance after implementation and adjust as needed based on actual usage patterns.
