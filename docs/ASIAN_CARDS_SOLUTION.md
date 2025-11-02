# Asian Cards + TCGPlayer Integration - COMPLETE SOLUTION

## Discovery
✓ The repo HAS 11,054 Asian card files in `data-asia/`
✓ SV3 exists at `data-asia/SV/SV3/` with 108+ cards
✓ These cards DO NOT have `thirdParty.tcgplayer` IDs yet
✓ TCGPlayer DOES have Japanese products (group 85, groupId 23609 for SV3)

## The Missing Link
Asian cards need TCGPlayer product IDs added so they can be linked to price history.

## Solution Steps

### 1. Save TCGPlayer Product Data
Save the product JSON you provided to:
`var/models/tcgplayer/products/japan-23609.json`

Format:
```json
[
  {
    "productId": 566955,
    "extendedData": [
      {"name": "Number", "value": "001/108"},
      ...
    ]
  },
  ...
]
```

### 2. Run Linking Script
The script will:
- Read product data
- Match card number (001.ts) to product number (001/108)
- Add `thirdParty: { tcgplayer: 566955 }` to each card file

### 3. Rebuild Data
After linking, rebuild the JSON data:
```bash
export PATH="$HOME/.bun/bin:$PATH"
bun run build
```

### 4. Re-run Price History
```bash
bun run scripts/processTCGCSV.ts
```
This will now find Asian cards with TCGPlayer IDs and generate history files.

### 5. Rebuild Docker & Test
```bash
docker-compose build
docker-compose up -d
```

Test: http://135.148.148.65:3000/api/v2/cards/SV3-001/history?range=daily

## Next Action
Would you like me to:
A) Create the linking script and walk you through pasting the product JSON
B) Show you how to extract all 143 products from your message into the JSON file
C) Do a test run with just card 001 to prove it works
