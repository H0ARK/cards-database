#!/bin/bash

# Enhanced Search Functionality Test Script
# Tests comprehensive search across cards, sets, series, and sealed products

set -e

BASE_URL="${BASE_URL:-http://localhost:8080}"
LANG="${LANG:-en}"

echo "=================================================="
echo "Testing Enhanced Search Functionality"
echo "Base URL: $BASE_URL"
echo "Language: $LANG"
echo "=================================================="
echo ""

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_endpoint() {
    local description="$1"
    local endpoint="$2"
    local expected_keys="$3"
    
    echo -e "${YELLOW}Testing:${NC} $description"
    echo "Endpoint: $endpoint"
    
    response=$(curl -s "$BASE_URL$endpoint")
    status=$?
    
    if [ $status -ne 0 ]; then
        echo -e "${RED}✗ Failed to connect${NC}"
        return 1
    fi
    
    # Check if response is valid JSON
    if ! echo "$response" | jq . >/dev/null 2>&1; then
        echo -e "${RED}✗ Invalid JSON response${NC}"
        echo "Response: $response"
        return 1
    fi
    
    # Check for expected keys
    if [ -n "$expected_keys" ]; then
        for key in $expected_keys; do
            if echo "$response" | jq -e ".$key" >/dev/null 2>&1; then
                echo -e "  ${GREEN}✓${NC} Found key: $key"
            else
                echo -e "  ${RED}✗${NC} Missing key: $key"
            fi
        done
    fi
    
    # Display result count if available
    if echo "$response" | jq -e '.counts.total' >/dev/null 2>&1; then
        total=$(echo "$response" | jq '.counts.total')
        cards=$(echo "$response" | jq '.counts.cards')
        sets=$(echo "$response" | jq '.counts.sets')
        series=$(echo "$response" | jq '.counts.series')
        sealed=$(echo "$response" | jq '.counts.sealedProducts')
        echo -e "  ${GREEN}Results:${NC} $total total ($cards cards, $sets sets, $series series, $sealed sealed products)"
    elif echo "$response" | jq -e 'length' >/dev/null 2>&1; then
        count=$(echo "$response" | jq 'length')
        echo -e "  ${GREEN}Results:${NC} $count items"
    fi
    
    echo ""
}

echo "=================================================="
echo "1. Unified Search Endpoint Tests"
echo "=================================================="
echo ""

# Test 1: Search by Pokemon name
test_endpoint \
    "Search for 'Pikachu' (should find cards, sets with Pikachu)" \
    "/v2/$LANG/search?q=Pikachu" \
    "query results counts"

# Test 2: Search by illustrator
test_endpoint \
    "Search for illustrator 'Ken Sugimori'" \
    "/v2/$LANG/search?q=Ken+Sugimori" \
    "query results counts"

# Test 3: Search by type
test_endpoint \
    "Search for 'Fire' type" \
    "/v2/$LANG/search?q=Fire" \
    "query results counts"

# Test 4: Search by set name
test_endpoint \
    "Search for 'Base Set'" \
    "/v2/$LANG/search?q=Base+Set" \
    "query results counts"

# Test 5: Search by rarity
test_endpoint \
    "Search for 'Rare Holo' cards" \
    "/v2/$LANG/search?q=Rare+Holo" \
    "query results counts"

echo "=================================================="
echo "2. Cards Endpoint with Enhanced Search"
echo "=================================================="
echo ""

# Test 6: Cards search by name (existing functionality)
test_endpoint \
    "Cards: Search by name 'Charizard'" \
    "/v2/$LANG/cards?name=Charizard" \
    ""

# Test 7: Cards search with comprehensive query
test_endpoint \
    "Cards: Comprehensive search for 'Charizard'" \
    "/v2/$LANG/cards?q=Charizard" \
    ""

# Test 8: Cards search by attack name
test_endpoint \
    "Cards: Search by attack containing 'Fire Blast'" \
    "/v2/$LANG/cards?q=Fire+Blast" \
    ""

# Test 9: Cards search by ability
test_endpoint \
    "Cards: Search by ability" \
    "/v2/$LANG/cards?q=Solar+Power" \
    ""

# Test 10: Cards search by stage
test_endpoint \
    "Cards: Search for 'Stage 2' Pokemon" \
    "/v2/$LANG/cards?q=Stage+2" \
    ""

echo "=================================================="
echo "3. Sets Endpoint with Enhanced Search"
echo "=================================================="
echo ""

# Test 11: Sets search
test_endpoint \
    "Sets: Search for 'Scarlet'" \
    "/v2/$LANG/sets?q=Scarlet" \
    ""

# Test 12: Sets by series
test_endpoint \
    "Sets: Filter by series 'Sword & Shield'" \
    "/v2/$LANG/sets?serie=Sword+%26+Shield" \
    ""

echo "=================================================="
echo "4. Sealed Products Endpoint Tests"
echo "=================================================="
echo ""

# Test 13: All sealed products
test_endpoint \
    "Sealed Products: List all" \
    "/v2/$LANG/sealed-products" \
    ""

# Test 14: Sealed products search
test_endpoint \
    "Sealed Products: Search for 'Booster Box'" \
    "/v2/$LANG/sealed-products?q=Booster+Box" \
    ""

# Test 15: Sealed products by type
test_endpoint \
    "Sealed Products: Filter by type 'etb'" \
    "/v2/$LANG/sealed-products?productType=etb" \
    ""

# Test 16: Alternative sealed endpoint
test_endpoint \
    "Sealed Products: Alternative endpoint '/sealed'" \
    "/v2/$LANG/sealed?q=Elite" \
    ""

echo "=================================================="
echo "5. Series Endpoint with Enhanced Search"
echo "=================================================="
echo ""

# Test 17: Series search
test_endpoint \
    "Series: Search for 'Sword'" \
    "/v2/$LANG/series?q=Sword" \
    ""

echo "=================================================="
echo "6. Edge Cases and Special Searches"
echo "=================================================="
echo ""

# Test 18: Empty search
test_endpoint \
    "Search: Empty query (should return error)" \
    "/v2/$LANG/search" \
    ""

# Test 19: Special characters
test_endpoint \
    "Search: Special characters 'Pokémon'" \
    "/v2/$LANG/search?q=Pok%C3%A9mon" \
    "query results counts"

# Test 20: Numeric search (HP, dex number)
test_endpoint \
    "Search: Numeric value '100'" \
    "/v2/$LANG/search?q=100" \
    "query results counts"

# Test 21: Search with limit
test_endpoint \
    "Search: With limit parameter" \
    "/v2/$LANG/search?q=Pikachu&\$limit=10" \
    "query results counts"

echo "=================================================="
echo "7. Language-Specific Tests"
echo "=================================================="
echo ""

# Test 22: French language search
test_endpoint \
    "Search: French language 'Pikachu'" \
    "/v2/fr/search?q=Pikachu" \
    "query results counts"

# Test 23: Japanese language search
test_endpoint \
    "Search: Japanese language 'ピカチュウ'" \
    "/v2/ja/search?q=%E3%83%94%E3%82%AB%E3%83%81%E3%83%A5%E3%82%A6" \
    "query results counts"

echo "=================================================="
echo "Test Summary"
echo "=================================================="
echo ""
echo -e "${GREEN}All endpoint tests completed!${NC}"
echo ""
echo "Note: Actual results depend on database content."
echo "      Some tests may return empty results if data is not present."
echo ""
echo "To verify the server is running:"
echo "  curl -s $BASE_URL/v2/$LANG/search?q=test | jq"
echo ""




