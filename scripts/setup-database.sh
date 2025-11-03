#!/bin/bash
# Database Setup Script
# This script initializes the PostgreSQL database for the cards API

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🗄️  Card Database Setup Script${NC}\n"

# Load environment variables if .env exists
if [ -f .env ]; then
    echo -e "${YELLOW}📄 Loading environment from .env${NC}"
    export $(cat .env | grep -v '^#' | xargs)
else
    echo -e "${YELLOW}⚠️  No .env file found, using defaults${NC}"
fi

# Set defaults
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-cards_db}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}

echo -e "${GREEN}Database Configuration:${NC}"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""

# Check if PostgreSQL is running
echo -e "${YELLOW}🔍 Checking PostgreSQL connection...${NC}"
if ! PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c '\q' 2>/dev/null; then
    echo -e "${RED}❌ Cannot connect to PostgreSQL server${NC}"
    echo -e "${YELLOW}💡 Make sure PostgreSQL is running:${NC}"
    echo "   docker ps | grep postgres"
    echo "   docker-compose up -d"
    exit 1
fi
echo -e "${GREEN}✅ PostgreSQL is running${NC}\n"

# Check if database exists
echo -e "${YELLOW}🔍 Checking if database '$DB_NAME' exists...${NC}"
DB_EXISTS=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")

if [ "$DB_EXISTS" = "1" ]; then
    echo -e "${YELLOW}⚠️  Database '$DB_NAME' already exists${NC}"
    read -p "Do you want to drop and recreate it? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}🗑️  Dropping existing database...${NC}"
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
        echo -e "${YELLOW}📦 Creating database '$DB_NAME'...${NC}"
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;"
    else
        echo -e "${YELLOW}⏩ Skipping database creation${NC}"
    fi
else
    echo -e "${YELLOW}📦 Creating database '$DB_NAME'...${NC}"
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;"
fi
echo -e "${GREEN}✅ Database ready${NC}\n"

# Run migrations
echo -e "${YELLOW}🚀 Running migrations...${NC}"
for migration in migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "   📄 Applying $(basename $migration)..."
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$migration"
    fi
done
echo -e "${GREEN}✅ Migrations completed${NC}\n"

# Show database info
echo -e "${GREEN}📊 Database Information:${NC}"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
"

echo -e "\n${GREEN}✅ Database setup complete!${NC}"
echo -e "\n${YELLOW}Next steps:${NC}"
echo "  1. Run data migration:"
echo "     ${GREEN}bun scripts/migrate-to-postgres.ts${NC}"
echo ""
echo "  2. Update server code to use PostgreSQL"
echo ""
echo "  3. Test the API endpoints"
echo ""
