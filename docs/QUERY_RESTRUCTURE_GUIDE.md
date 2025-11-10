# Query Restructuring Quick Reference

## Current vs New Queries

### Get a Single Card/Product

#### OLD (cards table - broken images)
```sql
SELECT
    c.*,
    s.name as set_name,
    s.logo as set_logo
FROM cards c
LEFT JOIN sets s ON c.set_id = s.id
WHERE c.id = 'base1-4';
```
**Result**: `image: null` ❌

#### NEW (products table - working images)
```sql
SELECT
    p.*,
    g.name as group_name,
    get_product_image_url(p.id, '400w') as image,
    get_product_image_url(p.id, '200w') as image_small,
    get_product_image_url(p.id, '600w') as image_high,
    cp.market_price,
    cp.low_price,
    cp.high_price
FROM products p
LEFT JOIN groups g ON p.group_id = g.id
LEFT JOIN current_prices cp ON p.id = cp.product_id AND cp.variant_id = 1
WHERE p.id = 42348;
```
**Result**: Full image URLs ✅

### Search by Name

#### OLD (cards table)
```sql
SELECT c.*
FROM cards c
WHERE c.name->>'en' ILIKE '%pikachu%'
LIMIT 20;
```

#### NEW (products table)
```sql
SELECT
    p.id,
    p.name,
    p.card_number,
    g.name as set_name,
    r.name as rarity,
    get_product_image_url(p.id, '400w') as image,
    cp.market_price
FROM products p
LEFT JOIN groups g ON p.group_id = g.id
LEFT JOIN rarities r ON p.rarity_id = r.id
LEFT JOIN current_prices cp ON p.id = cp.product_id AND cp.variant_id = 1
WHERE (p.name ILIKE '%pikachu%' OR p.clean_name ILIKE '%pikachu%')
    AND p.category_id = 3  -- Pokemon
ORDER BY
    CASE
        WHEN p.name ILIKE 'pikachu' THEN 1
        WHEN p.name ILIKE 'pikachu%' THEN 2
        ELSE 3
    END,
    p.name
LIMIT 20;
```

### Get All Cards in a Set

#### OLD (cards table)
```sql
SELECT c.*
FROM cards c
WHERE c.set_id = 'base1'
ORDER BY c.local_id;
```

#### NEW (products table)
```sql
SELECT
    p.*,
    g.name as group_name,
    r.name as rarity,
    ct.name as card_type,
    get_product_image_url(p.id, '400w') as image,
    cp.market_price
FROM products p
LEFT JOIN groups g ON p.group_id = g.id
LEFT JOIN rarities r ON p.rarity_id = r.id
LEFT JOIN card_types ct ON p.card_type_id = ct.id
LEFT JOIN current_prices cp ON p.id = cp.product_id AND cp.variant_id = 1
WHERE p.group_id = 604  -- Base Set
    AND p.category_id = 3
ORDER BY p.card_number;
```

### Filter by Rarity

#### OLD (cards table)
```sql
SELECT c.*
FROM cards c
WHERE c.rarity = 'Rare Holo'
LIMIT 50;
```

#### NEW (products table)
```sql
SELECT
    p.*,
    r.name as rarity,
    get_product_image_url(p.id, '400w') as image
FROM products p
JOIN rarities r ON p.rarity_id = r.id
WHERE r.name = 'Rare Holo'
    AND p.category_id = 3
LIMIT 50;
```

### Get Price History

#### OLD (complex file-based lookup)
```typescript
// Had to scan through tcgcsv/ folders
// Parse multiple JSON files
// Complex date-based lookups
```

#### NEW (direct database query)
```sql
SELECT
    recorded_at,
    market_price,
    low_price,
    high_price,
    market_price_usd
FROM price_history
WHERE product_id = 42348
    AND variant_id = 1
    AND recorded_at >= NOW() - INTERVAL '30 days'
ORDER BY recorded_at ASC;
```

## TypeScript/Node.js Examples

### ProductDB.ts Usage

```typescript
import {
    loadProduct,
    searchProducts,
    getProductsByGroup,
    getProductPriceHistory
} from './V2/Components/ProductDB'

// Get a single product with images
const charizard = await loadProduct(42348)
console.log(charizard.image)
// "https://tcgplayer-cdn.tcgplayer.com/product/42348_400w.jpg"

// Search for products
const pikachus = await searchProducts('pikachu', 3, 20, 0)
pikachus.forEach(p => {
    console.log(p.name, p.image, p.pricing?.marketPrice)
})

// Get all cards in a set
const baseSet = await getProductsByGroup(604)

// Get price history
const history = await getProductPriceHistory(42348, 1, 90)
console.log(history)
// [{ date: '2024-01-01', market: 450.00, low: 400.00, high: 500.00 }, ...]
```

## Image URL Construction

### Manual Construction
```typescript
function getImageURL(productId: number, size: '200w' | '400w' | '600w' = '400w'): string {
    return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_${size}.jpg`
}

// Example
getImageURL(42348, '400w')
// "https://tcgplayer-cdn.tcgplayer.com/product/42348_400w.jpg"
```

### PostgreSQL Function
```sql
-- Already exists in database
SELECT get_product_image_url(42348, '400w');
-- Returns: https://tcgplayer-cdn.tcgplayer.com/product/42348_400w.jpg

