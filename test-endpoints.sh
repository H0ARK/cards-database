#!/bin/bash

echo "===== TCGdex API Endpoint Validation ====="
echo ""

# Test 1: Status page
echo "1. Testing /status endpoint..."
STATS=$(curl -s http://localhost:3000/status | grep -oP 'stat-value">\K[^<]+' | head -5)
echo "   ✓ Cards: $(echo "$STATS" | sed -n '1p')"
echo "   ✓ Sets: $(echo "$STATS" | sed -n '2p')"
echo "   ✓ Series: $(echo "$STATS" | sed -n '3p')"
echo "   ✓ Variants: $(echo "$STATS" | sed -n '4p')"
echo "   ✓ Sealed Products: $(echo "$STATS" | sed -n '5p')"
echo ""

# Test 2: Series endpoint
echo "2. Testing /v2/en/series endpoint..."
SERIES_COUNT=$(curl -s http://localhost:3000/v2/en/series | jq 'length')
echo "   ✓ Series count: $SERIES_COUNT"
echo ""

# Test 3: Sets endpoint
echo "3. Testing /v2/en/sets endpoint..."
SETS_COUNT=$(curl -s http://localhost:3000/v2/en/sets | jq 'length')
echo "   ✓ Sets count: $SETS_COUNT"
echo ""

# Test 4: Cards endpoint (brief)
echo "4. Testing /v2/en/cards endpoint (sample)..."
CARDS_SAMPLE=$(curl -s http://localhost:3000/v2/en/cards | jq '.[0] | {id, name: .name.en, set: .set.id}')
echo "   ✓ Sample card:"
echo "$CARDS_SAMPLE" | sed 's/^/      /'
echo ""

# Test 5: Individual card with pricing
echo "5. Testing individual card /v2/en/cards/sv08.5-079..."
CARD=$(curl -s http://localhost:3000/v2/en/cards/sv08.5-079 | jq '{id, name: .name.en, hp, types, rarity}')
echo "   ✓ Card details:"
echo "$CARD" | sed 's/^/      /'
echo ""

# Test 6: Set with sealed products
echo "6. Testing set with sealed products /v2/en/sets/swsh12.5..."
SET=$(curl -s http://localhost:3000/v2/en/sets/swsh12.5 | jq '{id, name, sealedCount: (.sealedProducts | length)}')
echo "   ✓ Set details:"
echo "$SET" | sed 's/^/      /'
echo ""

# Test 7: Sealed products sample
echo "7. Testing sealed products for Prismatic Evolutions..."
SEALED=$(curl -s http://localhost:3000/v2/en/sets/sv08.5 | jq '.sealedProducts[0:2]')
echo "   ✓ Sample sealed products:"
echo "$SEALED" | sed 's/^/      /'
echo ""

echo "===== All Tests Complete ====="
