# Old Structure Pricing Fix - Summary

## Issue

Cards with the old third-party structure (single product ID number) were showing `null` for TCGPlayer pricing, even though they had valid product IDs and pricing data was available in tcgcsv.

### Example Card
```json
{
  "id": "ex4-15",
  "name": "Team Aqua's Mightyena",
  "third_party": {
    "tcgplayer": 89792,  // Single number (old structure)
    "cardmarket": 275992
  }
}
```

This card was returning:
```json
{
  "pricing": {
    "cardmarket": { /* ... data ... */ },
    "tcgplayer": null  // ❌ NULL despite having product ID
  }
}
```

## Root Cause

The `getTCGPlayerPrice()` function in `server/src/libs/providers/tcgplayer/fallback.ts` had two code paths:

1. **New Structure (variant-based)**: ✅ Fully implemented
   ```typescript
   if (typeof card.thirdParty.tcgplayer === 'object') {
     // Load pricing for each variant
   }
   ```

2. **Old Structure (single product ID)**: ❌ Not implemented
   ```typescript
   // FALLBACK: Try old structure using set group ID from set metadata
   const setGroupId = card.set?.metadata?.third_party?.tcgplayer
   if (!setGroupId || typeof setGroupId !== 'number') {
     return null
   }
   
   // We would need to load the set's price file and find this card by number
   // For now, just return null as this is a fallback for unmigrated cards
   return null  // ❌ Always returned null!
   ```

## Solution

Implemented the fallback handler for old structure cards:

### File Modified
`server/src/libs/providers/tcgplayer/fallback.ts`

### Implementation
```typescript
// FALLBACK: Old structure - single product ID number
if (card.thirdParty?.tcgplayer && typeof card.thirdParty.tcgplayer === 'number') {
  const productId = card.thirdParty.tcgplayer as number
  const setGroupId = card.set?.metadata?.third_party?.tcgplayer

  if (!setGroupId || typeof setGroupId !== 'number') {
    return null
  }

  // Load all pricing for this set
  const setProductMap = await loadPricingForSet(setGroupId)
  if (!setProductMap) {
    return null
  }

  // Find pricing for this specific product ID
  const productPricing = setProductMap[productId]
  if (!productPricing) {
    return null
  }

  const result = {
    updated: (lastUpdate ?? lastFetch).toISOString(),
    unit: 'USD',
  }

  // Map all variant types from the product pricing to the result
  for (const [variantType, priceData] of Object.entries(productPricing)) {
    const normalizedKey = variantType.toLowerCase().replaceAll(' ', '-')
    result[normalizedKey] = priceData
  }

  return result
}
```

## How It Works

1. **Detect Old Structure**: Check if `thirdParty.tcgplayer` is a number
2. **Get Set Group ID**: Extract from `set.metadata.third_party.tcgplayer`
3. **Load Set Pricing**: Use existing `loadPricingForSet()` function
4. **Find Product**: Look up the specific product ID in the set's pricing map
5. **Map Variants**: Add all available variant types to the result

## Results

### Before Fix
```json
{
  "id": "ex4-15",
  "pricing": {
    "tcgplayer": null  // ❌
  }
}
```

### After Fix
```json
{
  "id": "ex4-15",
  "pricing": {
    "tcgplayer": {
      "updated": "2025-11-01T00:00:00.000Z",
      "unit": "USD",
      "normal": {
        "lowPrice": 1.75,
        "midPrice": 2.16,
        "highPrice": 4.92,
        "marketPrice": 2.18,
        "directLowPrice": 4.92
      },
      "reverse-holofoil": {
        "lowPrice": 7.99,
        "midPrice": 10.13,
        "highPrice": 14.99,
        "marketPrice": 10.04,
        "directLowPrice": null
      }
    }
  }
}
```

### History Endpoint Also Works
```bash
curl "http://localhost:3000/v2/en/cards/ex4-15/history?range=daily"
```

```json
{
  "cardId": "ex4-15",
  "productId": 89792,
  "dataPoints": 30,
  "history": [
    {
      "date": "2025-10-03",
      "price": 2.22,
      "low": 1.71,
      "high": 3.42,
      "market": 2.22,
      "currency": "USD"
    }
    // ... more data points
  ]
}
```

## Testing Results

### ✅ Old Structure (Single Product ID)
- Card: `ex4-15` with product ID `89792`
- Pricing: ✅ Returns `normal` and `reverse-holofoil` variants
- History: ✅ Returns 30 days of data

### ✅ New Structure (Variant Object)
- Card: `swsh6-230` with `{ "normal": 241867 }`
- Pricing: ✅ Returns `normal` variant
- History: ✅ Returns 30 days of data

### ✅ Multiple Variants (New Structure)
- Card: `sv08.5-071` with `{ "normal": 610426, "pokeball": 610588, "masterball": 610689 }`
- Pricing: ✅ Returns all 3 variants
- History: ✅ Returns data for each variant separately

## Database Structures Supported

### Old Structure (Pre-Migration)
```json
{
  "third_party": {
    "tcgplayer": 89792,  // Single number
    "cardmarket": 275992
  }
}
```

### New Structure (Post-Migration)
```json
{
  "third_party": {
    "tcgplayer": {
      "normal": 241867,
      "holo": 241868,
      "reverse": 241869
    },
    "cardmarket": 567264
  }
}
```

**Both structures now work correctly!** ✅

## Impact

This fix ensures that:
- ✅ All cards with TCGPlayer product IDs get pricing data
- ✅ No breaking changes to existing cards
- ✅ Backward compatibility with unmigrated cards
- ✅ History endpoint works for both structures
- ✅ Frontend receives consistent pricing data

## Statistics

Using the database, we can check how many cards use each structure:

```sql
-- Old structure (single number)
SELECT COUNT(*) 
FROM cards 
WHERE jsonb_typeof(third_party->'tcgplayer') = 'number';

-- New structure (variant object)
SELECT COUNT(*) 
FROM cards 
WHERE jsonb_typeof(third_party->'tcgplayer') = 'object';
```

Both types are now fully supported with pricing and history data.