-- Use in queries
SELECT
    id,
    name,
    get_product_image_url(id, '200w') as thumbnail,
    get_product_image_url(id, '400w') as image,
    get_product_image_url(id, '600w') as large
FROM products
WHERE id = 42348;
```

## Table Relationships

```
products
├─ category_id → categories.id (3 = Pokemon)
├─ group_id → groups.id (Set/Expansion)
├─ rarity_id → rarities.id
└─ card_type_id → card_types.id

current_prices
└─ product_id → products.id

price_history (partitioned by month)
└─ product_id → products.id

product_translations (multi-language)
└─ product_id → products.id
```

## Common Filters

### By Category
```sql
WHERE p.category_id = 3  -- Pokemon
WHERE p.category_id = 1  -- Magic: The Gathering
WHERE p.category_id = 2  -- Yu-Gi-Oh
```

### By Set/Group
```sql
WHERE p.group_id = 604  -- Base Set
WHERE p.group_id = 1367 -- Sword & Shield
```

### By Card Properties
```sql
WHERE p.hp >= 100            -- HP 100 or more
WHERE p.stage = 'Stage 2'    -- Evolution stage
WHERE p.retreat_cost <= 1    -- Low retreat cost
```

### By Rarity
```sql
JOIN rarities r ON p.rarity_id = r.id
WHERE r.name IN ('Rare Holo', 'Ultra Rare', 'Secret Rare')
```

### By Price Range
```sql
JOIN current_prices cp ON p.id = cp.product_id
WHERE cp.market_price BETWEEN 5000 AND 10000  -- $50-$100
```

## Performance Tips

### Use Indexes
```sql
-- These indexes already exist:
-- idx_products_category (category_id)
-- idx_products_group (group_id)
-- idx_products_name (name)
-- idx_products_card_number (card_number)
-- idx_price_history_product (product_id, recorded_at DESC)
```

### Pagination
```sql
SELECT p.*
FROM products p
WHERE p.category_id = 3
ORDER BY p.group_id, p.card_number
LIMIT 100 OFFSET 0;  -- Page 1
```

### Avoid N+1 Queries
```sql
-- BAD: Query products, then prices separately
SELECT * FROM products WHERE category_id = 3;
-- Then for each product:
SELECT * FROM current_prices WHERE product_id = ?;

-- GOOD: Join in one query
SELECT p.*, cp.market_price
FROM products p
LEFT JOIN current_prices cp ON p.id = cp.product_id
WHERE p.category_id = 3;
```

## Migration Checklist

- [ ] Update CardDB.ts to use products table
- [ ] Add image URL construction to all card responses
- [ ] Create /v2/products endpoints
- [ ] Update search to use products.name instead of cards.name->>'en'
- [ ] Update set listings to use groups table
- [ ] Migrate price lookups to current_prices/price_history
- [ ] Update filters to use normalized tables (rarities, card_types)
- [ ] Add caching for frequently accessed products
- [ ] Update documentation with new schema
- [ ] Add telemetry to track old vs new table usage

## Testing Queries

```sql
-- Test image URL construction
SELECT
    id,
    name,
    get_product_image_url(id, '400w') as image
FROM products
WHERE category_id = 3
LIMIT 5;

-- Test pricing integration
SELECT
    p.name,
    cp.market_price / 100.0 as price_usd,
    cp.recorded_at
FROM products p
JOIN current_prices cp ON p.id = cp.product_id
WHERE p.category_id = 3
ORDER BY cp.market_price DESC
LIMIT 10;

-- Test search
SELECT name, card_number
FROM products
WHERE name ILIKE '%charizard%'
    AND category_id = 3
ORDER BY name
LIMIT 10;

-- Test price history
SELECT
    recorded_at::date,
    market_price / 100.0 as price
FROM price_history
WHERE product_id = 42348
    AND variant_id = 1
    AND recorded_at >= NOW() - INTERVAL '7 days'
ORDER BY recorded_at;
```

## Category IDs Reference

| ID | Category | Products |
|----|----------|----------|
| 1  | Magic: The Gathering | ~400k |
| 2  | Yu-Gi-Oh | ~15k |
| 3  | **Pokemon** | **30,478** |
| 4  | WoW TCG | ~500 |
| ... | ... | ... |

## Quick Stats

```sql
-- Products by category
SELECT
    c.name,
    COUNT(*) as products
FROM products p
JOIN categories c ON p.category_id = c.id
GROUP BY c.name
ORDER BY products DESC;

-- Pokemon products with prices
SELECT
    COUNT(*) as total,
    COUNT(cp.product_id) as with_prices
FROM products p
LEFT JOIN current_prices cp ON p.id = cp.product_id
WHERE p.category_id = 3;

-- Most expensive Pokemon cards
SELECT
    p.name,
    cp.market_price / 100.0 as price_usd
FROM products p
JOIN current_prices cp ON p.id = cp.product_id
WHERE p.category_id = 3
ORDER BY cp.market_price DESC
LIMIT 20;
```
