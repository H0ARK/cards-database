# Disk Space Quick Reference 🚀

## Quick Health Check

```bash
# Check disk space
df -h /

# Check Docker container log sizes
sudo du -sh /var/lib/docker/containers/*/

# Check price history size
du -sh /home/ubuntu/cards-database/tcgcsv/price-history/
```

## Emergency: Disk Almost Full

If disk usage > 85%, run these commands:

```bash
# 1. Clean Docker container logs (safest - do this first)
cd /home/ubuntu/cards-database
sudo ./scripts/cleanup-docker-logs.sh --all

# 2. Check space freed
df -h /

# 3. If still needed, clean Docker system
docker system prune -f

# 4. Remove old Docker images (if not needed)
docker image prune -a -f
```

## What We Fixed (Nov 10, 2025)

### Before
- 89GB / 96GB used (93% full) ⚠️
- PostgreSQL logs: 43GB 🔥
- Bloated price files: 791MB

### After
- 46GB / 96GB used (48% full) ✅
- PostgreSQL logs: <1MB
- Price files: 35MB (2 days)
- **Space freed: 44GB**

## Configuration Applied

### Docker Log Rotation (`/etc/docker/daemon.json`)
```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
```

This limits each container to 300MB of logs max (100MB × 3 files).

## Scripts Available

### 1. Cleanup Docker Logs
```bash
sudo ./scripts/cleanup-docker-logs.sh --all
```

### 2. Daily Update (Fixed)
```bash
./scripts/daily-update.sh
# Now uses compressed archives (~18MB/day) instead of bloated API (~100MB/day)
```

### 3. Download Specific Date
```bash
./scripts/daily-update.sh --date 2025-11-01 --skip-prices
```

## Expected Sizes

### Normal Daily Growth
- **Price archive**: ~18-20MB per day
- **Database growth**: ~50-100MB per day
- **Logs**: <100MB per container (auto-rotated)

### Total Expected Monthly Growth
- **Price data**: ~600MB (30 days × 20MB)
- **Database**: ~3GB (30 days × 100MB)
- **Logs**: <300MB (capped by rotation)
- **Total**: ~4GB per month

## Warning Signs

⚠️ Take action if you see:
- Disk usage > 80%
- Any container log > 500MB
- Price history day > 50MB
- Database growing > 200MB/day

## Monthly Maintenance Checklist

```bash
# 1st of each month:
cd /home/ubuntu/cards-database

# 1. Check disk space
df -h /

# 2. Check Docker logs
sudo du -sh /var/lib/docker/containers/*/

# 3. Clean if needed
sudo ./scripts/cleanup-docker-logs.sh --all

# 4. Check database size
docker exec card-db-postgres psql -U cardadmin -d carddb -c "
SELECT
    pg_size_pretty(pg_database_size('carddb')) as db_size,
    pg_size_pretty(pg_total_relation_size('price_history')) as price_table_size,
    COUNT(*) as price_records
FROM price_history;"

# 5. Optional: Vacuum database
docker exec card-db-postgres psql -U cardadmin -d carddb -c "VACUUM ANALYZE;"
```

## Files to Know

- `DISK_SPACE_FIXES.md` - Full documentation of fixes
- `NIGHTLY_UPDATE_STATUS.md` - Nightly update details
- `scripts/cleanup-docker-logs.sh` - Log cleanup utility
- `scripts/daily-update.sh` - Daily update script (fixed)
- `/etc/docker/daemon.json` - Docker log rotation config

## Contact/Notes

Last major cleanup: 2025-11-10
Status: ✅ All systems healthy
Expected growth: ~4GB/month
Next review: 2025-12-01

---

**Pro Tip**: Set a calendar reminder to check disk space on the 1st of each month!
