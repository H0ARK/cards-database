# TCGdex API - Quick Reference Guide

## 🚀 Common Operations

### View Database Stats
```bash
curl http://localhost:3000/status
```

### Query Database Directly
```bash
# Connect to database
docker exec -it card-db-postgres psql -U cardadmin -d carddb

# Check counts
SELECT 
  (SELECT COUNT(*) FROM cards) as cards,
  (SELECT COUNT(*) FROM sets) as sets,
  (SELECT COUNT(*) FROM sealed_products) as sealed_products;
```

### View Logs
```bash
# API server logs
docker-compose logs -f stable

# Database logs
docker-compose logs -f card-db-postgres
```

### Restart Services
```bash
# Restart API only
docker-compose restart stable

# Restart everything
docker-compose restart
```

---

## 📡 API Endpoints

### Core Endpoints
```bash
# Get all series
curl http://localhost:3000/v2/en/series

# Get all sets
curl http://localhost:3000/v2/en/sets

# Get all cards (paginated)
curl http://localhost:3000/v2/en/cards

# Get specific card
curl http://localhost:3000/v2/en/cards/sv08.5-079

# Get set with sealed products
curl http://localhost:3000/v2/en/sets/swsh12.5
```

### Response Formatting
```bash
# Pretty print JSON
curl http://localhost:3000/v2/en/sets/sv08.5 | jq '.'

# Get specific fields
curl http://localhost:3000/v2/en/sets/sv08.5 | jq '{id, name, sealedCount: (.sealedProducts | length)}'
```

---

## 🗄️ Database Queries

### Common Queries
```sql
-- Find sets with most sealed products
SELECT 
  s.id, 
  s.name->>'en' as name, 
  COUNT(sp.id) as product_count
FROM sets s
LEFT JOIN sealed_products sp ON sp.set_id = s.id
GROUP BY s.id, s.name
ORDER BY product_count DESC
LIMIT 10;

-- Find cards by type
SELECT id, name->>'en' as name, types
FROM cards
WHERE types @> '["Fire"]'::jsonb
LIMIT 10;

-- Get sealed products by type
SELECT product_type, COUNT(*)
FROM sealed_products
GROUP BY product_type
ORDER BY COUNT(*) DESC;
```

---

## 🔧 Maintenance

### Backup Database
```bash
docker exec card-db-postgres pg_dump -U cardadmin carddb > backup.sql
```

### Restore Database
```bash
cat backup.sql | docker exec -i card-db-postgres psql -U cardadmin -d carddb
```

### Check Database Size
```bash
docker exec card-db-postgres psql -U cardadmin -d carddb -c "
SELECT pg_size_pretty(pg_database_size('carddb')) as database_size;
"
```

### Vacuum Database
```bash
docker exec card-db-postgres psql -U cardadmin -d carddb -c "VACUUM ANALYZE;"
```

---

## 🧪 Testing

### Run Validation Tests
```bash
# Full validation
./final-validation.sh

# Endpoint tests only
./test-endpoints.sh
```

### Manual Tests
```bash
# Test specific card
curl -s http://localhost:3000/v2/en/cards/sv08.5-079 | jq '.id, .name.en'

# Test set with sealed products
curl -s http://localhost:3000/v2/en/sets/swsh12.5 | jq '.sealedProducts | length'

# Test response time
time curl -s http://localhost:3000/v2/en/cards/sv08.5-079 > /dev/null
```

---

## 📊 Monitoring

### Check API Health
```bash
# Status page
curl http://localhost:3000/status

# OpenAPI docs
curl http://localhost:3000/v2/openapi
```

### Check Database Connections
```bash
docker exec card-db-postgres psql -U cardadmin -d carddb -c "
SELECT count(*) as active_connections 
FROM pg_stat_activity 
WHERE datname = 'carddb';
"
```

### Monitor Query Performance
```bash
docker exec card-db-postgres psql -U cardadmin -d carddb -c "
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
"
```

---

## 🐛 Troubleshooting

### API Not Responding
```bash
# Check if container is running
docker ps | grep stable

# Restart API
docker-compose restart stable

# Check logs for errors
docker-compose logs stable | tail -50
```

### Database Connection Issues
```bash
# Check database is running
docker ps | grep postgres

# Test connection
docker exec card-db-postgres psql -U cardadmin -d carddb -c "SELECT NOW();"

# Check connection pool
curl -s http://localhost:3000/status
```

### Performance Issues
```bash
# Check database indexes
docker exec card-db-postgres psql -U cardadmin -d carddb -c "\di"

# Check slow queries
docker-compose logs stable | grep "slow"
```

---

## 📝 Common Tasks

### Add New Card
```sql
INSERT INTO cards (
  id, game_id, set_id, local_id, name, category, hp, types
) VALUES (
  'sv09-001', 'pokemon', 'sv09', '001',
  '{"en": "Pikachu"}'::jsonb,
  'Pokemon', 70, '["Lightning"]'::jsonb
);
```

### Update Card
```sql
UPDATE cards 
SET hp = 80 
WHERE id = 'sv09-001';
```

### Add Sealed Product
```sql
INSERT INTO sealed_products (
  id, game_id, set_id, name, product_type, pack_count, cards_per_pack
) VALUES (
  'sv09-booster-box', 'pokemon', 'sv09',
  '{"en": "Booster Box"}'::jsonb,
  'booster-box', 36, 10
);
```

---

## 🔗 Important URLs

- **API Base:** `http://localhost:3000`
- **Status Page:** `http://localhost:3000/status`
- **OpenAPI Docs:** `http://localhost:3000/v2/openapi`
- **GraphQL:** `http://localhost:3000/v2/graphql`

---

## 📞 Support

For issues or questions:
1. Check logs: `docker-compose logs -f stable`
2. Validate endpoints: `./final-validation.sh`
3. Review documentation: `MIGRATION_COMPLETE.md`
4. Check database: `docker exec -it card-db-postgres psql -U cardadmin -d carddb`

---

**Last Updated:** November 3, 2025
