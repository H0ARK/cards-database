# TCGPlayer Multi-Variant Support

This document explains how the cards database handles multiple TCGPlayer product variants for the same card.

## Overview

Some Pokémon TCG cards have multiple product variants in the TCGPlayer system. For example, cards from sets like **Black Bolt**, **White Flare**, and **Prismatic Evolutions** include special pattern variants:

- **Normal** - Standard card version
- **Poké Ball Pattern** - Cards with Poké Ball pattern design
- **Master Ball Pattern** - Cards with Master Ball pattern design

Each variant has its own unique TCGPlayer product ID and separate pricing.

## Data Structure

All cards now use a **consistent object format** for the `thirdParty.tcgplayer` field, regardless of whether they have one or multiple variants.

### Single Variant Card

```typescript
thirdParty: {
    cardmarket: 725081,
    tcgplayer: {
        normal: 509637
    }
}
```

### Multi-Variant Card

```typescript
thirdParty: {
    cardmarket: 835903,
    tcgplayer: {
        normal: 642450,
        masterball: 642624,
        pokeball: 642696
    }
}
```

## Supported Variant Types

The system recognizes the following variant types:

| Variant Key   | Description                    | Example Sets          |
|---------------|--------------------------------|-----------------------|
| `normal`      | Standard/default version       | All sets              |
| `pokeball`    | Poké Ball pattern variant      | Black Bolt, etc.      |
| `masterball`  | Master Ball pattern variant    | Black Bolt, etc.      |
| `reverse`     | Reverse holofoil               | Various sets          |
| `holo`        | Holofoil                       | Various sets          |
| `etched`      | Etched foil                    | Special releases      |
| `galaxy`      | Galaxy holofoil                | Special releases      |
| `cosmos`      | Cosmos holofoil                | Special releases      |

## How It Works

### 1. Product Detection

The update script (`scripts/update-tcgplayer-ids.ts`) analyzes TCGPlayer product files and detects variants based on product names:

- "Klink (Master Ball Pattern)" → `masterball` variant
- "Klink (Poke Ball Pattern)" → `pokeball` variant
- "Klink" → `normal` variant

### 2. Data Population

When updating card files:

```bash
# Update a single set
bun run scripts/update-tcgplayer-ids.ts "data/Scarlet & Violet/Black Bolt.ts"

# Update all sets
bun run scripts/update-tcgplayer-ids.ts

# Dry run (preview changes)
bun run scripts/update-tcgplayer-ids.ts --dry
```

### 3. Server-Side Pricing

The server provider (`server/src/libs/providers/tcgplayer/official.ts`) handles both:

- **Legacy format**: Single number (backward compatibility)
- **New format**: Object with variant keys

**API Response Example:**

```json
{
  "unit": "USD",
  "updated": "2024-01-15T12:00:00.000Z",
  "normal": {
    "lowPrice": 0.15,
    "midPrice": 0.25,
    "highPrice": 0.35,
    "marketPrice": 0.28,
    "directLowPrice": null
  },
  "pokeball-normal": {
    "lowPrice": 2.50,
    "midPrice": 3.75,
    "highPrice": 5.00,
    "marketPrice": 3.50,
    "directLowPrice": null
  },
  "masterball-normal": {
    "lowPrice": 8.00,
    "midPrice": 12.50,
    "highPrice": 18.00,
    "marketPrice": 11.00,
    "directLowPrice": null
  }
}
```

## Migration & Backward Compatibility

### Legacy Support

The server still supports the old single-number format:

```typescript
// Old format (still works)
tcgplayer: 509637

// New format
tcgplayer: {
    normal: 509637
}
```

### Updating Existing Data

All cards have been migrated to the new object format for consistency. Cards with only one variant use:

```typescript
tcgplayer: {
    normal: 123456
}
```

This ensures:
- **Consistent structure** across all cards
- **Future-proof** for new variants
- **Easy to extend** when patterns are added

## Statistics (Latest Update)

```
Sets Processed:              172
Cards Updated:               10,062
Cards with Multiple Variants: 260
Total Variants Added:        10,532
Cards Not Found:             8,094
```

### Sets with Multiple Variants

Pattern variants (Pokéball/Master Ball) are found in these Scarlet & Violet sets:

| Set Name              | Group ID | Cards with Variants |
|-----------------------|----------|---------------------|
| Black Bolt            | 24325    | 79                  |
| White Flare           | 24326    | 80                  |
| Prismatic Evolutions  | 23821    | 100                 |
| **Total**             |          | **259**             |

All three sets feature both Poké Ball Pattern and Master Ball Pattern variants for select cards.

## Development Guide

### Adding New Variant Types

To add support for a new variant type:

1. **Update variant detection** in `scripts/update-tcgplayer-ids.ts`:

```typescript
function detectVariant(productName: string): string {
    const lower = productName.toLowerCase()
    
    // Add new pattern
    if (lower.includes('custom pattern')) return 'custom'
    
    // ... existing patterns
}
```

2. **Update type definitions** in `scripts/types/tcgplayer-variants.ts`:

```typescript
export type TCGPlayerVariant =
    | 'normal'
    | 'pokeball'
    | 'masterball'
    | 'custom'  // Add new variant
    | string
```

3. **Re-run the update script** to populate new variant data.

### Querying Variants in Code

```typescript
// Get all product IDs
const productIds = Object.values(card.thirdParty.tcgplayer)

// Get specific variant
const pokeballId = card.thirdParty.tcgplayer.pokeball

// Check if variant exists
if ('masterball' in card.thirdParty.tcgplayer) {
    // Has Master Ball variant
}
```

## API Usage Examples

### Getting Prices for All Variants

```typescript
const response = await fetch('/api/v2/cards/sv3-223/prices')
const prices = await response.json()

// Access variant prices
console.log(prices.tcgplayer.normal)        // Normal version price
console.log(prices.tcgplayer['pokeball-normal'])  // Poké Ball pattern price
console.log(prices.tcgplayer['masterball-normal']) // Master Ball pattern price
```

### Filtering Cards by Variant Availability

```typescript
// Find all cards with Master Ball variants
const cardsWithMasterBall = cards.filter(card => 
    typeof card.thirdParty?.tcgplayer === 'object' && 
    'masterball' in card.thirdParty.tcgplayer
)
```

## Future Enhancements

- [ ] Add sealed products database (booster boxes, ETBs, tins)
- [ ] Support Japanese set variants
- [ ] Add UI to display variant pricing separately
- [ ] Create API endpoints to request specific variants
- [ ] Add validation to ensure variant consistency

## Related Files

- `scripts/update-tcgplayer-ids.ts` - Main update script
- `scripts/types/tcgplayer-variants.ts` - Type definitions
- `server/src/libs/providers/tcgplayer/official.ts` - Server pricing provider
- `var/models/tcgplayer/products/*.json` - TCGPlayer product data

## Questions & Support

For questions about TCGPlayer variant support, check:

1. Product files in `var/models/tcgplayer/products/`
2. Run analysis: `bun run scripts/analyze-tcgplayer-products.ts`
3. Check the update log: Run update script with `--dry` flag first
