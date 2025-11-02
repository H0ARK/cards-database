#!/bin/bash

# Ultra-fast parallel downloader for 2025 TCGCSV archives
# Uses GNU parallel to download multiple files concurrently

ARCHIVE_DIR="/home/ubuntu/cards-database/tcgcsv"
ARCHIVE_URL_BASE="https://tcgcsv.com/archive/tcgplayer"

cd "$ARCHIVE_DIR"

echo "========================================"
echo "TCGCSV 2025 Data - Parallel Download"
echo "========================================"
echo ""

# Function to download and extract a single archive
download_and_extract() {
    local date=$1
    local filename="prices-${date}.ppmd.7z"
    local url="${ARCHIVE_URL_BASE}/${filename}"

    # Skip if already exists
    if [ -d "$date" ]; then
        echo "SKIP $date"
        return 0
    fi

    # Create temp directory for this download
    local temp_dir="/tmp/tcgcsv-${date}"
    mkdir -p "$temp_dir"
    cd "$temp_dir"

    # Download
    if curl -L -f -s --max-time 120 -o "$filename" "$url" 2>/dev/null; then
        # Extract
        if 7z x -y "$filename" > /dev/null 2>&1; then
            # Move to final location
            mv * "$ARCHIVE_DIR/$date" 2>/dev/null || true
            rm -rf "$temp_dir"
            echo "OK $date"
            return 0
        else
            rm -rf "$temp_dir"
            echo "FAIL $date (extract)"
            return 1
        fi
    else
        rm -rf "$temp_dir"
        echo "FAIL $date (download)"
        return 1
    fi
}

export -f download_and_extract
export ARCHIVE_DIR ARCHIVE_URL_BASE

# Generate all dates
echo "Generating date list..."
dates=""
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
        dates="${dates}2025-${month}-${day}
"
    done
done

echo "Downloading $(echo "$dates" | wc -l) dates with parallel processing..."
echo ""

# Use GNU parallel if available, otherwise fall back to xargs
if command -v parallel &> /dev/null; then
    echo "$dates" | parallel --jobs 6 --line-buffer download_and_extract
else
    # Fallback to sequential if parallel not available
    echo "$dates" | while read date; do
        download_and_extract "$date"
    done
fi

echo ""
echo "========================================"
echo "Download Complete!"
echo "========================================"
echo ""
total_2025=$(ls -d /home/ubuntu/cards-database/tcgcsv/2025-* 2>/dev/null | wc -l)
echo "Total 2025 archives: $total_2025"
echo "Disk usage:"
du -sh /home/ubuntu/cards-database/tcgcsv/2025-* 2>/dev/null | tail -1
echo ""
