#!/bin/bash

# Try to find available TCGCSV archive dates
echo "Testing which dates are available on TCGCSV..."
echo ""

# Test some dates in 2023-2024
test_dates=(
    "2023-08-01" "2023-08-15" "2023-09-01" "2023-09-15"
    "2023-10-01" "2023-10-15" "2023-11-01" "2023-11-15"
    "2023-12-01" "2023-12-15"
    "2024-01-01" "2024-01-15" "2024-02-01" "2024-02-15"
    "2024-03-01" "2024-03-15" "2024-04-01" "2024-04-15"
    "2024-05-01" "2024-05-15" "2024-06-01" "2024-06-15"
    "2024-07-01" "2024-07-15" "2024-08-01" "2024-08-15"
    "2024-09-01" "2024-09-15" "2024-10-01" "2024-10-15"
    "2024-11-01"
)

available=()

for date in "${test_dates[@]}"; do
    url="https://tcgcsv.com/download/ppmd/${date}/ppmd.7z"
    
    # Use HEAD request to check if file exists
    if curl -s --head "$url" | grep -q "200 OK"; then
        echo "✓ $date - AVAILABLE"
        available+=("$date")
    else
        echo "✗ $date - not found"
    fi
done

echo ""
echo "=========================================="
echo "Available dates found: ${#available[@]}"
echo "=========================================="
for date in "${available[@]}"; do
    echo "  $date"
done
