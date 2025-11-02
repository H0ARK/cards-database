#!/bin/bash

# Bulk download all 2024 TCGCSV daily archives
# Simple sequential download with progress tracking

ARCHIVE_DIR="tcgcsv"
BASE_URL="https://tcgcsv.com/archive/tcgplayer"

cd "$ARCHIVE_DIR" || exit 1

echo "=========================================="
echo "Downloading All 2024 TCGCSV Daily Archives"
echo "=========================================="
echo ""

downloaded=0
skipped=0
failed=0

# Function to download and extract single date
process_date() {
    local date=$1
    local filename="prices-${date}.ppmd.7z"

    # Skip if already extracted
    if [ -d "$date" ]; then
        echo "⏭ Skip $date (already have it)"
        ((skipped++))
        return 0
    fi

    # Download
    if curl -L -f -s -o "$filename" "${BASE_URL}/${filename}"; then
        # Extract
        if 7z x -y "$filename" >/dev/null 2>&1; then
            rm -f "$filename"
            echo "✓ Downloaded $date"
            ((downloaded++))
            return 0
        else
            rm -f "$filename"
            echo "✗ Extract failed: $date"
            ((failed++))
            return 1
        fi
    else
        echo "✗ Not available: $date"
        ((failed++))
        return 1
    fi
}

# Download all dates from March to December 2024
for month in 03 04 05 06 07 08 09 10 11 12; do
    # Determine days in month
    case $month in
        02) days=29 ;;  # 2024 is leap year
        04|06|09|11) days=30 ;;
        *) days=31 ;;
    esac

    echo ""
    echo "=== Month 2024-$month ==="

    for day in $(seq -f "%02g" 1 $days); do
        process_date "2024-${month}-${day}"
    done

    echo "Progress so far: Downloaded=$downloaded, Skipped=$skipped, Failed=$failed"
done

echo ""
echo "=========================================="
echo "Download Complete!"
echo "=========================================="
echo ""
echo "Final Summary:"
echo "  ✓ Downloaded: $downloaded"
echo "  ⏭ Skipped: $skipped"
echo "  ✗ Failed/Missing: $failed"
echo ""

total_archives=$(ls -d 2024-* 2>/dev/null | wc -l)
echo "Total archives available: $total_archives"
echo ""
echo "Disk usage:"
du -sh .
echo ""
echo "=========================================="
echo "Next: Process all archives to generate history files"
echo "  cd /home/ubuntu/cards-database"
echo "  export PATH=\"\$HOME/.bun/bin:\$PATH\""
echo "  bun run processTCGCSV.ts"
echo "=========================================="
