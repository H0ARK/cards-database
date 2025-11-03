#!/usr/bin/env bun
/**
 * Migrate Set Third-Party Data Script
 *
 * This script migrates set-level third-party IDs (TCGPlayer group IDs and Cardmarket IDs)
 * from TypeScript files to the database. These IDs are needed for pricing lookups.
 *
 * Usage: bun scripts/migrate-set-third-party.ts
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
  password: process.env.DB_PASSWORD || 'cardadmin',
});

const stats = {
  setsProcessed: 0,
  setsUpdated: 0,
  setsMissingThirdParty: 0,
  errors: 0,
};

/**
 * Extract third-party data from TypeScript file content
 */
function extractThirdPartyData(content: string): { tcgplayer?: number; cardmarket?: number } | null {
  const thirdParty: { tcgplayer?: number; cardmarket?: number } = {};

  // Look for: thirdParty: { ... }
  const thirdPartyMatch = content.match(/thirdParty:\s*\{([^}]+)\}/s);

  if (!thirdPartyMatch) {
    return null;
  }

  const thirdPartyBlock = thirdPartyMatch[1];

  // Extract TCGPlayer ID
  const tcgplayerMatch = thirdPartyBlock.match(/tcgplayer:\s*(\d+)/);
  if (tcgplayerMatch) {
    thirdParty.tcgplayer = parseInt(tcgplayerMatch[1], 10);
  }

  // Extract Cardmarket ID
  const cardmarketMatch = thirdPartyBlock.match(/cardmarket:\s*(\d+)/);
  if (cardmarketMatch) {
    thirdParty.cardmarket = parseInt(cardmarketMatch[1], 10);
  }

  return Object.keys(thirdParty).length > 0 ? thirdParty : null;
}

/**
 * Extract set ID from TypeScript file content
 */
function extractSetId(content: string): string | null {
  // Look for: id: "sm1",
  const idMatch = content.match(/id:\s*["']([^"']+)["']/);
  return idMatch ? idMatch[1] : null;
}

/**
 * Find and process all set TypeScript files
 */
async function processSetFiles() {
  console.log('🔍 Scanning for set TypeScript files...\n');

  const dataDir = path.join(process.cwd(), 'data');
  const setFiles: string[] = [];

  // Recursively find all .ts files in series directories
  async function findSetFiles(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await findSetFiles(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.includes('index')) {
        // Check if it's in a series directory (not a series file itself)
        const relativePath = path.relative(dataDir, fullPath);
        const pathParts = relativePath.split(path.sep);

        // Series files are directly in data/, set files are in subdirectories
        if (pathParts.length > 1) {
          setFiles.push(fullPath);
        }
      }
    }
  }

  await findSetFiles(dataDir);

  console.log(`📦 Found ${setFiles.length} set files to process\n`);

  for (const filePath of setFiles) {
    await processSetFile(filePath);
  }
}

/**
 * Process a single set TypeScript file
 */
async function processSetFile(filePath: string) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    const setId = extractSetId(content);
    const thirdPartyData = extractThirdPartyData(content);

    if (!setId) {
      console.log(`   ⚠️  Could not extract set ID from: ${path.basename(filePath)}`);
      stats.errors++;
      return;
    }

    stats.setsProcessed++;

    if (!thirdPartyData) {
      stats.setsMissingThirdParty++;
      return;
    }

    // Check if set exists in database
    const checkResult = await pool.query(
      'SELECT id, metadata FROM sets WHERE id = $1',
      [setId]
    );

    if (checkResult.rows.length === 0) {
      console.log(`   ⚠️  Set ${setId} not found in database`);
      stats.errors++;
      return;
    }

    // Update the set's metadata with third_party data
    const currentMetadata = checkResult.rows[0].metadata || {};
    const updatedMetadata = {
      ...currentMetadata,
      third_party: thirdPartyData,
    };

    await pool.query(
      'UPDATE sets SET metadata = $1 WHERE id = $2',
      [JSON.stringify(updatedMetadata), setId]
    );

    console.log(`   ✅ Updated ${setId}: TCGPlayer=${thirdPartyData.tcgplayer || 'none'}, Cardmarket=${thirdPartyData.cardmarket || 'none'}`);
    stats.setsUpdated++;

  } catch (error) {
    console.error(`   ❌ Error processing ${filePath}:`, error);
    stats.errors++;
  }
}

/**
 * Verify the migration by checking a sample set
 */
async function verifyMigration() {
  console.log('\n🔍 Verifying migration...\n');

  try {
    const result = await pool.query(`
      SELECT id, metadata->'third_party' as third_party
      FROM sets
      WHERE metadata->'third_party' IS NOT NULL
      LIMIT 5
    `);

    if (result.rows.length === 0) {
      console.log('   ⚠️  No sets found with third_party data');
      return;
    }

    console.log('   Sample sets with third_party data:');
    result.rows.forEach(row => {
      console.log(`   - ${row.id}: ${JSON.stringify(row.third_party)}`);
    });

    // Check total count
    const countResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM sets
      WHERE metadata->'third_party' IS NOT NULL
    `);

    console.log(`\n   Total sets with third_party data: ${countResult.rows[0].count}`);

  } catch (error) {
    console.error('   ❌ Error verifying migration:', error);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚀 Set Third-Party Data Migration Script');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful\n');

    // Process all set files
    await processSetFiles();

    // Verify
    await verifyMigration();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 MIGRATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Sets processed: ${stats.setsProcessed}`);
    console.log(`Sets updated: ${stats.setsUpdated}`);
    console.log(`Sets missing third_party: ${stats.setsMissingThirdParty}`);
    console.log(`Errors: ${stats.errors}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    if (stats.errors === 0) {
      console.log('✅ Migration completed successfully!');
      console.log('\n💡 Next steps:');
      console.log('   1. Restart the API: docker-compose restart stable');
      console.log('   2. TCGPlayer pricing should now work for cards with variant product IDs');
      console.log('   3. Test a card: curl http://localhost:3000/v2/en/cards/swsh3-136');
    } else {
      console.log('⚠️  Migration completed with some errors. Please review the output above.');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
