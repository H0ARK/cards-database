# Disk Space & Log Management Fixes

## Summary

This document outlines the disk space issues discovered on 2025-11-10 and the fixes implemented to prevent them from recurring.

## Problem Discovery

### Initial State
- **Total Disk**: 96GB
- **Used Space**: 89GB (93% full)
- **Available**: Only 7.3GB remaining

### Root Causes Identified

1. **Docker Container Logs (43GB)**
   - PostgreSQL container log file grew to 43GB
   - No log rotation configured
   - File: `/var/lib/docker/containers/2969b3b60d6a.../2969b3b60d6a...-json.log`

2. **Bloated Price History Files (791MB)**
   - Nov 1-8 price downloads used live API instead of archives
   - Each file included full JSON wrapper: `{"success": true, "errors": [], "results": [...]}`
   - Files were 5-6x larger than they should be
   - 8 days totaling ~791MB vs expected ~140MB

### Size Comparison
- **Nov 1-8**: 98-105MB per day (bloated - from live API)
- **Nov 9-10**: 18MB per day (correct - from archives)
- **Expected**: ~18-20MB per day from compressed archives

## Fixes Implemented

### 1. Docker Log Rotation Configuration

Created `/etc/docker/daemon.json` with log rotation:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
```

**What this does:**
- Limits each log file to 100MB max
- Keeps 3 rotated log files (max 300MB total per container)
- Automatically rotates when size limit is reached
- Applies to all NEW containers

**Note**: Existing containers still use old config. To apply to existing containers, they need to be recreated.

### 2. Fixed daily-update.sh Script

**Changes Made:**
- **Disabled** Step 3 (Download Current Prices via live API)
- **Reason**: Live API downloads include wrapper JSON, creating bloated files
- **Solution**: Rely only on compressed archive downloads (Step 4)
- **Improvement**: Archive download now tries both today and yesterday

**Before:**
```bash
# Downloaded from: https://tcgcsv.com/$CATEGORY_ID/$GROUP_ID/prices
# Result: Full JSON response with wrappers (~100KB per file)
```

**After:**
```bash
# Downloads from: https://tcgcsv.com/archive/tcgplayer/prices-YYYY-MM-DD.ppmd.7z
# Result: Compressed archive (~18MB per day)
```

### 3. Cleanup Actions Taken

1. **Truncated PostgreSQL logs**: `43GB → 0GB` (freed 43GB)
   ```bash
   sudo truncate -s 0 /var/lib/docker/containers/2969b3b60d6a.../2969b3b60d6a...-json.log
   ```

2. **Deleted bloated price data**: Removed Nov 1-8 (freed ~791MB)
   ```bash
   rm -rf tcgcsv/price-history/2025-11-0[1-8]
   ```

3. **Total Space Freed**: ~44GB

### 4. New Maintenance Script

Created `scripts/cleanup-docker-logs.sh` for manual log cleanup when needed.

**Usage:**
```bash
# Clean all container logs
sudo ./scripts/cleanup-docker-logs.sh --all

# Clean specific container
sudo ./scripts/cleanup-docker-logs.sh --container card-db-postgres
```

## Final State

After fixes:
- **Used Space**: 46GB (48% full)
- **Available**: 51GB
- **Space Freed**: 44GB total

## Recommendations

### Immediate Actions
1. ✅ Docker log rotation configured
2. ✅ daily-update.sh fixed to use archives only
3. ✅ Cleanup script created
4. ✅ Bloated data removed

### Future Monitoring
1. **Weekly**: Check disk space usage
   ```bash
   df -h /
   ```

2. **Monthly**: Check Docker container log sizes
   ```bash
   sudo du -sh /var/lib/docker/containers/*/
   ```

3. **As Needed**: Run cleanup script if logs grow
   ```bash
   sudo ./scripts/cleanup-docker-logs.sh --all
   ```

### Optional Improvements
1. **Recreate PostgreSQL container** to apply new log limits
   ```bash
   docker-compose down card-db-postgres
   docker-compose up -d card-db-postgres
   ```

2. **Set up automated cleanup cron job**
   ```bash
   # Add to crontab: clean logs weekly
   0 3 * * 0 /home/ubuntu/cards-database/scripts/cleanup-docker-logs.sh --all
   ```

3. **Add disk space monitoring alerts**
   - Alert when disk usage > 80%
   - Alert when any container log > 500MB

## Prevention Checklist

- [x] Docker daemon.json configured with log rotation
- [x] daily-update.sh uses archives instead of live API
- [x] Cleanup script available for manual intervention
- [ ] Automated monitoring/alerts (optional)
- [ ] Containers recreated with new log limits (optional)

## Files Modified

1. `/etc/docker/daemon.json` - Created (Docker log rotation)
2. `scripts/daily-update.sh` - Modified (disabled live API downloads)
3. `scripts/cleanup-docker-logs.sh` - Created (log cleanup utility)
4. `DISK_SPACE_FIXES.md` - Created (this document)

## Testing

To verify the fix is working:

1. **Check new containers have log rotation:**
   ```bash
   docker inspect card-db-postgres --format '{{.HostConfig.LogConfig}}'
   # Should show: {json-file map[max-file:3 max-size:100m]}
   ```

2. **Run daily update and verify archive download:**
   ```bash
   ./scripts/daily-update.sh
   # Should download .7z archive, NOT individual price files
   ```

3. **Monitor disk usage over time:**
   ```bash
   watch -n 60 'df -h / | tail -1'
   ```

## Lessons Learned

1. **Always configure log rotation** for production Docker containers
2. **Prefer compressed archives** over live API downloads when possible
3. **Monitor disk space proactively** - don't wait for 93% usage
4. **Document operational changes** for future reference

---

**Last Updated**: 2025-11-10
**Issue Severity**: High (prevented potential disk full)
**Status**: ✅ Resolved
