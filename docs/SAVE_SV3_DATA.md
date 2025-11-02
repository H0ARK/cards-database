# How to Save SV3 Product Data

## Quick Test - Manual Single Card (FASTEST WAY TO TEST)

Let's manually link just card 001 to prove it works:

1. Edit the card file:
```bash
cd /home/ubuntu/cards-database
nano data-asia/SV/SV3/001.ts
```

2. Add this BEFORE the closing brace (before `}`):
```typescript
	thirdParty: {
		tcgplayer: 566955
	},
```

3. The file should look like:
```typescript
import { Card } from "../../../interfaces"
import Set from "../SV3"

const card: Card = {
	set: Set,
	name: {
		ja: "ナゾノクサ",
	},
	// ... other fields ...
	retreat: 1,
	regulationMark: "G",

	thirdParty: {
		tcgplayer: 566955
	},
}

export default card
```

4. Save and exit (Ctrl+X, Y, Enter)

5. Rebuild and test:
```bash
export PATH="$HOME/.bun/bin:$PATH"
bun run build
bun run scripts/processTCGCSV.ts
```

6. Check if history file was created:
```bash
ls -lh var/models/tcgplayer/history/daily/SV3-001.json
cat var/models/tcgplayer/history/daily/SV3-001.json
```

If that works, we know the pipeline works for Asian cards!

---

## Full Automation - All SV3 Cards

To link all 141 cards at once, you need to save the full product data.

### Option A: I'll create it for you (EASIEST)

Just tell me "create the SV3 product file" and I'll extract all 141 products from your message and save them.

### Option B: Manual creation

Create the file with the results array from your earlier message:

```bash
cd /home/ubuntu/cards-database
mkdir -p var/models/tcgplayer/products

# Create file (you paste the products array)
nano var/models/tcgplayer/products/japan-23609.json
```

Format:
```json
{
  "groupId": 23609,
  "setName": "Ruler of the Black Flame",
  "setId": "SV3",
  "totalCards": 141,
  "products": [
    {
      "productId": 566955,
      "name": "Oddish",
      "cleanName": "Oddish",
      "categoryId": 85,
      "groupId": 23609,
      "extendedData": [
        {"name": "Number", "value": "001/108"},
        {"name": "Rarity", "value": "Common"}
      ]
    },
    ... paste all 141 products here ...
  ]
}
```

Then run:
```bash
export PATH="$HOME/.bun/bin:$PATH"
bun run scripts/linkAsianCardsWorkflow.ts SV3
```

This will automatically add `thirdParty.tcgplayer` to all matching cards.

---

## What's Next After Linking?

1. **Rebuild data**: `bun run build`
2. **Generate history**: `bun run scripts/processTCGCSV.ts`
3. **Rebuild Docker**: `docker-compose build`
4. **Restart**: `docker-compose up -d`
5. **Test API**: `http://135.148.148.65:3000/api/v2/cards/SV3-001/history?range=daily`

---

## Which approach do you want?

A) Manual test with card 001 only (5 minutes, proves it works)
B) I create the full product file for you (10 minutes, links all 141 cards)
C) You create the product file manually (your effort, but you control it)
