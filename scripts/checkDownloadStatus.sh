#!/bin/bash

# Quick status check for bulk download progress

LOG_FILE="bulk-download.log"
PID_FILE="bulk-download.pid"

echo "=========================================="
echo "TCGCSV Download Status"
echo "=========================================="
echo ""

# Check if download is running
if [ -f "$PID_FILE" ]; then
    pid=$(cat "$PID_FILE")
    if ps -p "$pid" > /dev/null 2>&1; then
        echo "Status: ✓ RUNNING (PID: $pid)"
    else
        echo "Status: ✗ STOPPED (PID $pid not found)"
    fi
else
    echo "Status: ⚠ No PID file found"
fi

echo ""

# Count archives
if [ -d "tcgcsv" ]; then
    total_archives=$(ls -d tcgcsv/2024-* 2>/dev/null | wc -l)
    echo "Archives downloaded: $total_archives"

    # Calculate size
    size=$(du -sh tcgcsv 2>/dev/null | cut -f1)
    echo "Disk usage: $size"
fi

echo ""

# Show recent progress from log
if [ -f "$LOG_FILE" ]; then
    echo "Recent activity:"
    echo "----------------------------------------"
    tail -15 "$LOG_FILE" | grep -E "✓|✗|Progress|Month|Complete|Summary" | tail -10
    echo ""

    # Count progress
    downloaded=$(grep -c "✓ Downloaded" "$LOG_FILE" 2>/dev/null || echo 0)
    skipped=$(grep -c "⏭ Skip" "$LOG_FILE" 2>/dev/null || echo 0)
    failed=$(grep -c "✗" "$LOG_FILE" 2>/dev/null || echo 0)

    echo "Progress counts:"
    echo "  Downloaded: $downloaded"
    echo "  Skipped: $skipped"
    echo "  Failed: $failed"
    echo "  Total processed: $((downloaded + skipped + failed))"
fi

echo ""
echo "=========================================="
echo "Commands:"
echo "  Watch live: tail -f $LOG_FILE"
echo "  Stop download: kill \$(cat $PID_FILE)"
echo "=========================================="
