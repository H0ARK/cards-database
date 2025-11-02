#!/bin/bash

# Download all 2025 TCGCSV archives with background parallelism
set -e

ARCHIVE_DIR="/home/ubuntu/cards-database/tcgcsv"
ARCHIVE_URL_BASE="https://tcgcsv.com/archive/tcgplayer"
MAX_JOBS=6

cd "$ARCHIVE_DIR"

echo "========================================"
echo "TCGCSV 2025 Data Download - Full Coverage"
echo "========================================"
echo ""

# Function to download and extract a single archive
download_archive() {
    local date=$1
    local filename="prices-${date}.ppmd.7z"
    local url="${ARCHIVE_URL_BASE}/${filename}"

    # Skip if already exists
    if [ -d "$date" ]; then
        return 0
    fi

    # Download and extract
    if curl -L -f -s --max-time 120 -o "$filename" "$url"; then
        if 7z x -y "$filename" > /dev/null 2>&1; then
            rm -f "$filename"
            echo "✓ $date"
            return 0
        else
            rm -f "$filename"
            echo "✗ $date (extract failed)"
            return 1
        fi
    else
        echo "✗ $date (download failed)"
        return 1
    fi
}

export -f download_archive
export ARCHIVE_DIR ARCHIVE_URL_BASE

# Count existing
existing=$(ls -d 2025-* 2>/dev/null | wc -l || echo "0")
echo "Existing 2025 archives: $existing"
echo ""
echo "Downloading remaining 2025 dates..."
echo ""

downloaded=0
failed=0

# Generate and download all 2025 dates
for month in 01 02 03 04 05 06 07 08 09 10 11; do
    if [ "$month" = "02" ]; then
        max_day=28
    elif [ "$month" = "04" ] || [ "$month" = "06" ] || [ "$month" = "09" ] || [ "$month" = "11" ]; then
        max_day=30
    else
        max_day=31
    fi

    if [ "$month" = "11" ]; then
        max_day=1
    fi

    for day in $(seq -f "%02g" 1 $max_day); do
        date="2025-${month}-${day}"

        # Launch jobs in parallel
        download_archive "$date" &

        # Limit concurrent jobs
        while [ $(jobs -r | wc -l) -ge $MAX_JOBS ]; do
            sleep 0.1
        done
    done
done

# Wait for all remaining jobs
wait

echo ""
echo "========================================"
echo "Download Complete!"
echo "========================================"
echo ""

total=$(ls -d 2025-* 2>/dev/null | wc -l || echo "0")
echo "Total 2025 archives: $total / 306"

if [ "$total" -eq 306 ]; then
    echo "✓ All 2025 data downloaded successfully!"
else
    missing=$((306 - total))
    echo "⚠ $missing dates still needed"
fi

echo ""
echo "Total disk usage:"
du -sh . 2>/dev/null

echo ""
echo "Next: cd /home/ubuntu/cards-database && bun run processTCGCSV.ts"
echo ""
