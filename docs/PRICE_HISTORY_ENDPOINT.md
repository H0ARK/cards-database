# Price History Endpoint Documentation

## Overview

The price history endpoint provides historical TCGPlayer pricing data for Pokémon cards. It returns daily price snapshots from the tcgcsv database.

## Endpoints

There are two URL formats available:

### 1. Global Card ID Format
```
GET /v2/{lang}/cards/{cardId}/history
```

**Example:**
```bash
curl "http://localhost:3000/v2/en/cards/swsh6-230/history?range=monthly"
```

### 2. Set/LocalId Format
```
GET /v2/{lang}/cards/{setId}/{localId}/history
```

**Example:**
```bash
curl "http://localhost:3000/v2/en/cards/swsh6/230/history?range=monthly"
```

## Parameters

### Path Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `lang` | string | Language code (en, fr, de, etc.) | `en` |
| `cardId` | string | Global card ID (format: `{setId}-{localId}`) | `swsh6-230` |
| `setId` | string | Set identifier | `swsh6` |
| `localId` | string | Card number within the set | `230` |

### Query Parameters

| Parameter | Type | Default | Description | Values |
|-----------|------|---------|-------------|--------|
| `range` | string | `yearly` | Time range for historical data | `daily`, `monthly`, `yearly` |
| `variant` | string | `normal` | Card variant to get pricing for | `normal`, `holo`, `reverse`, `pokeball`, `masterball`, etc. |
| `productId` | number | (auto-detected) | Override TCGPlayer product ID | Any valid product ID |

#### Range Values

- **`daily`**: Last 30 days of data
- **`monthly`**: Last 90 days of data  
- **`yearly`**: Last 365 days of data

#### Variant Values

The variant parameter selects which version of the card to get pricing for:

- `normal` - Regular/non-holo version (default)
- `holo` - Holographic version
- `reverse` - Reverse holographic version
- `pokeball` - Pokéball variant (modern sets)
- `masterball` - Master Ball variant (modern sets)
- `firstEdition` - 1st Edition version
- And other variant types as available

If the requested variant doesn't exist, the endpoint will fall back to `normal`, or the first available variant.

## Response Format

### Success Response

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
    },
    // ... more data points
  ]
}
```

### Error Response

```json
{
  "error": "Card not found",
  "cardId": "invalid-card",
  "range": "monthly"
}
```

Or when product ID is missing:

```json
{
  "error": "Product ID required. Pass ?productId=<id> or ensure card has TCGPlayer mapping",
  "cardId": "some-card-id",
  "range": "monthly",
  "availableVariants": ["normal", "holo", "reverse"]
}
```

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `cardId` | string | The global card identifier |
| `productId` | number | TCGPlayer product ID used for this query |
| `range` | string | The time range requested |
| `dataPoints` | number | Number of historical data points returned |
| `lastUpdated` | string | ISO timestamp of when this data was last updated |
| `source` | string | Data source (`tcgcsv` or `realtime`) |
| `history` | array | Array of price data points |
| `history[].date` | string | Date in YYYY-MM-DD format |
| `history[].price` | number | Primary price (usually market price or mid price) |
| `history[].low` | number | Lowest price for that date |
| `history[].high` | number | Highest price for that date |
| `history[].market` | number | Market price for that date |
| `history[].currency` | string | Currency code (always `USD` for TCGPlayer) |

## Examples

### Basic Usage - Monthly History

```bash
curl "http://localhost:3000/v2/en/cards/swsh6-230/history?range=monthly"
```

### Daily Price History

```bash
curl "http://localhost:3000/v2/en/cards/swsh6-230/history?range=daily"
```

### Yearly Price History

```bash
curl "http://localhost:3000/v2/en/cards/swsh6-230/history?range=yearly"
```

### Specific Variant (Pokéball variant)

```bash
curl "http://localhost:3000/v2/en/cards/sv08.5-071/history?variant=pokeball&range=monthly"
```

### Multiple Variants Comparison

To compare different variants of the same card, make multiple requests with different variant parameters:

```bash
# Normal variant
curl "http://localhost:3000/v2/en/cards/sv08.5-071/history?variant=normal"

# Pokéball variant  
curl "http://localhost:3000/v2/en/cards/sv08.5-071/history?variant=pokeball"

# Master Ball variant
curl "http://localhost:3000/v2/en/cards/sv08.5-071/history?variant=masterball"
```

### Manual Product ID Override

If you know the exact TCGPlayer product ID:

```bash
curl "http://localhost:3000/v2/en/cards/swsh6-230/history?productId=241867"
```

## How It Works

1. **Product ID Resolution**: The endpoint first tries to get the TCGPlayer product ID from the card's database record:
   - If the card has `thirdParty.tcgplayer` as an object (new structure), it looks for the requested variant
   - Falls back to `normal` variant if requested variant doesn't exist
   - Falls back to the first available variant if `normal` doesn't exist
   - If `thirdParty.tcgplayer` is a number (old structure), uses that directly

2. **Data Source**: Historical data is loaded from the tcgcsv files:
   - Files are located at: `{TCGCSV_PATH}/price-history/YYYY-MM-DD/3/{setGroupId}/prices`
   - Each file contains pricing for all cards in that set for that date
   - The endpoint scans through date folders to find the requested product

3. **Caching**: Product locations are cached to speed up subsequent requests

4. **Fallback**: If no historical data is found in tcgcsv files, the endpoint attempts to fetch real-time data (if available)

## Database Structure

The card's `third_party` field contains TCGPlayer product IDs:

### New Structure (Variant-based)
```json
{
  "tcgplayer": {
    "normal": 610426,
    "pokeball": 610588,
    "masterball": 610689
  },
  "cardmarket": 794275
}
```

### Old Structure (Single Product ID)
```json
{
  "tcgplayer": 241867,
  "cardmarket": 567264
}
```

The endpoint handles both structures automatically.

## Error Scenarios

| Error | Cause | Solution |
|-------|-------|----------|
| "Card not found" | Invalid card ID | Check the card ID format and existence |
| "Historical data not available" | No tcgcsv data folders found | Ensure tcgcsv data is mounted/available |
| "Product not found in historical database" | Product ID not in any price files | Card may be too new or not sold on TCGPlayer |
| "Product ID required..." | Card has no TCGPlayer mapping | Manually provide `productId` parameter or update card data |

## Notes

- All prices are in USD (TCGPlayer default currency)
- Historical data depends on the tcgcsv database being available and up-to-date
- The `TCGCSV_PATH` environment variable must point to the tcgcsv directory (default: `/usr/src/tcgcsv` in Docker)
- Data points are sorted chronologically from oldest to newest
- Not all cards have historical data (especially very new releases or cards not sold individually)
