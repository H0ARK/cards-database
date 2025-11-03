# Price History Endpoint Fix - Summary

## Issues

The frontend was trying to fetch price history data from the API, but there were multiple issues:

### Issue 1: Endpoint Not Working
The logs showed:
```
🔍 Fetching PriceCharting data for: Welcoming Lantern
```

The API was returning errors because:
1. The `getCompiledCard()` function was not implemented (returned `null`)
2. The tcgcsv path resolution was incorrect for Docker environments
3. The new database structure uses variant-based product IDs (objects) instead of single product IDs (numbers)

### Issue 2: Variant Prices Not Differentiated
Old structure cards (with single product ID) were returning the **same price** for all variants (normal, reverse holofoil, etc.) in the history endpoint, even though the card detail endpoint showed different prices for each variant.

Example: A card showing $2.18 for normal and $10.04 for reverse holofoil in the card endpoint would return the same $2.18 price for both variants in the history endpoint.

## Changes Made

### 1. Implemented `getCompiledCard()` Function

**File:** `server/src/V2/Components/Card.ts`

Changed from a stub that returned `null` to an async function that:
- Queries the database for card data
- Returns card information including `thirdParty` field with TCGPlayer product IDs
- Extracts language-specific card name

```typescript
export async function getCompiledCard(lang: SupportedLanguages, id: string): Promise<any> {
	// Now actually queries the database and returns card data
	// Including thirdParty.tcgplayer with variant-based product IDs
}
```

### 2. Updated Price History Endpoint

**File:** `server/src/V2/endpoints/jsonEndpoints.ts`

#### Added Variant Support
- Added `variant` query parameter (defaults to `"normal"`)
- Updated both history routes to pass variant parameter
- Function signature changed:
  ```typescript
  async function getCardPriceHistory(
  	lang: string,
  	cardId: string,
  	range: string = "monthly",
  	productId?: number,
  	variant: string = "normal"  // NEW
  )
  ```

#### Fixed Product ID Resolution
- Made the `getCompiledCard()` call async (added `await`)
- Added logic to handle both product ID structures:
  - **New structure (object)**: `{ "normal": 610426, "pokeball": 610588, "masterball": 610689 }`
  - **Old structure (number)**: `241867`
- Implements fallback logic: requested variant → normal → first available variant

#### Fixed tcgcsv Path Resolution
- Changed from hardcoded relative path `../tcgcsv` to environment variable
- Now uses: `process.env.TCGCSV_PATH || path.resolve(process.cwd(), "../tcgcsv")`
- Properly constructs path to `price-history` subdirectory
- Works correctly in Docker where tcgcsv is mounted at `/usr/src/tcgcsv`

#### Added Variant Filtering
- Created `variantToSubTypeName()` function to map variant parameters to tcgcsv format
- Updated history collection to filter by both `productId` AND `subTypeName`
- Prevents returning wrong variant's pricing when multiple variants share same product ID
- Mapping examples:
  - `"normal"` → `"Normal"`
  - `"reverse-holofoil"` → `"Reverse Holofoil"`
  - `"holo"` → `"Holofoil"`
  - `"pokeball"` → `"Pokeball"`

### 3. Error Handling Improvements

Added helpful error messages:
- Returns `availableVariants` in error response when product ID can't be found
- Users can see which variants are available for the card
- Allows manual override with `productId` query parameter

## Data Structure

### Card Third-Party Field

Cards in the database have a `third_party` JSONB field:

**New Structure (variant-based):**
```json
{
  "tcgplayer": {
    "normal": 241867,
    "holo": 241868,
    "reverse": 241869
  },
  "cardmarket": 567264
}
```

**Old Structure (single product ID):**
```json
{
  "tcgplayer": 89792,
  "cardmarket": 275992
}
```

### Set Metadata

Sets have `metadata.third_party.tcgplayer` with the set group ID:

```json
{
  "third_party": {
    "tcgplayer": 2807,
    "cardmarket": 4174
  }
}
```

### tcgcsv Price File Structure

For old structure cards, the tcgcsv files contain **multiple entries** for the same product ID with different `subTypeName` values:

```json
{
  "results": [
    {
      "productId": 89792,
      "subTypeName": "Normal",
      "lowPrice": 1.75,
      "marketPrice": 2.18
    },
    {
      "productId": 89792,
      "subTypeName": "Reverse Holofoil",
      "lowPrice": 7.99,
      "marketPrice": 10.04
    }
  ]
}
```

This is why variant filtering by `subTypeName` is essential.

## How It Works Now

1. **Request comes in**: `/v2/en/cards/swsh6-230/history?range=monthly&variant=normal`

2. **Product ID Resolution**:
   - Calls `getCompiledCard()` to get card data
   - Extracts `thirdParty.tcgplayer` object
   - Looks for the requested variant (`normal`)
   - Falls back to `normal` if requested variant doesn't exist
   - Falls back to first available variant if `normal` doesn't exist

3. **Find Historical Data**:
   - Scans tcgcsv directory at `{TCGCSV_PATH}/price-history/`
   - Finds date folders (format: `YYYY-MM-DD`)
   - Uses `findProductLocation()` to locate the product in category 3 (Pokémon)
   - Reads price files from set group directories

4. **Collect Data**:
   - Based on `range` parameter, collects last N days of data:
     - `daily`: 30 days
     - `monthly`: 90 days
     - `yearly`: 365 days
   - Extracts pricing for the specific product ID

