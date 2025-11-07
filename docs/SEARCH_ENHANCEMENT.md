# Enhanced Search Functionality - Implementation Summary

## Overview
Enhanced the search functionality to include comprehensive metadata search across cards, sealed products, and packs. Previously, search only matched card names. Now it searches across all relevant metadata fields.

## Changes Made

### 1. QueryBuilder Enhancements (`server/src/libs/QueryBuilder.ts`)

#### New Methods Added:
- **`whereCardMetadataSearch(searchTerm, lang)`**: Comprehensive search across card metadata including:
  - Card names (all languages: en, fr, es, de, it, pt, ja, ko, zh)
  - Illustrator names
  - Rarity
  - Category
  - Types (Pokemon types)
  - Stage (Basic, Stage 1, Stage 2)
  - EvolveFrom (all languages)
  - Description (all languages)
  - Abilities (names and effects)
  - Attacks (names, effects, damage)
  - Item names and effects
  - Trainer/Energy card effects
  - Trainer types
  - Energy types
  - Regulation marks
  - Set names

- **`whereSetMetadataSearch(searchTerm, lang)`**: Search across set metadata:
  - Set names (all languages)
  - Series names (all languages)
  - Set IDs

- **`whereSerieMetadataSearch(searchTerm, lang)`**: Search across series metadata:
  - Series names (all languages)
  - Series IDs

- **`whereSealedProductMetadataSearch(searchTerm, lang)`**: Search across sealed product metadata:
  - Product names (all languages)
  - Product types (booster-box, etb, tin, bundle, etc.)
  - Exclusive retailer names
  - Set names
  - Product IDs

#### Updated Query Builders:
- **`buildCardQuery()`**: Now supports `q` or `search` parameters for comprehensive metadata search
- **`buildSetQuery()`**: Now supports `q` or `search` parameters
- **`buildSerieQuery()`**: New function with search support
- **`buildSealedProductQuery()`**: New function with search support

### 2. New SealedProduct Component (`server/src/V2/Components/SealedProduct.ts`)

Created a new component for handling sealed products:
- `getAllSealedProducts()`: Get all sealed products
- `findSealedProducts()`: Find sealed products with filters
- `findOneSealedProduct()`: Find a single sealed product
- `getSealedProductById()`: Get sealed product by ID
- `getSealedProductsBySetId()`: Get sealed products for a specific set
- `sealedProductToBrief()`: Convert to brief format for listings

### 3. Updated Serie Component (`server/src/V2/Components/Serie.ts`)

- Updated `findSeries()` to use `buildSerieQuery()` for enhanced search support
- Now supports `q` or `search` parameters for searching series names and IDs

### 4. Enhanced Endpoints (`server/src/V2/endpoints/jsonEndpoints.ts`)

#### New Endpoints:
- **`GET /v2/:lang/search?q=<term>`**: Unified search endpoint that searches across:
  - Cards
  - Sets
  - Series
  - Sealed Products
  
  Returns results grouped by category with counts.

- **`GET /v2/:lang/sealed-products`**: List all sealed products
- **`GET /v2/:lang/sealed-products/:id`**: Get specific sealed product
- **`GET /v2/:lang/sealed`**: Alternative endpoint for sealed products
- **`GET /v2/:lang/products`**: Alternative endpoint for sealed products

#### Enhanced Existing Endpoints:
- **`GET /v2/:lang/cards?q=<term>`**: Now searches all card metadata, not just names
- **`GET /v2/:lang/sets?q=<term>`**: Now searches set and series names
- **`GET /v2/:lang/series?q=<term>`**: Now searches series names and IDs

## Search Parameters

### Query Parameters:
- **`q`** or **`search`**: Search term (searches across all metadata)
- **`name`**: Specific name search (backward compatible)
- **`$limit`**: Limit number of results
- **`$page`**: Pagination (requires `$limit`)
- **`$sort`**: Sorting options

### Examples:

```bash
# Unified search across all categories
GET /v2/en/search?q=Pikachu

# Search cards by metadata
GET /v2/en/cards?q=Fire+Blast

# Search cards by illustrator
GET /v2/en/cards?q=Ken+Sugimori

# Search sealed products
GET /v2/en/sealed-products?q=Booster+Box

# Search sets
GET /v2/en/sets?q=Scarlet

# Search with limit
GET /v2/en/search?q=Charizard&$limit=20
```

## Response Format

### Unified Search Response:
```json
{
  "query": "Pikachu",
  "results": {
    "cards": [...],
    "sets": [...],
    "series": [...],
    "sealedProducts": [...]
  },
  "counts": {
    "cards": 10,
    "sets": 2,
    "series": 1,
    "sealedProducts": 0,
    "total": 13
  }
}
```

## Testing

A comprehensive test script is available at `server/test-search.sh` that tests:
- Unified search endpoint
- Card metadata search
- Set search
- Sealed product search
- Series search
- Edge cases and special characters
- Language-specific searches

Run tests with:
```bash
cd server
./test-search.sh
```

Or customize:
```bash
BASE_URL=http://localhost:8080 LANG=en ./test-search.sh
```

## Database Requirements

The implementation uses PostgreSQL with:
- JSONB fields for multi-language support
- GIN indexes on JSONB fields for efficient searching
- Full-text search indexes using `pg_trgm` extension

All required indexes are defined in `migrations/001_initial_schema.sql`.

## Backward Compatibility

All existing endpoints remain functional:
- `GET /v2/:lang/cards?name=<term>` still works (searches card names)
- All existing filters continue to work
- New `q`/`search` parameter is additive, not breaking

## Performance Considerations

- Uses PostgreSQL ILIKE for case-insensitive pattern matching
- Leverages existing GIN indexes on JSONB fields
- Searches are performed in parallel where possible
- Results are limited by default (50 cards, 20 sets, 10 series, 20 sealed products)

## Future Enhancements

Potential improvements:
1. Full-text search using PostgreSQL's `tsvector` for better relevance ranking
2. Search result highlighting
3. Faceted search (filter by type, rarity, etc. within results)
4. Search suggestions/autocomplete
5. Search analytics and popular searches


