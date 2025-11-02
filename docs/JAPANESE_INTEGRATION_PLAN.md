# Japanese Card Price History Integration Plan

## Problem
- TCGPlayer has Japanese products under category 85 (confirmed in data)
- Example: groupId 23609 = "SV3 Ruler of the Black Flame" has 143 products
- The cards-database repo does NOT have corresponding Japanese card files

## Why Japanese history isn't showing up
1. The repo's card files are organized by set (e.g., `data/Scarlet & Violet/Obsidian Flames/`)
2. Japanese sets aren't in the repo structure
3. Even though TCGCSV prices exist for Japanese products, there's nowhere to link them

## Solutions (in order of effort)

### Option 1: Manual Product JSON Upload (FASTEST)
Since TCGPlayer API blocks automated downloads:
1. You manually provide/paste Japanese product JSON data (like you just did for SV3)
2. I save it to `var/models/tcgplayer/products/japan-23609.json`
3. We create simplified "stub" card files for Japanese sets
4. Run processTCGCSV.ts to generate history files

### Option 2: Heuristic Matching (PARTIAL COVERAGE)
- Some English sets might correspond to Japanese releases
- Match by card number and name similarity
- This will only work for parallel releases, not Japan-exclusive sets

### Option 3: Full Japanese Repo Integration (COMPLETE, LONG-TERM)
- Add Japanese set structure to the repo (data/Japan/SV3/...)
- Create card files with proper metadata
- Link TCGPlayer productIds
- This is the "proper" solution but requires significant data entry

## Recommended Immediate Action
**Let's do Option 1 for the set you care about most:**

1. Tell me which Japanese set(s) you want price history for
2. Provide the product JSON (or I can use the SV3 data you already shared)
3. I'll create minimal card entries and generate history files
4. We can iterate on more sets as needed

What would you like to do?
