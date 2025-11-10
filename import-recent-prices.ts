#!/usr/bin/env bun

/**
 * Import Recent Price History
 *
 * Imports price data from tcgcsv/price-history for recent dates into the database.
 * This is a simplified version that just processes new dates.
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'carddb',
  user: process.env.DB_USER || 'cardadmin',
  password: process.env.DB_PASSWORD || 'zTUriQtdN70spWI5RBfyEl76Vb5/NFHAz8E2w5bD1Ss=',
};

const PRICE_HISTORY_DIR = path.join(__dirname, 'tcgcsv', 'price-history');
const BATCH_SIZE = 1000; // Reduced to avoid PostgreSQL parameter limit (max ~32767 / 8 params per record)

const pool = new Pool(DB_CONFIG);

interface PriceRecord {
  product_id: number;
  variant_id: number;
  recorded_at: string;
  low_price: number | null;
  mid_price: number | null;
  high_price: number | null;
  market_price: number | null;
  direct_low_price: number | null;
}

async function getLatestPriceDate(): Promise<string | null> {
  const result = await pool.query('SELECT MAX(recorded_at)::text as latest FROM price_history');
  return result.rows[0]?.latest || null;
}

async function getVariantMap(): Promise<Map<string, number>> {
  const result = await pool.query('SELECT id, name FROM variants');
  const map = new Map<string, number>();

  result.rows.forEach(row => {
    map.set(row.name.toLowerCase(), row.id);
  });

  // Default mappings
  map.set('normal', 1);
  map.set('foil', 2);

  return map;
}

function parsePriceFile(filePath: string, variantMap: Map<string, number>): PriceRecord[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const records: PriceRecord[] = [];

  try {
    // New format: JSON with results array
    const data = JSON.parse(content);

    if (!data.success || !data.results || !Array.isArray(data.results)) {
      return records;
    }

    const priceToInt = (price: number | null): number | null => {
      if (price === null || price === undefined || isNaN(price)) return null;
      // Prices are in dollars, need to convert to cents
      return Math.round(price * 100);
    };

    for (const item of data.results) {
      const variantName = (item.subTypeName || 'Normal').toLowerCase();
      const variantId = variantMap.get(variantName) || 1;

      records.push({
        product_id: item.productId,
        variant_id: variantId,
        recorded_at: '', // Will be set by caller
        low_price: priceToInt(item.lowPrice),
        mid_price: priceToInt(item.midPrice),
        high_price: priceToInt(item.highPrice),
        market_price: priceToInt(item.marketPrice),
        direct_low_price: priceToInt(item.directLowPrice),
      });
    }
  } catch (error) {
    // Ignore parse errors, return empty array
    console.error(`Failed to parse ${filePath}:`, error);
  }

  return records;
}

async function insertPriceBatch(records: PriceRecord[]) {
  if (records.length === 0) return 0;

  const values: any[] = [];
  const placeholders: string[] = [];

  records.forEach((record, i) => {
    const offset = i * 8;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
    );
    values.push(
      record.product_id,
      record.variant_id,
      record.recorded_at,
      record.low_price,
      record.mid_price,
      record.high_price,
      record.market_price,
      record.direct_low_price
    );
  });

  const query = `
    INSERT INTO price_history (
      product_id, variant_id, recorded_at,
      low_price, mid_price, high_price, market_price, direct_low_price
    )
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (product_id, variant_id, recorded_at) DO UPDATE SET
      low_price = EXCLUDED.low_price,
      mid_price = EXCLUDED.mid_price,
      high_price = EXCLUDED.high_price,
      market_price = EXCLUDED.market_price,
      direct_low_price = EXCLUDED.direct_low_price
  `;

  await pool.query(query, values);
  return records.length;
}

async function processPriceDate(date: string, variantMap: Map<string, number>): Promise<number> {
  const dateDir = path.join(PRICE_HISTORY_DIR, date);

  if (!fs.existsSync(dateDir)) {
    console.log(`⚠️  Directory not found: ${date}`);
    return 0;
  }

  console.log(`\n📅 Processing ${date}...`);

  let totalRecords = 0;
  let batch: PriceRecord[] = [];

  // Walk through all category/group directories
  const categories = fs.readdirSync(dateDir);

  for (const categoryId of categories) {
    const categoryPath = path.join(dateDir, categoryId);
    if (!fs.statSync(categoryPath).isDirectory()) continue;

    const groups = fs.readdirSync(categoryPath);

    for (const groupId of groups) {
      const groupPath = path.join(categoryPath, groupId);
      if (!fs.statSync(groupPath).isDirectory()) continue;

      const priceFile = path.join(groupPath, 'prices');
      if (!fs.existsSync(priceFile)) continue;

      try {
        const records = parsePriceFile(priceFile, variantMap);

        // Set the date for all records
        records.forEach(r => r.recorded_at = date);

        batch.push(...records);

        // Insert in batches
        if (batch.length >= BATCH_SIZE) {
          await insertPriceBatch(batch);
          totalRecords += batch.length;
          process.stdout.write(`\r  💾 Imported ${totalRecords.toLocaleString()} records...`);
          batch = [];
        }
      } catch (error) {
        console.error(`\n❌ Error processing ${priceFile}:`, error);
      }
    }
  }

  // Insert remaining records
  if (batch.length > 0) {
    await insertPriceBatch(batch);
    totalRecords += batch.length;
  }

  console.log(`\r  ✅ Imported ${totalRecords.toLocaleString()} records for ${date}`);

  return totalRecords;
}

async function main() {
  console.log('🚀 Price History Import (Recent Dates)\n');

  try {
    // Connect to database
    console.log('🔌 Connecting to database...');
    await pool.connect();
    console.log('✅ Connected');

    // Get variant mappings
    console.log('📋 Loading variants...');
    const variantMap = await getVariantMap();
    console.log(`✅ Loaded ${variantMap.size} variants`);

    // Get latest date in database
    const latestDate = await getLatestPriceDate();
    console.log(`\n📊 Latest price date in DB: ${latestDate || 'none'}\n`);

    // Get all dates in price-history directory
    const allDates = fs.readdirSync(PRICE_HISTORY_DIR)
      .filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name))
      .sort();

    // Filter to only new dates
    const newDates = latestDate
      ? allDates.filter(date => date > latestDate)
      : allDates;

    if (newDates.length === 0) {
      console.log('✅ No new dates to import');
      return;
    }

    console.log(`📅 Found ${newDates.length} new date(s) to import:`);
    newDates.forEach(date => console.log(`   - ${date}`));

    // Process each date
    let grandTotal = 0;
    const startTime = Date.now();

    for (const date of newDates) {
      const count = await processPriceDate(date, variantMap);
      grandTotal += count;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('✅ Import Complete!');
    console.log('='.repeat(60));
    console.log(`📊 Total records imported: ${grandTotal.toLocaleString()}`);
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`📅 Date range: ${newDates[0]} to ${newDates[newDates.length - 1]}`);
    console.log('');

    // Verify latest date
    const newLatest = await getLatestPriceDate();
    console.log(`✅ Latest price date now: ${newLatest}`);

  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
