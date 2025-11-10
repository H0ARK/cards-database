#!/bin/bash

###############################################################################
# TCGPlayer Daily Data Update Script
#
# This script downloads the latest TCGPlayer data from TCGCSV and updates
# the database with new products, groups, and price history.
#
# Usage:
#   ./daily-update.sh [--force] [--skip-prices] [--skip-history]
#
# Options:
#   --force          Force update even if data is recent
#   --skip-prices    Skip current price updates
#   --skip-history   Skip price history download
#   --date YYYY-MM-DD Download specific date's history
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TCGCSV_DIR="$PROJECT_ROOT/tcgcsv"
PRICE_HISTORY_DIR="$TCGCSV_DIR/price-history"
TEMP_DIR="/tmp/tcgplayer-update"
LOG_FILE="$PROJECT_ROOT/logs/daily-update-$(date +%Y%m%d).log"
DB_HOST="${DB_HOST:-card-db-postgres}"
DB_NAME="${DB_NAME:-carddb}"
DB_USER="${DB_USER:-cardadmin}"

# Parse arguments
FORCE_UPDATE=false
SKIP_PRICES=false
SKIP_HISTORY=false
SPECIFIC_DATE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE_UPDATE=true
            shift
            ;;
        --skip-prices)
            SKIP_PRICES=true
            shift
            ;;
        --skip-history)
            SKIP_HISTORY=true
            shift
            ;;
        --date)
            SPECIFIC_DATE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_step() {
    echo -e "\n${BLUE}===================================================${NC}" | tee -a "$LOG_FILE"
    echo -e "${BLUE}$1${NC}" | tee -a "$LOG_FILE"
    echo -e "${BLUE}===================================================${NC}\n" | tee -a "$LOG_FILE"
}

# Ensure directories exist
mkdir -p "$TCGCSV_DIR" "$PRICE_HISTORY_DIR" "$TEMP_DIR" "$(dirname "$LOG_FILE")"

log_step "Starting TCGPlayer Daily Update"

###############################################################################
# Step 1: Check if update is needed
###############################################################################

check_last_update() {
    log_info "Checking last update time..."

    if [ -f "$TCGCSV_DIR/product-download-summary.json" ]; then
        LAST_UPDATE=$(jq -r '.downloadedAt' "$TCGCSV_DIR/product-download-summary.json")
        LAST_UPDATE_TIMESTAMP=$(date -d "$LAST_UPDATE" +%s 2>/dev/null || echo 0)
        CURRENT_TIMESTAMP=$(date +%s)
        HOURS_SINCE=$((($CURRENT_TIMESTAMP - $LAST_UPDATE_TIMESTAMP) / 3600))

        log_info "Last update: $LAST_UPDATE ($HOURS_SINCE hours ago)"

        if [ "$FORCE_UPDATE" = false ] && [ $HOURS_SINCE -lt 12 ]; then
            log_warn "Data was updated less than 12 hours ago. Use --force to override."
            return 1
        fi
    else
        log_info "No previous update found. Performing first-time download."
    fi

    return 0
}

if ! check_last_update; then
    log_info "Skipping update (data is recent)"
    exit 0
fi

###############################################################################
# Step 2: Download Categories, Groups, and Products
###############################################################################

log_step "Step 1: Downloading TCGPlayer Metadata"

download_metadata() {
    log_info "Running download-products.js..."
    cd "$SCRIPT_DIR"
    node download-products.js 2>&1 | tee -a "$LOG_FILE"

    if [ $? -eq 0 ]; then
        log_info "✓ Metadata download complete"
        return 0
    else
        log_error "✗ Metadata download failed"
        return 1
    fi
}

if ! download_metadata; then
    log_error "Failed to download metadata. Exiting."
    exit 1
fi

###############################################################################
# Step 3: Download Current Prices (DISABLED - Use archives only)
###############################################################################

# NOTE: Downloading from live API creates bloated files with wrapper JSON
# We rely on the archive downloads instead which are compressed and efficient
if [ "$SKIP_PRICES" = false ]; then
    log_info "Skipping live API price downloads (using archives only to avoid bloat)"
