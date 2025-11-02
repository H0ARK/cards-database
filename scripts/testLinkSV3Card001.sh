#!/bin/bash
set -e

echo "=========================================="
echo "Test: Link SV3 Card 001 to TCGPlayer"
echo "=========================================="
echo ""

CARD_FILE="data-asia/SV/SV3/001.ts"
PRODUCT_ID="566955"

cd /home/ubuntu/cards-database

echo "1. Checking if card file exists..."
if [ ! -f "$CARD_FILE" ]; then
    echo "ERROR: Card file not found: $CARD_FILE"
    exit 1
fi
echo "   ✓ Found: $CARD_FILE"
echo ""

echo "2. Checking if already linked..."
if grep -q "thirdParty" "$CARD_FILE"; then
    echo "   ⚠ Card already has thirdParty field"
    grep -A 2 "thirdParty" "$CARD_FILE"
    echo ""
    echo "Remove it? (y/n)"
    read -r response
    if [ "$response" = "y" ]; then
        # Create backup
        cp "$CARD_FILE" "$CARD_FILE.backup"
        # Remove thirdParty block
        sed -i '/thirdParty:/,/},/d' "$CARD_FILE"
        echo "   ✓ Removed existing thirdParty field"
    else
        echo "   Skipping - already linked"
        exit 0
    fi
fi
echo ""

echo "3. Adding TCGPlayer product ID ($PRODUCT_ID)..."
# Create backup
cp "$CARD_FILE" "$CARD_FILE.backup.$(date +%s)"

# Add thirdParty field before the closing brace
# Look for the pattern: }\n\nexport default card
# Insert before it
sed -i '/^}$/i\
\
\tthirdParty: {\
\t\ttcgplayer: '"$PRODUCT_ID"'\
\t},' "$CARD_FILE"

echo "   ✓ Added thirdParty field"
echo ""

echo "4. Verifying changes..."
echo "   --- Added lines ---"
grep -A 2 "thirdParty" "$CARD_FILE"
echo ""

echo "5. Rebuilding card data..."
export PATH="$HOME/.bun/bin:$PATH"
bun run build 2>&1 | tail -5
echo ""

echo "6. Running price history processor..."
bun run scripts/processTCGCSV.ts 2>&1 | grep -E "(SV3-001|Processing|Wrote)" | tail -10
echo ""

echo "7. Checking for generated history file..."
HISTORY_FILE="var/models/tcgplayer/history/daily/SV3-001.json"
if [ -f "$HISTORY_FILE" ]; then
    echo "   ✓ SUCCESS! History file created:"
    ls -lh "$HISTORY_FILE"
    echo ""
    echo "   First few entries:"
    head -20 "$HISTORY_FILE"
else
    echo "   ✗ History file not found: $HISTORY_FILE"
    echo ""
    echo "   Checking what history files exist:"
    ls -lh var/models/tcgplayer/history/daily/ | grep SV3 || echo "   No SV3 files found"
fi

echo ""
echo "=========================================="
echo "Test complete!"
echo "=========================================="
