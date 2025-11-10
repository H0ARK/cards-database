#!/bin/bash

# Parallel Price History Migration
# Splits 612 days into 4 workers by date range

set -e

echo "🚀 Parallel Price History Migration"
echo "===================================="
echo ""

# Configuration
export DB_USER="${DB_USER:-cardadmin}"
export DB_PASSWORD="${DB_PASSWORD:-zTUriQtdN70spWI5RBfyEl76Vb5/NFHAz8E2w5bD1Ss=}"
export DB_HOST="${DB_HOST:-localhost}"
export DB_NAME="${DB_NAME:-carddb}"
export DB_PORT="${DB_PORT:-5432}"
export TCGCSV_PATH="${TCGCSV_PATH:-/home/ubuntu/cards-database/tcgcsv}"

# Check database connection
echo "🔍 Checking database connection..."
if docker exec card-db-postgres psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    exit 1
fi

# Show disk space
echo ""
echo "💾 Current disk usage:"
df -h /home/ubuntu | tail -1
echo ""

# Date ranges (split 612 days into 4 roughly equal chunks)
# 2024-02-08 to 2025-11-01 = 612 days / 4 = ~153 days per worker

WORKER1_START="2024-02-08"
WORKER1_END="2024-07-10"    # ~153 days

WORKER2_START="2024-07-11"
WORKER2_END="2024-12-10"    # ~153 days

WORKER3_START="2024-12-11"
WORKER3_END="2025-05-12"    # ~153 days

WORKER4_START="2025-05-13"
WORKER4_END="2025-11-01"    # ~153 days

echo "📅 Date Range Split:"
echo "   Worker 1: $WORKER1_START to $WORKER1_END"
echo "   Worker 2: $WORKER2_START to $WORKER2_END"
echo "   Worker 3: $WORKER3_START to $WORKER3_END"
echo "   Worker 4: $WORKER4_START to $WORKER4_END"
echo ""

# Confirm
if [ "$1" != "--yes" ]; then
    echo "⚠️  WARNING: This will:"
    echo "   - Start 4 parallel workers"
    echo "   - Delete price files as they're imported"
    echo "   - Use ~100% CPU"
    echo ""
    read -p "Continue? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        echo "Migration cancelled"
        exit 0
    fi
else
    echo "✅ Auto-confirmed with --yes flag"
fi

echo ""
echo "🚀 Starting 4 parallel workers..."
echo ""

# Start worker 1
WORKER=1 START_DATE=$WORKER1_START END_DATE=$WORKER1_END \
  bun run scripts/migrate-price-history.ts \
  > scripts/worker1-progress.log 2>&1 &
PID1=$!
echo "✅ Worker 1 started (PID: $PID1) - $WORKER1_START to $WORKER1_END"

# Start worker 2
WORKER=2 START_DATE=$WORKER2_START END_DATE=$WORKER2_END \
  bun run scripts/migrate-price-history.ts \
  > scripts/worker2-progress.log 2>&1 &
PID2=$!
echo "✅ Worker 2 started (PID: $PID2) - $WORKER2_START to $WORKER2_END"

# Start worker 3
WORKER=3 START_DATE=$WORKER3_START END_DATE=$WORKER3_END \
  bun run scripts/migrate-price-history.ts \
  > scripts/worker3-progress.log 2>&1 &
PID3=$!
echo "✅ Worker 3 started (PID: $PID3) - $WORKER3_START to $WORKER3_END"

# Start worker 4
WORKER=4 START_DATE=$WORKER4_START END_DATE=$WORKER4_END \
  bun run scripts/migrate-price-history.ts \
  > scripts/worker4-progress.log 2>&1 &
PID4=$!
echo "✅ Worker 4 started (PID: $PID4) - $WORKER4_START to $WORKER4_END"

echo ""
echo "📊 Monitor progress:"
echo "   tail -f scripts/worker1-progress.log"
echo "   tail -f scripts/worker2-progress.log"
echo "   tail -f scripts/worker3-progress.log"
echo "   tail -f scripts/worker4-progress.log"
echo ""
echo "📈 Combined stats:"
echo "   watch -n 5 'grep \"Records:\" scripts/worker*-progress.log | tail -4'"
echo ""
echo "⏸️  Stop all workers:"
echo "   pkill -f migrate-price-history"
echo ""

# Wait for all workers to complete
echo "⏳ Waiting for workers to complete..."
echo ""

wait $PID1
echo "✅ Worker 1 completed"

wait $PID2
echo "✅ Worker 2 completed"

wait $PID3
echo "✅ Worker 3 completed"

wait $PID4
echo "✅ Worker 4 completed"

echo ""
echo "🎉 All workers completed!"
echo ""

# Show final stats
echo "💾 Final disk usage:"
df -h /home/ubuntu | tail -1
echo ""

echo "📊 Database stats:"
docker exec card-db-postgres psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT
    COUNT(*) as total_records,
    COUNT(DISTINCT product_id) as unique_products,
    COUNT(DISTINCT recorded_at) as unique_dates,
    pg_size_pretty(pg_total_relation_size('price_history')) as table_size
FROM price_history;
"

echo ""
echo "✅ Parallel migration complete!"
