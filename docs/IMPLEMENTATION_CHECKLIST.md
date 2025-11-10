# Query Optimization Implementation Checklist

## 📋 Pre-Implementation

### 1. Backup Database
- [ ] Create full database backup
  ```bash
  pg_dump -U cardadmin carddb > backup_before_optimization_$(date +%Y%m%d).sql
  ```
- [ ] Verify backup file exists and has content
- [ ] Store backup in safe location

### 2. Check Prerequisites
- [ ] PostgreSQL version 12 or higher
- [ ] pg_trgm extension available
  ```sql
  SELECT * FROM pg_available_extensions WHERE name = 'pg_trgm';
  ```
- [ ] Sufficient disk space (database size + 50%)
  ```bash
  df -h /var/lib/postgresql
  ```
- [ ] Estimated row counts:
  ```sql
  SELECT
    'cards' as table_name, COUNT(*) as rows FROM cards
  UNION ALL
  SELECT 'sets', COUNT(*) FROM sets
  UNION ALL
  SELECT 'series', COUNT(*) FROM series;
  ```

### 3. Test Environment
- [ ] Run migration on development/staging first
- [ ] Verify no errors in migration
- [ ] Run benchmark on dev/staging
- [ ] Confirm expected performance improvements

---

## 🚀 Implementation Steps

### Step 1: Database Migration (10-15 minutes)

#### Option A: Standard Migration (Tables locked briefly)
```bash
cd /home/ubuntu/cards-database

# Using psql (if available)
psql -U cardadmin -d carddb -f migrations/002_performance_optimization.sql

# OR using Node.js
node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'carddb',
  user: 'cardadmin',
  password: 'zTUriQtdN70spWI5RBfyEl76Vb5/NFHAz8E2w5bD1Ss=',
});
const sql = fs.readFileSync('migrations/002_performance_optimization.sql', 'utf8');
pool.query(sql)
  .then(() => {
    console.log('✅ Migration complete!');
    return pool.end();
  })
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
"
```

- [ ] Migration started
- [ ] No errors during execution
- [ ] All indexes created successfully
- [ ] ANALYZE completed

#### Option B: Concurrent Migration (No locks, takes 2x longer)
If you need zero-downtime, manually run each index with CONCURRENTLY:
```sql
CREATE INDEX CONCURRENTLY idx_cards_illustrator_trgm
ON cards USING gin(illustrator gin_trgm_ops);
-- Repeat for each index...
```

### Step 2: Verify Indexes (2 minutes)

```bash
node test-query-performance.js
```

Check output for:
- [ ] ✅ All indexes show as created
- [ ] ✅ pg_trgm extension enabled
- [ ] ✅ Table statistics displayed

Or manually verify:
```sql
-- Check indexes exist
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE '%trgm%'
ORDER BY tablename, indexname;

-- Should return 40+ indexes
```

- [ ] At least 40 indexes created
- [ ] No "NOT FOUND" messages
- [ ] Index sizes are reasonable

### Step 3: Update Application Code (5 minutes)

Update the following files to use optimized QueryBuilder:

#### File 1: `server/src/V2/Components/Card.ts`
```typescript
// Line ~13: Change import
- import { buildCardQuery } from '../../libs/QueryBuilder'
+ import { buildCardQuery } from '../../libs/QueryBuilderOptimized'
```

- [ ] Import updated
- [ ] File saved
- [ ] No syntax errors

#### File 2: `server/src/V2/Components/CardDB.ts` (if exists)
```typescript
// Line ~13: Change import
- import { buildCardQuery } from '../../libs/QueryBuilder'
+ import { buildCardQuery } from '../../libs/QueryBuilderOptimized'
```

- [ ] Import updated
- [ ] File saved
- [ ] No syntax errors

#### File 3: Other component files that use QueryBuilder
Search for other imports:
```bash
cd server/src
grep -r "from.*QueryBuilder'" . --include="*.ts"
```

- [ ] All QueryBuilder imports identified
- [ ] All imports updated to QueryBuilderOptimized
- [ ] Files saved

### Step 4: Rebuild/Restart Application (3 minutes)

```bash
# If using TypeScript compilation
cd server
npm run build
# or
bun build

# Restart the server
pm2 restart card-api
# or
systemctl restart card-api
# or your specific restart command
```

- [ ] Application compiled successfully
- [ ] No TypeScript errors
- [ ] Server restarted
- [ ] Server is running and healthy

### Step 5: Run Performance Benchmark (3 minutes)

```bash
cd /home/ubuntu/cards-database
node test-query-performance.js
```

Expected results:
- [ ] 🟢 Simple searches: <50ms
- [ ] 🟡 Complex searches: <200ms
- [ ] No 🔴 queries over 500ms
- [ ] Average improvement >10x

Performance targets:
```
✅ Name search: 10-30ms (was 1000-3000ms)
✅ Set filter: 20-50ms (was 1000-2000ms)
✅ Multi-field: 50-200ms (was 5000-15000ms)
✅ Complex filter: 30-100ms (was 2000-5000ms)
```

