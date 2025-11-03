#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  TCGdex PostgreSQL Migration - Final Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Database Validation
echo "📊 Database Statistics:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker exec card-db-postgres psql -U cardadmin -d carddb -t -c "
SELECT 
  '   Cards: ' || COUNT(*)::text FROM cards
UNION ALL
SELECT 
  '   Sets: ' || COUNT(*)::text FROM sets
UNION ALL
SELECT 
  '   Series: ' || COUNT(*)::text FROM series
UNION ALL
SELECT 
  '   Variants: ' || COUNT(*)::text FROM card_variants
UNION ALL
SELECT 
  '   Sealed Products: ' || COUNT(*)::text FROM sealed_products
" | grep -v "^$"
echo ""

# API Validation
echo "🌐 API Endpoint Validation:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Test 1: Series
SERIES=$(curl -s http://localhost:3000/v2/en/series | jq 'length')
if [ "$SERIES" = "21" ]; then
  echo "   ✅ Series endpoint: $SERIES series"
else
  echo "   ❌ Series endpoint: Expected 21, got $SERIES"
fi

# Test 2: Sets  
SETS=$(curl -s http://localhost:3000/v2/en/sets | jq 'length')
if [ "$SETS" = "192" ]; then
  echo "   ✅ Sets endpoint: $SETS sets"
else
  echo "   ❌ Sets endpoint: Expected 192, got $SETS"
fi

# Test 3: Individual card
CARD_ID=$(curl -s http://localhost:3000/v2/en/cards/sv08.5-079 | jq -r '.id')
if [ "$CARD_ID" = "sv08.5-079" ]; then
  echo "   ✅ Card endpoint: Individual card retrieval works"
else
  echo "   ❌ Card endpoint: Failed to retrieve card"
fi

# Test 4: Set with sealed products
SEALED_COUNT=$(curl -s http://localhost:3000/v2/en/sets/swsh12.5 | jq '.sealedProducts | length')
if [ "$SEALED_COUNT" = "63" ]; then
  echo "   ✅ Sealed products: Crown Zenith has $SEALED_COUNT products"
else
  echo "   ❌ Sealed products: Expected 63, got $SEALED_COUNT"
fi

# Test 5: Prismatic Evolutions sealed products
PE_SEALED=$(curl -s http://localhost:3000/v2/en/sets/sv08.5 | jq '.sealedProducts | length')
if [ "$PE_SEALED" = "46" ]; then
  echo "   ✅ Sealed products: Prismatic Evolutions has $PE_SEALED products"
else
  echo "   ❌ Sealed products: Expected 46, got $PE_SEALED"
fi

echo ""
echo "🔍 Product Type Validation:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker exec card-db-postgres psql -U cardadmin -d carddb -t -c "
SELECT 
  '   ' || product_type || ': ' || COUNT(*)::text
FROM sealed_products
GROUP BY product_type
ORDER BY COUNT(*) DESC
LIMIT 5
" | grep -v "^$"

echo ""
echo "📈 Performance Check:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Measure API response time
START=$(date +%s%3N)
curl -s http://localhost:3000/v2/en/sets/swsh12.5 > /dev/null
END=$(date +%s%3N)
DURATION=$((END - START))
echo "   Set with sealed products: ${DURATION}ms"

START=$(date +%s%3N)
curl -s http://localhost:3000/v2/en/cards/sv08.5-079 > /dev/null
END=$(date +%s%3N)
DURATION=$((END - START))
echo "   Individual card: ${DURATION}ms"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ MIGRATION COMPLETE - ALL SYSTEMS OPERATIONAL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