5. **Filter by Variant**:
   - Maps variant parameter to tcgcsv `subTypeName` format
   - Filters results by both `productId` AND `subTypeName`
   - Ensures correct variant pricing is returned

6. **Return Response**:
   - Returns array of historical price points with date, price, low, high, market
   - Includes metadata: cardId, productId, range, dataPoints, lastUpdated, source

## Testing Results

### ✅ Basic History Request
```bash
curl "http://localhost:3000/v2/en/cards/swsh6-230/history?range=monthly"
```
**Result:** Returns 90 data points with product ID 241867

### ✅ Daily Range
```bash
curl "http://localhost:3000/v2/en/cards/swsh6-230/history?range=daily"
```
**Result:** Returns 30 data points

### ✅ Yearly Range
```bash
curl "http://localhost:3000/v2/en/cards/swsh6-230/history?range=yearly"
```
**Result:** Returns 365 data points

### ✅ Multiple Variants
Card `sv08.5-071` has 3 variants:
- `normal`: 610426
- `pokeball`: 610588
- `masterball`: 610689

```bash
curl "http://localhost:3000/v2/en/cards/sv08.5-071/history?variant=pokeball"
```
**Result:** Returns history for product ID 610588 (pokeball variant)

### ✅ Default Variant
```bash
curl "http://localhost:3000/v2/en/cards/sv08.5-071/history"
```
**Result:** Returns history for product ID 610426 (normal variant - the default)

### ✅ Alternate Route Format
```bash
curl "http://localhost:3000/v2/en/cards/swsh6/230/history"
```
**Result:** Same as global ID format, returns history for swsh6-230

## API Response Examples

### New Structure Card (Single Variant)
```json
{
  "cardId": "swsh6-230",
  "productId": 241867,
  "range": "monthly",
  "dataPoints": 90,
  "lastUpdated": "2025-11-03T03:33:16.610Z",
  "source": "tcgcsv",
  "history": [
    {
      "date": "2025-08-04",
      "price": 2.56,
      "low": 1.99,
      "high": 57.05,
      "market": 2.56,
      "currency": "USD"
    }
    // ... more data points
  ]
}
```

### Old Structure Card - Different Variants, Same Product ID

**Normal Variant:**
```bash
GET /v2/en/cards/ex4-15/history?variant=normal
```
```json
{
  "cardId": "ex4-15",
  "productId": 89792,
  "history": [
    {
      "date": "2025-10-03",
      "price": 2.22,
      "low": 1.71,
      "high": 3.42,
      "market": 2.22
    }
  ]
}
```

**Reverse Holofoil Variant:**
```bash
GET /v2/en/cards/ex4-15/history?variant=reverse-holofoil
```
```json
{
  "cardId": "ex4-15",
  "productId": 89792,
  "history": [
    {
      "date": "2025-10-03",
      "price": 9.35,
      "low": 7.99,
      "high": 14.99,
      "market": 9.35
    }
  ]
}
```

Note: Same product ID (89792), but different prices based on variant parameter!

## Files Modified

1. **server/src/V2/Components/Card.ts**
   - Implemented `getCompiledCard()` function

2. **server/src/V2/endpoints/jsonEndpoints.ts**
   - Added variant parameter support
   - Fixed tcgcsv path resolution
   - Updated product ID resolution logic
   - Made getCompiledCard call async

## Files Created

1. **docs/PRICE_HISTORY_ENDPOINT.md**
   - Complete API documentation
   - Usage examples
   - Parameter descriptions

2. **scripts/check-card-thirdparty.ts**
   - Utility script to inspect card third-party data
   - Helps verify database structure

3. **docs/PRICE_HISTORY_FIX.md** (this file)
   - Summary of changes and implementation

## Environment Variables

The endpoint requires:
- `TCGCSV_PATH`: Path to tcgcsv directory (default: `/usr/src/tcgcsv` in Docker)

Set in `docker-compose.yml`:
```yaml
environment:
  - TCGCSV_PATH=/usr/src/tcgcsv
```

## Next Steps

The price history endpoint is now fully functional. The frontend can:

1. **Fetch basic history**: `GET /v2/en/cards/{cardId}/history`
2. **Choose time range**: Add `?range=daily|monthly|yearly`
3. **Select variant**: Add `?variant=normal|holo|reverse-holofoil|pokeball|masterball`
4. **Override product ID**: Add `?productId=123456` if needed

The endpoint returns comprehensive price history data from tcgcsv files, with:
- ✅ Proper variant differentiation (no more duplicate prices!)
- ✅ Correct filtering by both product ID and variant type
- ✅ Support for both old and new card structures
- ✅ Proper fallback handling and error messages

## Verification

To verify variant pricing is working correctly:

```bash
# Card detail shows different prices for each variant
curl "http://localhost:3000/v2/en/cards/ex4-15" | jq '.pricing.tcgplayer'
# Returns: normal ($2.18), reverse-holofoil ($10.04)

# History endpoint now returns correct prices per variant
curl "http://localhost:3000/v2/en/cards/ex4-15/history?variant=normal"
# Returns: ~$2.22 market price

curl "http://localhost:3000/v2/en/cards/ex4-15/history?variant=reverse-holofoil"
# Returns: ~$9.35 market price (correctly different!)
```
