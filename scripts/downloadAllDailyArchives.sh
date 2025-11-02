#!/bin/bash

# Download ALL available daily TCGCSV archives to build complete price history
# This discovers available dates and downloads them all

set -e

ARCHIVE_DIR="tcgcsv"
ARCHIVE_URL_BASE="https://tcgcsv.com/archive/tcgplayer"

mkdir -p "$ARCHIVE_DIR"
cd "$ARCHIVE_DIR"

echo "========================================"
echo "TCGCSV Daily Archive Download"
echo "========================================"
echo ""

# Function to check if archive exists
archive_exists() {
    local date=$1
    local filename="prices-${date}.ppmd.7z"
    local url="${ARCHIVE_URL_BASE}/${filename}"
    curl -I -s -f "$url" > /dev/null 2>&1
}

# Function to download and extract archive
download_archive() {
    local date=$1
    local filename="prices-${date}.ppmd.7z"
    local url="${ARCHIVE_URL_BASE}/${filename}"

    # Skip if already extracted
    if [ -d "$date" ]; then
        echo "✓ Already have $date"
        return 0
    fi

    # Download
    echo "⬇ Downloading $date..."
    if curl -L -f -s -o "$filename" "$url"; then
        echo "↻ Extracting $filename..."
        if 7z x -y "$filename" > /dev/null 2>&1; then
            rm -f "$filename"
            echo "✓ Completed $date"
            return 0
        else
            echo "✗ Failed to extract $filename"
            rm -f "$filename"
            return 1
        fi
    else
        echo "✗ Archive not available for $date"
        return 1
    fi
}

# Count existing archives
existing_count=$(ls -d 2024-* 2025-* 2>/dev/null | wc -l)
echo "Existing archives: $existing_count"
echo ""

# Download strategy: Start from March 2024 (first available) through today
# Try every single day to get complete coverage

start_date="2024-03-01"
end_date="2025-12-31"

echo "Downloading from $start_date to $end_date"
echo "This will download every available daily snapshot..."
echo ""

downloaded=0
skipped=0
failed=0

current=$start_date
while [[ "$current" < "$end_date" ]] || [[ "$current" == "$end_date" ]]; do
    if download_archive "$current"; then
        if [ -d "$current" ]; then
            ((downloaded++))
        else
            ((skipped++))
        fi
    else
        ((failed++))
    fi

    # Increment date by 1 day (compatible with both Linux and macOS)
    current=$(date -I -d "$current + 1 day" 2>/dev/null || date -j -v+1d -f "%Y-%m-%d" "$current" +%Y-%m-%d 2>/dev/null)

    # Progress indicator every 10 dates
    total=$((downloaded + skipped + failed))
    if [ $((total % 10)) -eq 0 ]; then
        echo "Progress: Downloaded=$downloaded, Skipped=$skipped, Failed=$failed"
    fi
done

echo ""
echo "========================================"
echo "Download Complete!"
echo "========================================"
echo ""
echo "Summary:"
echo "  Downloaded: $downloaded"
echo "  Skipped (already had): $skipped"
echo "  Failed/Not available: $failed"
echo ""
echo "Total archives available:"
ls -d 2024-* 2025-* 2>/dev/null | wc -l
echo ""
echo "Total disk usage:"
du -sh . 2>/dev/null
echo ""
echo "========================================"
echo "Next step:"
echo "  cd /home/ubuntu/cards-database"
echo "  bun run processTCGCSV.ts"
echo "========================================"
