#!/bin/bash
set -e

echo "=========================================="
echo "Download TCGCSV Archives for SV3 Era"
echo "=========================================="
echo ""
echo "SV3 'Ruler of the Black Flame' released: July 28, 2023"
echo "Downloading archives from Aug 2023 to Nov 2024"
echo "URL pattern: https://tcgcsv.com/archive/tcgplayer/prices-YYYY-MM-DD.ppmd.7z"
echo ""

cd /home/ubuntu/cards-database
mkdir -p tcgcsv

# Function to download and extract a single archive
download_archive() {
    local date=$1
    local url="https://tcgcsv.com/archive/tcgplayer/prices-${date}.ppmd.7z"
    local archive_file="tcgcsv/prices-${date}.ppmd.7z"
    local extract_dir="tcgcsv/${date}"

    # Skip if already extracted
    if [ -d "$extract_dir" ]; then
        echo "  ⊙ ${date} - already exists, skipping"
        return 0
    fi

    # Download if not already downloaded
    if [ ! -f "$archive_file" ]; then
        echo "  ⬇  ${date} - downloading..."
        if curl -f -L -o "$archive_file" "$url" 2>/dev/null; then
            local size=$(du -h "$archive_file" | cut -f1)
            echo "     ✓ Downloaded (${size})"
        else
            echo "     ✗ Download failed (archive may not exist for this date)"
            rm -f "$archive_file"
            return 1
        fi
    else
        echo "  ⊙ ${date} - archive exists, extracting..."
    fi

    # Extract
    if [ -f "$archive_file" ]; then
        echo "     Extracting..."
        if 7z x "$archive_file" -o"$extract_dir" -y > /dev/null 2>&1; then
            echo "     ✓ Extracted to ${extract_dir}"
            # Optionally remove archive to save space (commented out by default)
            # rm "$archive_file"
            return 0
        else
            echo "     ✗ Extraction failed"
            return 1
        fi
    fi

    return 1
}

# Array of dates to download
# TCGCSV appears to have archives on specific dates (not daily)
# We'll try weekly snapshots and see what exists
dates=(
    # 2023 - SV3 era (released July 28, 2023)
    "2023-08-01"
    "2023-08-08"
    "2023-08-15"
    "2023-08-22"
    "2023-08-29"
    "2023-09-05"
    "2023-09-12"
    "2023-09-19"
    "2023-09-26"
    "2023-10-03"
    "2023-10-10"
    "2023-10-17"
    "2023-10-24"
    "2023-10-31"
    "2023-11-07"
    "2023-11-14"
    "2023-11-21"
    "2023-11-28"
    "2023-12-05"
    "2023-12-12"
    "2023-12-19"
    "2023-12-26"

    # 2024
    "2024-01-02"
    "2024-01-09"
    "2024-01-16"
    "2024-01-23"
    "2024-01-30"
    # "2024-02-08"  # We already have this one
    "2024-02-13"
    "2024-02-20"
    "2024-02-27"
    "2024-03-05"
    "2024-03-12"
    "2024-03-19"
    "2024-03-26"
    "2024-04-02"
    "2024-04-09"
    "2024-04-16"
    "2024-04-23"
    "2024-04-30"
    "2024-05-07"
    "2024-05-14"
    "2024-05-21"
    "2024-05-28"
    "2024-06-04"
    "2024-06-11"
    "2024-06-18"
    "2024-06-25"
    "2024-07-02"
    "2024-07-09"
    "2024-07-16"
    "2024-07-23"
    "2024-07-30"
    "2024-08-06"
    "2024-08-13"
    "2024-08-20"
    "2024-08-27"
    "2024-09-03"
    "2024-09-10"
    "2024-09-17"
    "2024-09-24"
    "2024-10-01"
    "2024-10-08"
    "2024-10-15"
    "2024-10-22"
    "2024-10-29"
    "2024-11-05"
)

total=${#dates[@]}
success=0
skipped=0
failed=0

echo "Attempting to download ${total} archives..."
echo ""

for date in "${dates[@]}"; do
    if download_archive "$date"; then
        if [ -d "tcgcsv/${date}" ]; then
            ((success++))
        else
            ((skipped++))
        fi
    else
        ((failed++))
    fi

    # Small delay to be nice to the server
    sleep 0.5
done

echo ""
echo "=========================================="
echo "Download Summary"
echo "=========================================="
echo "Total dates attempted: ${total}"
echo "Successfully downloaded: ${success}"
echo "Already existed (skipped): ${skipped}"
echo "Failed: ${failed}"
echo ""

# List what we have now
echo "Archives now available:"
ls -1 tcgcsv/ | grep -E '^\d{4}-\d{2}-\d{2}$' | sort

archive_count=$(ls -1d tcgcsv/2*/  2>/dev/null | wc -l)
echo ""
echo "Total extracted archives: ${archive_count}"
echo ""

if [ $success -gt 0 ]; then
    echo "✓ Successfully downloaded ${success} new archives!"
    echo ""
    echo "Next steps:"
    echo "  1. Link SV3 cards (if not done):      bun run scripts/linkAsianCardsWorkflow.ts SV3"
    echo "  2. Process price history:             bun run processTCGCSV.ts"
    echo "  3. Rebuild Docker:                    docker-compose build"
    echo "  4. Restart server:                    docker-compose up -d"
    echo "  5. Test SV3-001 history:              curl http://135.148.148.65:3000/api/v2/cards/SV3-001/history?range=daily"
else
    echo "⚠️  No new archives downloaded."
    echo ""
    echo "Possible reasons:"
    echo "  - Archives may not exist for these specific dates"
    echo "  - TCGCSV may have changed their archive naming/structure"
    echo "  - Network connectivity issues"
    echo ""
    echo "You can manually check what's available at:"
    echo "  https://tcgcsv.com/archive/tcgplayer/"
fi

echo ""
