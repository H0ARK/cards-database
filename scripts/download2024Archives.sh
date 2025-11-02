#!/bin/bash
set -e

echo "=========================================="
echo "Download 2024 TCGCSV Archives"
echo "=========================================="
echo ""

cd /home/ubuntu/cards-database
mkdir -p tcgcsv

# Download archives for 2024 (weekly snapshots)
dates=(
    "2024-01-02" "2024-01-09" "2024-01-16" "2024-01-23" "2024-01-30"
    "2024-02-06" "2024-02-13" "2024-02-20" "2024-02-27"
    "2024-03-05" "2024-03-12" "2024-03-19" "2024-03-26"
    "2024-04-02" "2024-04-09" "2024-04-16" "2024-04-23" "2024-04-30"
    "2024-05-07" "2024-05-14" "2024-05-21" "2024-05-28"
    "2024-06-04" "2024-06-11" "2024-06-18" "2024-06-25"
    "2024-07-02" "2024-07-09" "2024-07-16" "2024-07-23" "2024-07-30"
    "2024-08-06" "2024-08-13" "2024-08-20" "2024-08-27"
    "2024-09-03" "2024-09-10" "2024-09-17" "2024-09-24"
    "2024-10-01" "2024-10-08" "2024-10-15" "2024-10-22" "2024-10-29"
)

success=0
skipped=0
failed=0

for date in "${dates[@]}"; do
    url="https://tcgcsv.com/archive/tcgplayer/prices-${date}.ppmd.7z"
    archive="tcgcsv/prices-${date}.ppmd.7z"
    extract_dir="tcgcsv/${date}"
    
    # Skip if already extracted
    if [ -d "$extract_dir" ]; then
        echo "⊙ ${date} - already exists"
        ((skipped++))
        continue
    fi
    
    # Download
    if [ ! -f "$archive" ]; then
        echo "⬇  ${date} - downloading..."
        if curl -f -L -o "$archive" "$url" 2>/dev/null; then
            size=$(du -h "$archive" | cut -f1)
            echo "   ✓ Downloaded (${size})"
        else
            echo "   ✗ Failed"
            rm -f "$archive"
            ((failed++))
            continue
        fi
    fi
    
    # Extract
    echo "   Extracting..."
    if 7z x "$archive" -o"$extract_dir" -y > /dev/null 2>&1; then
        echo "   ✓ Extracted"
        ((success++))
    else
        echo "   ✗ Extraction failed"
        ((failed++))
    fi
    
    sleep 0.3
done

echo ""
echo "Results: Success=$success, Skipped=$skipped, Failed=$failed"
echo ""
echo "Available archives:"
ls -1d tcgcsv/2024-*/ 2>/dev/null | sed 's|tcgcsv/||' | sed 's|/||' | sort
