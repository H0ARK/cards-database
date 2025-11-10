import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || 'cardadmin',
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'carddb',
  port: parseInt(process.env.DB_PORT || '5432'),
});

// Configuration
const TCGCSV_PATH = process.env.TCGCSV_PATH || path.resolve(__dirname, '../tcgcsv');
const PRICE_HISTORY_PATH = path.join(TCGCSV_PATH, 'price-history');
const BATCH_SIZE = 5000;
const LOG_INTERVAL = 100;

// Worker configuration (for parallel execution)
const WORKER_ID = process.env.WORKER || '1';
const START_DATE = process.env.START_DATE || '2024-02-08';
const END_DATE = process.env.END_DATE || '2025-11-01';

// Stats tracking
let stats = {
  datesProcessed: 0,
  filesProcessed: 0,
  recordsInserted: 0,
  filesDeleted: 0,
  errors: 0,
  skippedNoProduct: 0,
  highValueCards: 0,
  startTime: Date.now(),
};

// Variant cache
const variantCache = new Map<string, number>();

// Log file (per worker)
const LOG_FILE = path.join(__dirname, `worker${WORKER_ID}-progress.log`);

async function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  await fs.appendFile(LOG_FILE, logMessage);
}

async function checkDiskSpace() {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    exec('df -h /home/ubuntu | tail -1', (error: any, stdout: string) => {
      if (!error) {
        console.log(`💾 Disk space: ${stdout.trim()}`);
      }
      resolve(true);
    });
  });
}

async function loadVariantCache() {
  const result = await pool.query('SELECT id, name FROM variants');
  for (const row of result.rows) {
    variantCache.set(row.name, row.id);
  }
  await log(`✅ Loaded ${variantCache.size} variants into cache`);
}

async function getOrCreateVariantId(variantName: string): Promise<number> {
  if (variantCache.has(variantName)) {
    return variantCache.get(variantName)!;
  }

  try {
    const result = await pool.query(
      'INSERT INTO variants (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
      [variantName]
    );
    const id = result.rows[0].id;
    variantCache.set(variantName, id);
    return id;
  } catch (error) {
    const result = await pool.query('SELECT id FROM variants WHERE name = $1', [variantName]);
    const id = result.rows[0].id;
    variantCache.set(variantName, id);
    return id;
  }
}

function priceToSmallInt(price: number | null): number | null {
  if (price === null || price === undefined) return null;
  const cents = Math.round(price * 100);
  if (cents > 32767) return null; // SMALLINT max
  return cents;
}

function needsUsdPrices(product: any): boolean {
  return (
    (product.lowPrice && product.lowPrice > 327.67) ||
    (product.midPrice && product.midPrice > 327.67) ||
    (product.highPrice && product.highPrice > 327.67) ||
    (product.marketPrice && product.marketPrice > 327.67)
  );
}

async function getDateFolders(): Promise<string[]> {
  const folders = await fs.readdir(PRICE_HISTORY_PATH);
  return folders
    .filter(folder => /^\d{4}-\d{2}-\d{2}$/.test(folder))
    .filter(folder => folder >= START_DATE && folder <= END_DATE)
    .sort();
}

async function processDateFolder(dateFolder: string): Promise<void> {
  const datePath = path.join(PRICE_HISTORY_PATH, dateFolder);
  const recordedAt = dateFolder;

  await log(`📅 [Worker ${WORKER_ID}] Processing date: ${dateFolder}`);

  const categories = await fs.readdir(datePath);

  for (const category of categories) {
    const categoryPath = path.join(datePath, category);
    const categoryStat = await fs.stat(categoryPath);

    if (!categoryStat.isDirectory()) continue;

    const setDirs = await fs.readdir(categoryPath);

    for (const setDir of setDirs) {
      const setPath = path.join(categoryPath, setDir);
      const pricesFile = path.join(setPath, 'prices');

      try {
        await fs.access(pricesFile);
      } catch {
        continue;
      }

      try {
        const fileContent = await fs.readFile(pricesFile, 'utf8');
        const data = JSON.parse(fileContent);

        if (!data.success || !Array.isArray(data.results)) {
          await log(`⚠️  Invalid format: ${pricesFile}`);
          stats.errors++;
          continue;
        }

        const records = [];

        for (const product of data.results) {
          const variantId = await getOrCreateVariantId(product.subTypeName || 'Normal');
          const needsUsd = needsUsdPrices(product);

          if (needsUsd) {
            stats.highValueCards++;
          }

          const record = {
            product_id: product.productId,
            variant_id: variantId,
            recorded_at: recordedAt,
            low_price: priceToSmallInt(product.lowPrice),
            mid_price: priceToSmallInt(product.midPrice),
            high_price: priceToSmallInt(product.highPrice),
            market_price: priceToSmallInt(product.marketPrice),
            direct_low_price: priceToSmallInt(product.directLowPrice),
            low_price_usd: needsUsd ? product.lowPrice : null,
            mid_price_usd: needsUsd ? product.midPrice : null,
            high_price_usd: needsUsd ? product.highPrice : null,
            market_price_usd: needsUsd ? product.marketPrice : null,
          };

          records.push(record);
        }

        await insertBatch(records);

        stats.recordsInserted += records.length;
        stats.filesProcessed++;

        // Delete file after successful insert
        await fs.unlink(pricesFile);
        stats.filesDeleted++;

        if (stats.filesProcessed % LOG_INTERVAL === 0) {
          await logProgress();
        }

      } catch (error: any) {
        await log(`❌ Error processing ${pricesFile}: ${error.message}`);
        stats.errors++;
      }
    }

    // Clean up empty directories
    try {
      for (const setDir of setDirs) {
        const setPath = path.join(categoryPath, setDir);
        const files = await fs.readdir(setPath);
        if (files.length === 0) {
          await fs.rmdir(setPath);
        }
      }
    } catch {}
  }

  // Clean up empty category directories
  try {
    for (const category of categories) {
      const categoryPath = path.join(datePath, category);
      const files = await fs.readdir(categoryPath);
      if (files.length === 0) {
        await fs.rmdir(categoryPath);
      }
    }
  } catch {}

  // Clean up empty date directory
  try {
    const files = await fs.readdir(datePath);
    if (files.length === 0) {
      await fs.rmdir(datePath);
    }
  } catch {}

  stats.datesProcessed++;
}

