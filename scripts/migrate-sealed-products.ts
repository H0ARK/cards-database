#!/usr/bin/env bun
/**
 * Sealed Products Migration Script
 *
 * This script migrates sealed products from TypeScript files to PostgreSQL
 *
 * Usage: bun scripts/migrate-sealed-products.ts
 */

import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'carddb',
  user: process.env.DB_USER || 'cardadmin',
  password: process.env.DB_PASSWORD,
});

// Statistics
const stats = {
  sealedProducts: 0,
  errors: 0,
};

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting sealed products migration to PostgreSQL...\n');

  try {
    // Test database connection
    await testConnection();

    // Get all series directories
    const dataDir = path.join(process.cwd(), 'data');
    const seriesDirs = await getDirectories(dataDir);

    console.log(`📦 Found ${seriesDirs.length} series directories\n`);

    for (const seriesDir of seriesDirs) {
      await migrateSeriesSealedProducts(seriesDir);
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Statistics:');
    console.log(`   Sealed Products: ${stats.sealedProducts}`);
    console.log(`   Errors: ${stats.errors}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Test database connection
 */
async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');
    console.log(`   Time: ${result.rows[0].now}\n`);
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

/**
 * Get all directories in a path
 */
async function getDirectories(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(dirPath, entry.name));
}

/**
 * Get all TypeScript files in a directory
 */
async function getTypeScriptFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
      .map(entry => path.join(dirPath, entry.name));
  } catch (error) {
    return [];
  }
}

/**
 * Migrate sealed products for a series
 */
async function migrateSeriesSealedProducts(seriesPath: string) {
  const seriesName = path.basename(seriesPath);
  console.log(`📂 Processing series: ${seriesName}`);

  try {
    const setDirs = await getDirectories(seriesPath);

    for (const setDir of setDirs) {
      await migrateSetSealedProducts(setDir);
    }
  } catch (error) {
    console.error(`   ⚠️  Error processing series ${seriesName}:`, error);
  }
}

/**
 * Migrate sealed products for a set
 */
async function migrateSetSealedProducts(setPath: string) {
  const setName = path.basename(setPath);

  // Look for sealed directory
  const sealedDir = path.join(setPath, 'sealed');

  try {
    const sealedFiles = await getTypeScriptFiles(sealedDir);

    if (sealedFiles.length > 0) {
      console.log(`   📦 ${setName}: Found ${sealedFiles.length} sealed products`);

      // First, we need to get the set ID from the database
      const setId = await getSetIdFromPath(setPath);

      if (!setId) {
        console.log(`      ⚠️  Skipping - set not found in database`);
        return;
      }

      for (const sealedFile of sealedFiles) {
        await migrateSealedProduct(sealedFile, setId);
      }
    }
  } catch (error) {
    // No sealed products directory or other error, skip silently
  }
}

/**
 * Get set ID from database based on set path
 */
async function getSetIdFromPath(setPath: string): Promise<string | null> {
  try {
    const setName = path.basename(setPath);
    const seriesPath = path.dirname(setPath);

    // The set file is in the series directory with the set name
    const setFilePath = path.join(seriesPath, `${setName}.ts`);
    try {
      const module = await import(setFilePath);
      const setData = module.default || module;
      return setData.id || null;
    } catch (error) {
      // Can't load set file, skip
      return null;
    }
  } catch (error) {
    return null;
  }
}

/**
 * Migrate a sealed product
 */
async function migrateSealedProduct(productPath: string, setId: string) {
  try {
    // Read file as text to avoid import issues
    const fileContent = await fs.readFile(productPath, 'utf-8');

    // Parse the product data from the file
    const productData = parseProductFile(fileContent);

    if (!productData.id) {
      throw new Error('No product ID found in file');
    }

    // Handle name as either string or object
    const nameJson = typeof productData.name === 'string'
      ? JSON.stringify({ en: productData.name })
      : JSON.stringify(productData.name);

    await pool.query(`
      INSERT INTO sealed_products (
        id, game_id, set_id, name, product_type, pack_count, cards_per_pack,
        exclusive, exclusive_retailer, image, third_party, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        product_type = EXCLUDED.product_type,
        pack_count = EXCLUDED.pack_count,
        cards_per_pack = EXCLUDED.cards_per_pack,
        exclusive = EXCLUDED.exclusive,
        exclusive_retailer = EXCLUDED.exclusive_retailer,
        image = EXCLUDED.image,
        third_party = EXCLUDED.third_party,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `, [
      productData.id,
      'pokemon',
      setId,
      nameJson,
      productData.productType || 'unknown',
      productData.packCount || null,
      productData.cardsPerPack || null,
      productData.exclusive || false,
      productData.exclusiveRetailer || null,
      productData.image || null,
      JSON.stringify(productData.thirdParty || {}),
      JSON.stringify({}),
    ]);

    stats.sealedProducts++;
    console.log(`      ✅ ${productData.id}`);
  } catch (error) {
    console.error(`      ⚠️  Error migrating sealed product ${path.basename(productPath)}:`, error);
    stats.errors++;
  }
}

/**
 * Parse product data from TypeScript file content
 */
function parseProductFile(content: string): any {
  const productData: any = {};

  // Extract id
  const idMatch = content.match(/id:\s*["']([^"']+)["']/);
  if (idMatch) productData.id = idMatch[1];

  // Extract name (can be string or object)
  const nameObjMatch = content.match(/name:\s*\{([^}]+)\}/s);
  if (nameObjMatch) {
    const nameObj: any = {};
    const nameLines = nameObjMatch[1];
    const langMatches = nameLines.matchAll(/(\w+):\s*["']([^"']+)["']/g);
    for (const match of langMatches) {
      nameObj[match[1]] = match[2];
    }
    productData.name = nameObj;
  } else {
    const nameStrMatch = content.match(/name:\s*["']([^"']+)["']/);
    if (nameStrMatch) productData.name = nameStrMatch[1];
  }

  // Extract productType
  const typeMatch = content.match(/productType:\s*["']([^"']+)["']/);
  if (typeMatch) productData.productType = typeMatch[1];

  // Extract packCount
  const packCountMatch = content.match(/packCount:\s*(\d+)/);
  if (packCountMatch) productData.packCount = parseInt(packCountMatch[1]);

  // Extract cardsPerPack
  const cardsPerPackMatch = content.match(/cardsPerPack:\s*(\d+)/);
  if (cardsPerPackMatch) productData.cardsPerPack = parseInt(cardsPerPackMatch[1]);

  // Extract exclusive
  const exclusiveMatch = content.match(/exclusive:\s*(true|false)/);
  if (exclusiveMatch) productData.exclusive = exclusiveMatch[1] === 'true';

  // Extract exclusiveRetailer
  const retailerMatch = content.match(/exclusiveRetailer:\s*["']([^"']+)["']/);
  if (retailerMatch) productData.exclusiveRetailer = retailerMatch[1];

  // Extract image
  const imageMatch = content.match(/image:\s*["']([^"']+)["']/);
  if (imageMatch) productData.image = imageMatch[1];

  // Extract thirdParty
  const thirdPartyMatch = content.match(/thirdParty:\s*\{([^}]+)\}/s);
  if (thirdPartyMatch) {
    const thirdParty: any = {};
    const tpLines = thirdPartyMatch[1];
    const tpMatches = tpLines.matchAll(/(\w+):\s*(\d+)/g);
    for (const match of tpMatches) {
      thirdParty[match[1]] = parseInt(match[2]);
    }
    productData.thirdParty = thirdParty;
  }

  return productData;
}

// Run migration
migrate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