else
    log_info "Skipping current prices download (--skip-prices)"
fi

###############################################################################
# Step 4: Download Price History Archive
###############################################################################

if [ "$SKIP_HISTORY" = false ]; then
    log_step "Step 3: Downloading Price History Archive"

    download_price_history() {
        # Determine which dates to download
        if [ -n "$SPECIFIC_DATE" ]; then
            DATES_TO_TRY=("$SPECIFIC_DATE")
            log_info "Downloading price history for specific date: $SPECIFIC_DATE"
        else
            # Try today first, then yesterday (archives are usually available within hours)
            TODAY=$(date +%Y-%m-%d)
            YESTERDAY=$(date -d "yesterday" +%Y-%m-%d)
            DATES_TO_TRY=("$TODAY" "$YESTERDAY")
            log_info "Will try downloading: today ($TODAY) and yesterday ($YESTERDAY)"
        fi

        # Try each date until we find one that works
        for TARGET_DATE in "${DATES_TO_TRY[@]}"; do
            # Check if already downloaded
            if [ -d "$PRICE_HISTORY_DIR/$TARGET_DATE" ] && [ "$FORCE_UPDATE" = false ]; then
                log_info "Price history for $TARGET_DATE already exists. Skipping."
                continue
            fi

            ARCHIVE_URL="https://tcgcsv.com/archive/tcgplayer/prices-$TARGET_DATE.ppmd.7z"
            ARCHIVE_FILE="$TEMP_DIR/prices-$TARGET_DATE.ppmd.7z"
            EXTRACT_DIR="$TEMP_DIR/extracted-$TARGET_DATE"

            # Download archive
            log_info "Downloading archive for $TARGET_DATE: $ARCHIVE_URL"
            if curl -f -o "$ARCHIVE_FILE" "$ARCHIVE_URL" 2>&1 | tee -a "$LOG_FILE"; then
                log_info "✓ Downloaded $(du -h "$ARCHIVE_FILE" | cut -f1) archive"
            else
                log_warn "✗ Archive not available for $TARGET_DATE (trying next date...)"
                continue
            fi

        # Check if 7z is installed
        if ! command -v 7z &> /dev/null; then
            log_error "7zip is not installed. Installing..."
            sudo apt-get update && sudo apt-get install -y p7zip-full
        fi

        # Extract archive
        log_info "Extracting archive..."
        mkdir -p "$EXTRACT_DIR"
        if 7z x "$ARCHIVE_FILE" -o"$EXTRACT_DIR" -y > /dev/null 2>&1; then
            log_info "✓ Archive extracted successfully"
        else
            log_error "✗ Failed to extract archive"
            return 1
        fi

        # Move extracted data to price history directory
        if [ -d "$EXTRACT_DIR/$TARGET_DATE" ]; then
            log_info "Moving price data to $PRICE_HISTORY_DIR/$TARGET_DATE"
            mv "$EXTRACT_DIR/$TARGET_DATE" "$PRICE_HISTORY_DIR/"
            log_info "✓ Price history for $TARGET_DATE ready"
        else
            log_error "✗ Extracted directory not found"
            return 1
        fi

            # Cleanup
            rm -f "$ARCHIVE_FILE"
            rm -rf "$EXTRACT_DIR"

            log_info "✓ Successfully downloaded and extracted price history for $TARGET_DATE"
            return 0
        done

        log_warn "Could not download price history for any of the attempted dates"
        return 1
    }

    download_price_history
else
    log_info "Skipping price history download (--skip-history)"
fi

###############################################################################
# Step 5: Import Data into Database
###############################################################################

log_step "Step 4: Importing Data into Database"

