#!/bin/bash

# Fast parallel download of all TCGCSV archives
# Downloads 10 archives at a time for speed

set -e

ARCHIVE_DIR="tcgcsv"
ARCHIVE_URL_BASE="https://tcgcsv.com/archive/tcgplayer"
PARALLEL_JOBS=10

mkdir -p "$ARCHIVE_DIR"
cd "$ARCHIVE_DIR"

echo "========================================"
echo "TCGCSV Parallel Archive Download"
echo "========================================"
echo ""

# Function to download and extract a single archive
download_one() {
    local date=$1
    local filename="prices-${date}.ppmd.7z"
    local url="${ARCHIVE_URL_BASE}/${filename}"

    # Skip if already extracted
    if [ -d "$date" ]; then
        return 0
    fi

    # Download
    if curl -L -f -s -o "$filename" "$url" 2>/dev/null; then
        # Extract
        if 7z x -y "$filename" > /dev/null 2>&1; then
            rm -f "$filename"
            echo "✓ $date"
            return 0
        else
            rm -f "$filename"
            return 1
        fi
    else
        return 1
    fi
}

export -f download_one
export ARCHIVE_URL_BASE

# Generate all dates from 2024-03-01 to 2024-12-31
dates=()
current="2024-03-01"
end="2024-12-31"

while [[ "$current" < "$end" ]] || [[ "$current" == "$end" ]]; do
    dates+=("$current")
    # Increment date (portable way)
    current=$(date -I -d "$current + 1 day" 2>/dev/null || date -v+1d -j -f "%Y-%m-%d" "$current" "+%Y-%m-%d" 2>/dev/null)
done

total=${#dates[@]}
existing=$(ls -d 2024-* 2>/dev/null | wc -l)

echo "Total dates to check: $total"
echo "Already downloaded: $existing"
echo "Downloading with $PARALLEL_JOBS parallel jobs..."
echo ""

# Download all dates in parallel using GNU parallel or xargs
if command -v parallel > /dev/null 2>&1; then
    # Use GNU parallel if available
    printf '%s\n' "${dates[@]}" | parallel -j $PARALLEL_JOBS download_one {}
else
    # Fallback to xargs
    printf '%s\n' "${dates[@]}" | xargs -P $PARALLEL_JOBS -I {} bash -c 'download_one "$@"' _ {}
fi

echo ""
echo "========================================"
echo "Download Complete!"
echo "========================================"
echo ""

final_count=$(ls -d 2024-* 2>/dev/null | wc -l)
new_downloads=$((final_count - existing))

echo "Summary:"
echo "  Archives now available: $final_count"
echo "  Newly downloaded: $new_downloads"
echo ""
echo "Total disk usage:"
du -sh . 2>/dev/null
echo ""
echo "========================================"
echo "Next step:"
echo "  cd /home/ubuntu/cards-database"
echo "  export PATH=\"\$HOME/.bun/bin:\$PATH\""
echo "  bun run processTCGCSV.ts"
echo "========================================"
