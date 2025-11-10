# Migration Plan: Cards Table → Products Table

## Overview

We need to migrate the API from the OLD TCGdex-based `cards` table to the NEW TCGPlayer-based `products` table.

## Current State

### OLD System (TCGdex) - To Be Deprecated
- **Table**: `cards` (21,444 rows)
- **Data Source**: TCGdex API (JSONB-heavy structure)
- **Images**: NULL - no image data stored
- **Coverage**: Limited to TCGdex catalog
- **Linked to Products**: Only 9,562 cards (44.6%)

### NEW System (TCGPlayer) - Target
- **Table**: `products` (449,752 rows total, 30,478 Pokemon)
- **Data Source**: TCGPlayer/TCGCSV API
- **Images**: Constructable via `get_product_image_url(product_id, size)`
- **Image Pattern**: `https://tcgplayer-cdn.tcgplayer.com/product/{id}_{size}.jpg`
- **Available Sizes**: 200w, 400w, 600w
- **Coverage**: Complete TCGPlayer catalog
- **Pricing**: Integrated with `price_history`, `current_prices` tables

## Schema Comparison

### Cards Table (OLD)
```sql
CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    game_id TEXT,
    set_id TEXT,
    local_id TEXT,
    name JSONB,                    -- Multi-language names
    illustrator TEXT,
    rarity TEXT,
    category TEXT,
    attributes JSONB,              -- hp, types, attacks, abilities, etc.
    image TEXT,                    -- NULL for all rows
    image_small TEXT,              -- NULL for all rows
    image_high TEXT,               -- NULL for all rows
    legal JSONB,
    regulation_mark TEXT,
    third_party JSONB,             -- Contains tcgplayer->normal product ID
    metadata JSONB,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Products Table (NEW)
```sql
CREATE TABLE products (
    id INTEGER PRIMARY KEY,        -- TCGPlayer product ID
    category_id INTEGER,           -- 3 = Pokemon
    group_id INTEGER,              -- Set/expansion ID
    name TEXT,
    clean_name TEXT,
    card_number TEXT,
    rarity_id SMALLINT,            -- FK to rarities table
    card_type_id SMALLINT,         -- FK to card_types table
    hp SMALLINT,
    stage TEXT,
    retreat_cost SMALLINT,
    image_count SMALLINT,          -- Indicates images available
    is_presale BOOLEAN,
    released_on DATE,
    url TEXT,                      -- TCGPlayer product page
    modified_on TIMESTAMP,
    card_text JSONB,               -- Abilities, attacks, effects
    is_synthetic BOOLEAN           -- TRUE for IDs >= 1B (non-TCGPlayer)
);
```

## Image URL Construction

### Current (Broken)
```typescript
// From CardDB.ts - constructImageURL function
function constructImageURL(lang: SupportedLanguages, seriesId: string, setId: string, localId: string): string {
    return `https://assets.tcgdex.net/${lang}/${seriesId}/${setId}/${localId}`
}
```
**Problem**: `cards.image` is NULL for all rows, falls back to TCGdex CDN which may not have images

### New (Working)
```typescript
function constructProductImageURL(productId: number, size: '200w' | '400w' | '600w' = '400w'): string {
    return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_${size}.jpg`
}

// Or use PostgreSQL function
SELECT get_product_image_url(42346, '400w')
-- Returns: https://tcgplayer-cdn.tcgplayer.com/product/42346_400w.jpg
```

## Migration Tasks

### Phase 1: Dual-System Support (Immediate)
- [ ] **1.1** Create `ProductDB.ts` component (parallel to `CardDB.ts`)
- [ ] **1.2** Implement product query functions:
  - `getAllProducts(categoryId: number)` - Get all products for a category
  - `getProductById(id: number)` - Get single product
  - `findProducts(query: Query)` - Search with filters
  - `searchProducts(searchTerm: string, categoryId?: number)` - Text search
- [ ] **1.3** Add image URL construction in `ProductDB.ts`:
  ```typescript
  image: constructProductImageURL(row.id, '400w'),
  image_small: constructProductImageURL(row.id, '200w'),
  image_high: constructProductImageURL(row.id, '600w'),
  ```
- [ ] **1.4** Add product pricing integration (already exists in `current_prices` view)
- [ ] **1.5** Create new API endpoints under `/v2/products/`:
  - `GET /v2/products` - List products with filters
  - `GET /v2/products/:id` - Get single product
  - `GET /v2/products/search?q=pikachu` - Search products
  - `GET /v2/products/:id/prices` - Get price history

### Phase 2: Update Existing Endpoints (Compatibility Layer)
- [ ] **2.1** Modify `CardDB.ts` to query `products` table via `third_party->tcgplayer->normal`:
  ```sql
  SELECT p.*, c.id as card_id
  FROM cards c
  JOIN products p ON p.id = (c.third_party->'tcgplayer'->>'normal')::int
  WHERE c.id = $1
  ```
- [ ] **2.2** Update image URLs in card responses to use product images
- [ ] **2.3** Add fallback logic: Try products table first, fall back to cards table
- [ ] **2.4** Update `QueryBuilderOptimized.ts` to support product queries
- [ ] **2.5** Add telemetry to track which system is being used

### Phase 3: Data Reconciliation
- [ ] **3.1** Audit data differences between `cards` and `products`:
  - Compare card names, rarities, types
  - Identify cards in `cards` table not in `products`
  - Identify products in `products` table that should be cards
- [ ] **3.2** Create synthetic products for non-TCGPlayer cards (ID >= 1,000,000,000):
  - Asian exclusive cards
  - Promo cards not in TCGPlayer
  - Tournament prizes
- [ ] **3.3** Backfill missing product data from `cards` table:
  - Multi-language names → `product_translations` table
  - Extended attributes → `card_text` JSONB
- [ ] **3.4** Update linking:
  - Ensure all products have correct `group_id` (sets)
  - Link to `categories`, `rarities`, `card_types` tables

### Phase 4: Switch Default (Breaking Change)
- [ ] **4.1** Update default behavior to use `products` table
- [ ] **4.2** Mark `cards` endpoints as deprecated (add warning headers)
- [ ] **4.3** Update documentation to reference new endpoints
- [ ] **4.4** Create migration guide for API consumers
- [ ] **4.5** Implement version negotiation: `/v2/cards` vs `/v3/products`

### Phase 5: Cleanup (Final)
- [ ] **5.1** Remove `cards` table dependencies from codebase
- [ ] **5.2** Drop deprecated tables:
  - `cards`
  - `cards_complete` (if no longer needed)
  - `cards_with_prices` (replaced by `products_with_prices`)
- [ ] **5.3** Archive old `cards` data to backup
- [ ] **5.4** Update database indexes for optimal product queries
- [ ] **5.5** Performance testing and optimization

## Key API Changes

### Current (Cards Table)
```typescript
// GET /v2/en/cards/base1-4
{
  "id": "base1-4",
  "localId": "4",
  "name": "Charizard",
  "image": null,  // ❌ NULL!
  "set": { "id": "base1", "name": "Base Set" },
  "rarity": "Rare Holo",
  "hp": 120,
  // ...
}
```

### New (Products Table)
```typescript
// GET /v2/products/42348
{
  "id": 42348,
  "name": "Charizard",
  "cleanName": "Charizard",
  "image": "https://tcgplayer-cdn.tcgplayer.com/product/42348_400w.jpg",  // ✅ Working!
  "image_small": "https://tcgplayer-cdn.tcgplayer.com/product/42348_200w.jpg",
  "image_high": "https://tcgplayer-cdn.tcgplayer.com/product/42348_600w.jpg",
  "categoryId": 3,
  "groupId": 604,
  "cardNumber": "004/102",
  "rarity": "Holo Rare",
  "hp": 120,
  "stage": "Stage 2",
  "url": "https://www.tcgplayer.com/product/42348/pokemon-base-set-charizard",
  "pricing": {
    "normal": { "marketPrice": 45000 },  // $450.00
    "holofoil": { "marketPrice": 50000 }  // $500.00
  }
}
```

## Compatibility Bridge

To maintain backward compatibility during migration:

```typescript
// Hybrid query: Try products first, fallback to cards
async function getCardOrProduct(id: string): Promise<Card | Product | null> {
  // Check if ID is numeric (product ID) or text (card ID)
  if (/^\d+$/.test(id)) {
    // Numeric ID - query products table
    return await getProductById(parseInt(id))
  } else {
    // Text ID - query cards table with product enrichment
    const card = await getCardById('en', id)

    if (card && card.thirdParty?.tcgplayer?.normal) {
      // Enrich with product data
      const product = await getProductById(card.thirdParty.tcgplayer.normal)
      return { ...card, product }
    }

    return card
  }
}
```

## Benefits of Migration

1. **✅ Working Images**: All 449k products have constructable image URLs
2. **✅ Better Pricing**: Direct integration with price_history partitions
3. **✅ More Complete Data**: 30k Pokemon products vs 21k cards
4. **✅ Normalized Schema**: No JSONB abuse, proper foreign keys
5. **✅ Scalability**: Supports all TCG games (Magic, YuGiOh, etc.)
6. **✅ Performance**: Indexed columns instead of JSONB queries
7. **✅ Real-time Updates**: TCGPlayer data updates daily
8. **✅ Standard IDs**: Integer IDs instead of custom text IDs

## Risks & Mitigation

### Risk 1: Breaking Changes for API Consumers
**Mitigation**:
- Maintain `/v2/cards` endpoints with compatibility layer
- Create new `/v3/products` endpoints
- 6-month deprecation notice
- Provide migration guide

### Risk 2: Missing Data (11,882 cards not in products)
**Mitigation**:
- Create synthetic products (ID >= 1B) for missing cards
- Import from TCGdex for Asian/exclusive cards
- Mark synthetic products with `is_synthetic = true`

### Risk 3: Different ID Systems (text vs integer)
**Mitigation**:
- Maintain ID mapping table: `card_id → product_id`
- Support both ID formats in API
- Use content negotiation headers

### Risk 4: Query Performance During Transition
**Mitigation**:
- Add indexes on join columns
- Cache frequently accessed products
- Monitor query performance
- Use read replicas for heavy queries

## Timeline Estimate

- **Phase 1**: 1-2 weeks (new endpoints)
- **Phase 2**: 1 week (compatibility layer)
- **Phase 3**: 2-3 weeks (data reconciliation)
- **Phase 4**: 1 week (switch default)
- **Phase 5**: 1 week (cleanup)

**Total**: 6-8 weeks for complete migration

## Success Metrics

- [ ] 100% of products have valid image URLs
- [ ] API response times < 200ms (p95)
- [ ] Zero downtime during migration
- [ ] < 1% error rate on new endpoints
- [ ] All existing API consumers continue to work
- [ ] Database size reduced by removing JSONB redundancy
- [ ] Query performance improved by 2x on product searches

## Next Steps

1. Create `ProductDB.ts` component
2. Implement `/v2/products` endpoints
3. Test image URL construction
4. Run parallel queries to compare results
5. Start Phase 1 implementation