async function insertBatch(records: any[]): Promise<void> {
  if (records.length === 0) return;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const record of records) {
      placeholders.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11})`
      );
      values.push(
        record.product_id,
        record.variant_id,
        record.recorded_at,
        record.low_price,
        record.mid_price,
        record.high_price,
        record.market_price,
        record.direct_low_price,
        record.low_price_usd,
        record.mid_price_usd,
        record.high_price_usd,
        record.market_price_usd
      );
      paramIndex += 12;
    }

    const query = `
      INSERT INTO price_history (
        product_id, variant_id, recorded_at,
        low_price, mid_price, high_price, market_price, direct_low_price,
        low_price_usd, mid_price_usd, high_price_usd, market_price_usd
      )
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (product_id, variant_id, recorded_at) DO NOTHING
    `;

    await client.query(query, values);
    await client.query('COMMIT');
  } catch (error: any) {
    await client.query('ROLLBACK');

    // Check if it's a FK constraint violation (product doesn't exist)
    if (error.message.includes('violates foreign key constraint')) {
      stats.skippedNoProduct += records.length;
    } else {
      throw error;
    }
  } finally {
    client.release();
  }
}

async function logProgress() {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rate = stats.filesProcessed / elapsed;

  await log(`
📊 Progress:
   Dates: ${stats.datesProcessed}
   Files: ${stats.filesProcessed}
   Records: ${stats.recordsInserted.toLocaleString()}
   Deleted: ${stats.filesDeleted}
   Skipped (no product): ${stats.skippedNoProduct}
   High-value: ${stats.highValueCards}
   Errors: ${stats.errors}
   Elapsed: ${Math.floor(elapsed)}s
   Rate: ${rate.toFixed(2)} files/sec
  `);

  await checkDiskSpace();
}

async function main() {
  try {
    await log(`🚀 [Worker ${WORKER_ID}] Starting price history migration (normalized schema)...`);
    await log(`Source: ${PRICE_HISTORY_PATH}`);
    await log(`Date range: ${START_DATE} to ${END_DATE}`);

    const testResult = await pool.query('SELECT NOW()');
    await log(`✅ Database connected: ${testResult.rows[0].now}`);

    await loadVariantCache();

    const dateFolders = await getDateFolders();
    await log(`📁 Found ${dateFolders.length} date folders`);

    if (dateFolders.length === 0) {
      await log('⚠️  No date folders found');
      return;
    }

    await log(`📅 Range: ${dateFolders[0]} to ${dateFolders[dateFolders.length - 1]}`);
    await checkDiskSpace();

    for (const dateFolder of dateFolders) {
      await processDateFolder(dateFolder);
    }

    const elapsed = (Date.now() - stats.startTime) / 1000;

    await log(`
🎉 [Worker ${WORKER_ID}] Migration Complete!

   Dates processed: ${stats.datesProcessed}
   Files processed: ${stats.filesProcessed}
   Records inserted: ${stats.recordsInserted.toLocaleString()}
   Files deleted: ${stats.filesDeleted}
   Skipped (no product): ${stats.skippedNoProduct}
   High-value cards: ${stats.highValueCards}
   Errors: ${stats.errors}
   Time: ${Math.floor(elapsed)}s (${(elapsed / 60).toFixed(1)} min)
    `);

    await checkDiskSpace();

    const dbStats = await pool.query(`
      SELECT
        COUNT(*) as total_records,
        COUNT(DISTINCT product_id) as unique_products,
        COUNT(DISTINCT recorded_at) as unique_dates,
        pg_size_pretty(pg_total_relation_size('price_history')) as table_size
      FROM price_history
    `);

    await log(`
📈 Database Stats:
   Records: ${dbStats.rows[0].total_records.toLocaleString()}
   Products: ${dbStats.rows[0].unique_products.toLocaleString()}
   Dates: ${dbStats.rows[0].unique_dates}
   Size: ${dbStats.rows[0].table_size}
    `);

  } catch (error: any) {
    await log(`💥 Fatal error: ${error.message}`);
    await log(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

process.on('SIGINT', async () => {
  await log('\n⚠️  SIGINT received, shutting down...');
  await logProgress();
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await log('\n⚠️  SIGTERM received, shutting down...');
  await logProgress();
  await pool.end();
  process.exit(0);
});

main();
