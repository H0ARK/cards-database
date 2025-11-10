#!/bin/bash

# Price History Migration Runner
# This script migrates price data from files to PostgreSQL database
# and deletes files as it goes to save disk space

set -e

echo "🚀 Starting Price History Migration"
echo "===================================="
echo ""

# Load environment variables
export DB_USER="${DB_USER:-cardadmin}"
export DB_PASSWORD="${DB_PASSWORD:-zTUriQtdN70spWI5RBfyEl76Vb5/NFHAz8E2w5bD1Ss=}"
export DB_HOST="${DB_HOST:-localhost}"
export DB_NAME="${DB_NAME:-carddb}"
export DB_PORT="${DB_PORT:-5432}"
export TCGCSV_PATH="${TCGCSV_PATH:-/home/ubuntu/cards-database/tcgcsv}"

# Check if database is accessible
echo "🔍 Checking database connection..."
if docker exec card-db-postgres psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    echo "Make sure PostgreSQL is running: docker ps | grep postgres"
    exit 1
fi

# Check disk space before starting
echo ""
echo "💾 Current disk usage:"
df -h /home/ubuntu | tail -1
echo ""

# Confirm before proceeding
if [ "$1" != "--yes" ]; then
    echo "⚠️  WARNING: This will delete price history files as they are imported!"
    echo "   Files can be re-downloaded from tcgcsv.com if needed"
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
echo "📊 Starting migration..."
echo "   Log file: scripts/migration-progress.log"
echo ""

# Run the migration script
cd /home/ubuntu/cards-database
bun run scripts/migrate-price-history.ts

echo ""
echo "✅ Migration script completed"
echo ""
echo "💾 Final disk usage:"
df -h /home/ubuntu | tail -1
echo ""
echo "📈 Check database size:"
docker exec card-db-postgres psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT
    COUNT(*) as total_records,
    COUNT(DISTINCT product_id) as unique_products,
    COUNT(DISTINCT recorded_at) as unique_dates,
    pg_size_pretty(pg_total_relation_size('price_history')) as table_size
FROM price_history;
"

echo ""
echo "🎉 Migration complete!"