import_to_database() {
    log_info "Running import-tcgplayer-metadata.ts..."
    cd "$PROJECT_ROOT"

    if bun run scripts/import-tcgplayer-metadata.ts 2>&1 | tee -a "$LOG_FILE"; then
        log_info "✓ Metadata imported successfully"
    else
        log_error "✗ Failed to import metadata"
        return 1
    fi

    # Import price history if we downloaded it
    if [ -d "$PRICE_HISTORY_DIR" ] && [ "$(ls -A $PRICE_HISTORY_DIR)" ]; then
        log_info "Importing price history..."

        # Count files to import
        PRICE_FILE_COUNT=$(find "$PRICE_HISTORY_DIR" -name "prices" -type f | wc -l)
        log_info "Found $PRICE_FILE_COUNT price files to import"

        if bun run scripts/migrate-price-history.ts 2>&1 | tee -a "$LOG_FILE"; then
            log_info "✓ Price history imported successfully"
        else
            log_warn "✗ Price history import had errors (check logs)"
        fi
    fi

    return 0
}

if ! import_to_database; then
    log_error "Database import failed"
    exit 1
fi

###############################################################################
# Step 6: Update Database Statistics
###############################################################################

log_step "Step 5: Updating Database Statistics"

update_stats() {
    log_info "Running VACUUM ANALYZE on key tables..."

    docker exec card-db-postgres psql -U "$DB_USER" -d "$DB_NAME" -c "VACUUM ANALYZE products;" 2>&1 | tee -a "$LOG_FILE"
    docker exec card-db-postgres psql -U "$DB_USER" -d "$DB_NAME" -c "VACUUM ANALYZE price_history;" 2>&1 | tee -a "$LOG_FILE"

    log_info "✓ Database statistics updated"
}

update_stats

###############################################################################
# Step 7: Generate Summary Report
###############################################################################

log_step "Step 6: Generating Summary Report"

generate_report() {
    log_info "Collecting database statistics..."

    PRODUCT_COUNT=$(docker exec card-db-postgres psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM products;" | tr -d ' ')
    PRICE_COUNT=$(docker exec card-db-postgres psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM price_history;" | tr -d ' ')
    LATEST_PRICE_DATE=$(docker exec card-db-postgres psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT MAX(recorded_at) FROM price_history;" | tr -d ' ')

    REPORT_FILE="$PROJECT_ROOT/logs/update-summary-$(date +%Y%m%d-%H%M%S).json"

    cat > "$REPORT_FILE" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "success": true,
  "database": {
    "totalProducts": $PRODUCT_COUNT,
    "totalPriceRecords": $PRICE_COUNT,
    "latestPriceDate": "$LATEST_PRICE_DATE"
  },
  "downloads": {
    "metadata": "$(cat $TCGCSV_DIR/product-download-summary.json | jq -c .)",
    "priceHistoryDates": [
      $(find "$PRICE_HISTORY_DIR" -maxdepth 1 -type d -name "20*" -exec basename {} \; | sort | tail -5 | jq -R . | paste -sd,)
    ]
  }
}
EOF

    log_info "Summary report saved to: $REPORT_FILE"
    cat "$REPORT_FILE" | jq '.' | tee -a "$LOG_FILE"
}

generate_report

###############################################################################
# Cleanup
###############################################################################

log_step "Cleanup"

cleanup() {
    log_info "Removing temporary files..."
    rm -rf "$TEMP_DIR"

    # Keep only last 7 days of logs
    find "$PROJECT_ROOT/logs" -name "daily-update-*.log" -mtime +7 -delete

    log_info "✓ Cleanup complete"
}

cleanup

###############################################################################
# Final Summary
###############################################################################

log_step "Daily Update Complete"

DURATION=$(($(date +%s) - $CURRENT_TIMESTAMP))
DURATION_MIN=$((DURATION / 60))
DURATION_SEC=$((DURATION % 60))

log_info "Total duration: ${DURATION_MIN}m ${DURATION_SEC}s"
log_info "Products in database: $PRODUCT_COUNT"
log_info "Price records: $PRICE_COUNT"
log_info "Latest prices: $LATEST_PRICE_DATE"
log_info ""
log_info "Next steps:"
log_info "  - Check logs at: $LOG_FILE"
log_info "  - Verify API: curl https://api.rippzz.com/v2/products/42348"
log_info ""
log_info "To schedule this script daily, add to crontab:"
log_info "  0 2 * * * $SCRIPT_DIR/daily-update.sh >> $LOG_FILE 2>&1"

exit 0
