#!/bin/bash

###############################################################################
# Download Missing Price History Archives
#
# This script downloads historical price archives from tcgcsv.com for a
# specific date range. Much faster than full daily-update.sh when you only
# need price data.
#
# Usage:
#   ./download-missing-prices.sh [START_DATE] [END_DATE]
#   ./download-missing-prices.sh 2025-11-02 2025-11-09
#
# If no dates provided, downloads yesterday's prices
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PRICE_HISTORY_DIR="$PROJECT_ROOT/tcgcsv/price-history"
TEMP_DIR="/tmp/tcgplayer-prices-$$"
LOG_FILE="$PROJECT_ROOT/logs/price-download-$(date +%Y%m%d-%H%M%S).log"

# Logging
log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Ensure directories exist
mkdir -p "$PRICE_HISTORY_DIR" "$TEMP_DIR" "$(dirname "$LOG_FILE")"

echo "================================================="
echo "TCGPlayer Price History Downloader"
echo "================================================="
echo ""

# Parse date arguments
if [ $# -eq 0 ]; then
    # Default: yesterday only
    START_DATE=$(date -d "yesterday" +%Y-%m-%d)
    END_DATE=$START_DATE
    log_info "No dates provided, downloading yesterday's prices: $START_DATE"
elif [ $# -eq 1 ]; then
    START_DATE="$1"
    END_DATE="$1"
    log_info "Single date provided: $START_DATE"
elif [ $# -eq 2 ]; then
    START_DATE="$1"
    END_DATE="$2"
    log_info "Date range: $START_DATE to $END_DATE"
else
    log_error "Invalid arguments. Usage: $0 [START_DATE] [END_DATE]"
    exit 1
fi

# Validate dates
if ! date -d "$START_DATE" &>/dev/null; then
    log_error "Invalid start date: $START_DATE"
    exit 1
fi

if ! date -d "$END_DATE" &>/dev/null; then
    log_error "Invalid end date: $END_DATE"
    exit 1
fi

# Check 7zip
if ! command -v 7z &> /dev/null; then
    log_error "7zip not installed. Installing..."
    sudo apt-get update && sudo apt-get install -y p7zip-full
fi

# Function to download and extract single date
download_price_archive() {
    local TARGET_DATE="$1"
    local ARCHIVE_URL="https://tcgcsv.com/archive/tcgplayer/prices-$TARGET_DATE.ppmd.7z"
    local ARCHIVE_FILE="$TEMP_DIR/prices-$TARGET_DATE.ppmd.7z"
    local EXTRACT_DIR="$TEMP_DIR/extracted-$TARGET_DATE"

    log_info "Processing date: $TARGET_DATE"

    # Check if already exists
    if [ -d "$PRICE_HISTORY_DIR/$TARGET_DATE" ]; then
        log_warn "  Price data for $TARGET_DATE already exists. Skipping."
        return 0
    fi

    # Download
    log_info "  Downloading archive..."
    if curl -f -L -o "$ARCHIVE_FILE" "$ARCHIVE_URL" 2>&1 | tee -a "$LOG_FILE"; then
        local SIZE=$(du -h "$ARCHIVE_FILE" | cut -f1)
        log_info "  ✓ Downloaded $SIZE"
    else
        log_warn "  ✗ Archive not available for $TARGET_DATE (may not exist yet)"
        return 1
    fi

    # Extract
    log_info "  Extracting archive..."
    mkdir -p "$EXTRACT_DIR"
    if 7z x "$ARCHIVE_FILE" -o"$EXTRACT_DIR" -y > /dev/null 2>&1; then
        log_info "  ✓ Extracted successfully"
    else
        log_error "  ✗ Failed to extract archive"
        rm -f "$ARCHIVE_FILE"
        return 1
    fi

    # Move to final location
    if [ -d "$EXTRACT_DIR/$TARGET_DATE" ]; then
        log_info "  Moving to $PRICE_HISTORY_DIR/$TARGET_DATE"
        mv "$EXTRACT_DIR/$TARGET_DATE" "$PRICE_HISTORY_DIR/"
        log_info "  ✓ Price data ready for $TARGET_DATE"

        # Count price files
        local PRICE_COUNT=$(find "$PRICE_HISTORY_DIR/$TARGET_DATE" -name "prices" -type f | wc -l)
        log_info "  📊 Found $PRICE_COUNT price files"
    else
        log_error "  ✗ Extracted directory not found"
        return 1
    fi

    # Cleanup
    rm -f "$ARCHIVE_FILE"
    rm -rf "$EXTRACT_DIR"

    return 0
}

# Import function
import_prices_to_db() {
    log_info ""
    log_info "================================================="
    log_info "Importing prices to database..."
    log_info "================================================="

    cd "$PROJECT_ROOT"

    if [ -f "scripts/migrate-price-history.ts" ]; then
        log_info "Running migrate-price-history.ts..."
        if bun run scripts/migrate-price-history.ts 2>&1 | tee -a "$LOG_FILE"; then
            log_info "✓ Price import completed"
            return 0
        else
            log_error "✗ Price import failed (check logs)"
            return 1
        fi
    else
        log_warn "migrate-price-history.ts not found, skipping database import"
        return 1
    fi
}

# Main loop - download all dates in range
echo ""
log_info "================================================="
log_info "Downloading price archives..."
log_info "================================================="

CURRENT_DATE="$START_DATE"
SUCCESS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

while [ "$CURRENT_DATE" != "$(date -d "$END_DATE + 1 day" +%Y-%m-%d)" ]; do
    if download_price_archive "$CURRENT_DATE"; then
        if [ -d "$PRICE_HISTORY_DIR/$CURRENT_DATE" ]; then
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        else
            SKIP_COUNT=$((SKIP_COUNT + 1))
        fi
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    CURRENT_DATE=$(date -d "$CURRENT_DATE + 1 day" +%Y-%m-%d)
    sleep 1  # Be nice to the server
done

echo ""
log_info "================================================="
log_info "Download Summary"
log_info "================================================="
log_info "✓ Success: $SUCCESS_COUNT"
log_info "⊗ Skipped: $SKIP_COUNT (already existed)"
log_info "✗ Failed:  $FAIL_COUNT"

# Import to database
if [ $SUCCESS_COUNT -gt 0 ]; then
    import_prices_to_db

    # Update database stats
    log_info ""
    log_info "Updating database statistics..."
    docker exec card-db-postgres psql -U cardadmin -d carddb -c "VACUUM ANALYZE price_history;" 2>&1 | tee -a "$LOG_FILE"
fi

# Cleanup temp directory
rm -rf "$TEMP_DIR"

# Final stats
echo ""
log_info "================================================="
log_info "Complete!"
log_info "================================================="

if [ $SUCCESS_COUNT -gt 0 ]; then
    log_info "New price data available for $SUCCESS_COUNT day(s)"
    log_info ""
    log_info "Verify with:"
    log_info "  curl https://api.rippzz.com/v2/status/data | jq '.lastUpdated.prices'"
    log_info ""
    log_info "Check database:"
    log_info "  docker exec card-db-postgres psql -U cardadmin -d carddb -c \"SELECT MAX(recorded_at) FROM price_history;\""
fi

log_info ""
log_info "Log saved to: $LOG_FILE"

exit 0
