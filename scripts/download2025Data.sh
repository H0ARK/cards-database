#!/bin/bash

# Download all available 2025 TCGCSV archives efficiently
set -e

ARCHIVE_DIR="/home/ubuntu/cards-database/tcgcsv"
ARCHIVE_URL_BASE="https://tcgcsv.com/archive/tcgplayer"

mkdir -p "$ARCHIVE_DIR"
cd "$ARCHIVE_DIR"

echo "========================================"
echo "TCGCSV 2025 Data Download"
echo "========================================"
echo ""

# Function to download and extract archive
download_archive() {
    local date=$1
    local filename="prices-${date}.ppmd.7z"
    local url="${ARCHIVE_URL_BASE}/${filename}"

    # Skip if already extracted
    if [ -d "$date" ]; then
        return 0
    fi

    # Download with timeout
    if curl -L -f -s --max-time 120 -o "$filename" "$url"; then
        # Extract
        if 7z x -y "$filename" > /dev/null 2>&1; then
            rm -f "$filename"
            echo "✓ $date"
            return 0
        else
            echo "✗ Failed to extract $date"
            rm -f "$filename"
            return 1
        fi
    fi
}

# Count existing 2025 archives
existing_count=$(ls -d 2025-* 2>/dev/null | wc -l || echo "0")
echo "Existing 2025 archives: $existing_count"
echo ""

downloaded=0
failed=0

# Generate all dates from 2025-01-01 to 2025-11-01
# Using a simpler approach that doesn't rely on date command edge cases
for month in 01 02 03 04 05 06 07 08 09 10 11; do
    # Determine max day for this month
    if [ "$month" = "02" ]; then
        max_day=28  # 2025 is not a leap year
    elif [ "$month" = "04" ] || [ "$month" = "06" ] || [ "$month" = "09" ] || [ "$month" = "11" ]; then
        max_day=30
    else
        max_day=31
    fi

    # Limit to day 1 for November (since today is Nov 1)
    if [ "$month" = "11" ]; then
        max_day=1
    fi

    for day in $(seq -f "%02g" 1 $max_day); do
        date="2025-${month}-${day}"
        echo -n "Checking $date... "
        if download_archive "$date"; then
            ((downloaded++))
        else
            ((failed++))
        fi
    done
    
    echo "[$month/11] Downloaded: $downloaded, Failed: $failed"
done

echo ""
echo "========================================"
echo "Download Complete!"
echo "========================================"
echo ""
echo "Total 2025 archives:"
total_2025=$(ls -d 2025-* 2>/dev/null | wc -l)
echo "  $total_2025"
echo ""
echo "Total disk usage:"
du -sh . 2>/dev/null
echo ""