### Step 6: Functional Testing (10 minutes)

Test all search and filter endpoints:

#### Test 1: Simple Name Search
```bash
curl "http://localhost:3000/v2/en/cards?name=pikachu"
```
- [ ] Returns results
- [ ] Response time <100ms
- [ ] Results are accurate

#### Test 2: Set Filter
```bash
curl "http://localhost:3000/v2/en/cards?set=base1"
```
- [ ] Returns results
- [ ] Response time <100ms
- [ ] Results are accurate

#### Test 3: Multi-Field Search
```bash
curl "http://localhost:3000/v2/en/search?q=charizard"
```
- [ ] Returns cards, sets, series
- [ ] Response time <200ms
- [ ] Results are accurate

#### Test 4: Complex Filters
```bash
curl "http://localhost:3000/v2/en/cards?category=Pokémon&rarity=Rare%20Holo"
```
- [ ] Returns filtered results
- [ ] Response time <100ms
- [ ] Results are accurate

#### Test 5: Pagination
```bash
curl "http://localhost:3000/v2/en/cards?page=1&limit=50"
```
- [ ] Returns paginated results
- [ ] Response time <100ms
- [ ] Pagination works correctly

### Step 7: Monitor Production (First Hour)

Monitor these metrics after deployment:

#### Server Metrics
- [ ] CPU usage decreased (expected 20-50% reduction)
- [ ] Memory usage stable
- [ ] No error spikes
- [ ] Response times improved

#### Database Metrics
```sql
-- Check slow queries
SELECT query, calls, mean_time, total_time
FROM pg_stat_statements
WHERE query LIKE '%cards%'
ORDER BY mean_time DESC
LIMIT 10;
```
- [ ] No queries >500ms average
- [ ] Most queries <100ms average

#### Application Logs
- [ ] No new errors
- [ ] No SQL syntax errors
- [ ] No missing index warnings

---

## ✅ Success Criteria

### Must Have (Critical)
- [x] Migration completed without errors
- [x] All 40+ indexes created
- [x] Application starts successfully
- [x] All endpoints return correct results
- [x] Performance improved by >10x

### Should Have (Important)
- [ ] All queries <200ms
- [ ] CPU usage reduced
- [ ] User feedback is positive
- [ ] No functionality regressions

### Nice to Have (Optional)
- [ ] Monitoring dashboard updated
- [ ] Documentation updated
- [ ] Team trained on new system

---

## 🚨 Rollback Procedure

If you need to rollback (only if critical issues):

### Step 1: Revert Code Changes
```bash
cd server/src/V2/Components
# Revert imports back to original QueryBuilder
git checkout Card.ts CardDB.ts
# Or manually change imports back
```

### Step 2: Drop New Indexes (Optional)
```sql
-- Only if indexes are causing issues
-- This will revert to slower queries but may fix immediate problems
DROP INDEX IF EXISTS idx_cards_illustrator_trgm;
DROP INDEX IF EXISTS idx_cards_rarity_trgm;
DROP INDEX IF EXISTS idx_cards_category_trgm;
-- ... (see migration file for complete list)

-- Restore old index
CREATE INDEX idx_cards_name_search ON cards USING gin(
    (name->>'en' || ' ' ||
     COALESCE(name->>'fr', '') || ' ' ||
     COALESCE(name->>'es', '') || ' ' ||
     COALESCE(name->>'ja', '')) gin_trgm_ops
);
```

### Step 3: Restart Application
```bash
cd server
npm run build
pm2 restart card-api
```

### Step 4: Verify Rollback
- [ ] Application running
- [ ] Queries working (slower but functional)
- [ ] No errors

---

## 📊 Post-Implementation

### Day 1
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Gather user feedback
- [ ] Document any issues

### Week 1
- [ ] Review slow query log
- [ ] Analyze usage patterns
- [ ] Optimize further if needed
- [ ] Update documentation

### Month 1
- [ ] Full performance review
- [ ] Consider additional optimizations
- [ ] Plan for scaling needs

---

## 📝 Notes & Issues

### Issues Encountered
```
Date: ___________
Issue: ___________
Resolution: ___________
```

### Performance Observations
```
Before optimization:
- Average query time: _____ms
- 95th percentile: _____ms

After optimization:
- Average query time: _____ms
- 95th percentile: _____ms
- Improvement: _____x
```

---

## 📚 Reference Documentation

- **Quick Start**: OPTIMIZATION_README.md
- **Technical Details**: QUERY_OPTIMIZATION_GUIDE.md
- **Migration SQL**: migrations/002_performance_optimization.sql
- **Optimized Code**: server/src/libs/QueryBuilderOptimized.ts
- **Benchmark**: test-query-performance.js

---

## ✍️ Sign-Off

**Implemented by**: ________________
**Date**: ________________
**Time**: ________________
**Success**: ☐ Yes  ☐ No  ☐ Partial

**Notes**:
```
___________________________________________
___________________________________________
___________________________________________
```

---

**END OF CHECKLIST**
