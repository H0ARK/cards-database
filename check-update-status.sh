#!/bin/bash
echo "========================================="
echo "TCGPlayer Data Update Status"
echo "========================================="
echo ""

echo "Current time: $(date)"
echo ""

echo "Update process:"
if ps aux | grep -q "[d]aily-update.sh"; then
    echo "  🟢 RUNNING"
    ps aux | grep "[d]aily-update.sh" | awk '{print "  PID:", $2, "Started:", $9}'
else
    echo "  🔴 NOT RUNNING"
fi
echo ""

echo "Latest log file:"
LATEST_LOG=$(ls -t cards-database/logs/daily-update-*.log 2>/dev/null | head -1)
if [ -n "$LATEST_LOG" ]; then
    echo "  $LATEST_LOG"
    echo "  Last 5 lines:"
    tail -5 "$LATEST_LOG" | sed 's/^/    /'
else
    echo "  No logs found"
fi
echo ""

echo "Data status (from API):"
curl -s https://api.rippzz.com/v2/status/data | jq '{lastUpdated, stats: {totalProducts, pokemonProducts}}' 2>/dev/null || echo "  API not responding"
echo ""

echo "Cron job:"
crontab -l 2>/dev/null | grep daily-update || echo "  No cron job configured"
echo ""

echo "========================================="
