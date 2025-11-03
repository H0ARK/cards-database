#!/usr/bin/env bun
/**
 * Fix Series IDs Script
 *
 * The migration script incorrectly used slugified directory names as series IDs
 * instead of reading the actual 'id' field from the TypeScript files.
 *
 * This causes image URLs to be wrong because the CDN uses the short series IDs.
 *
 * Example:
 *   Wrong: https://assets.tcgdex.net/en/sun--moon/sm1/1
 *   Right: https://assets.tcgdex.net/en/sm/sm1/1
 *
 * This script:
 * 1. Reads all series TypeScript files to get the correct IDs
 * 2. Creates a mapping of old (slugified) IDs to correct IDs
 * 3. Updates the series table with correct IDs
 * 4. Updates all sets to reference the correct series IDs
 * 5. Rebuilds set logos/symbols with correct series IDs
 *
 * Usage: bun scripts/fix-series-ids.ts
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

interface SeriesMapping {
  oldId: string;  // Slugified directory name (current wrong ID)
  newId: string;  // Actual ID from TypeScript file (correct ID)
  name: any;      // Name object
}

const stats = {
  seriesFixed: 0,
  setsUpdated: 0,
  logosUpdated: 0,
  errors: 0,
};

/**
 * Slugify a string (convert to URL-friendly format)
 * Matches the actual migration script behavior
 */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '--')
    .replace(/^--+|--+$/g, '');
}

/**
 * Extract series ID from TypeScript file content
 */
async function extractSeriesIdFromFile(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Look for: id: "sm",
    const idMatch = content.match(/id:\s*["']([^"']+)["']/);

    if (idMatch && idMatch[1]) {
      return idMatch[1];
    }

    return null;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
}

/**
 * Build mapping of old series IDs to new series IDs
 */
async function buildSeriesMapping(): Promise<SeriesMapping[]> {
  console.log('🔍 Building series ID mapping...\n');

  const dataDir = path.join(process.cwd(), 'data');
  const entries = await fs.readdir(dataDir, { withFileTypes: true });

  const mappings: SeriesMapping[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      // Check if it's a series TypeScript file
      if (entry.name.endsWith('.ts') && entry.name !== 'index.ts') {
        const filePath = path.join(dataDir, entry.name);
        const actualId = await extractSeriesIdFromFile(filePath);

        if (actualId) {
          const dirName = entry.name.replace('.ts', '');
          const slugifiedId = slugify(dirName);

          console.log(`   ${dirName}`);
          console.log(`      Old ID (slugified): ${slugifiedId}`);
          console.log(`      New ID (actual):    ${actualId}`);

          // Only add to mappings if they're different
          if (slugifiedId !== actualId) {
            // Get the name from database
            const result = await pool.query(
              'SELECT name FROM series WHERE id = $1',
              [slugifiedId]
            );

            if (result.rows.length > 0) {
              mappings.push({
                oldId: slugifiedId,
                newId: actualId,
                name: result.rows[0].name,
              });
              console.log(`      ⚠️  MISMATCH - Will fix!`);
            } else {
              console.log(`      ℹ️  Not found in database (may use actual ID already)`);
            }
          } else {
            console.log(`      ✅ Already correct`);
          }
          console.log('');
        }
      }
    }
  }

  return mappings;
}

/**
 * Apply series ID fixes
 */
async function applySeriesFixes(mappings: SeriesMapping[]): Promise<void> {
  if (mappings.length === 0) {
    console.log('✅ No series IDs need fixing!\n');
    return;
  }

  console.log(`\n🔧 Fixing ${mappings.length} series IDs...\n`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const mapping of mappings) {
      console.log(`   Fixing: ${mapping.oldId} → ${mapping.newId}`);

      // 1. Check if new ID already exists (conflict)
      const existingResult = await client.query(
        'SELECT id FROM series WHERE id = $1',
        [mapping.newId]
      );

      if (existingResult.rows.length > 0) {
        console.log(`      ⚠️  Series ${mapping.newId} already exists, will merge data`);

        // Update all sets that reference the old ID to use the new ID
        const setsUpdated = await client.query(
          'UPDATE sets SET series_id = $1 WHERE series_id = $2',
          [mapping.newId, mapping.oldId]
        );
        stats.setsUpdated += setsUpdated.rowCount || 0;

        // Delete the old series entry
        await client.query('DELETE FROM series WHERE id = $1', [mapping.oldId]);

      } else {
        // Strategy: INSERT new series with correct ID, UPDATE sets, DELETE old series

        // 1. Insert new series with correct ID
        await client.query(
          'INSERT INTO series (id, game_id, name, slug, logo, metadata, created_at, updated_at) SELECT $1, game_id, name, $1, logo, metadata, created_at, updated_at FROM series WHERE id = $2',
          [mapping.newId, mapping.oldId]
        );

        // 2. Update all sets to reference the new series ID
        const setsUpdated = await client.query(
          'UPDATE sets SET series_id = $1 WHERE series_id = $2',
          [mapping.newId, mapping.oldId]
        );
        stats.setsUpdated += setsUpdated.rowCount || 0;

        // 3. Delete the old series
        await client.query('DELETE FROM series WHERE id = $1', [mapping.oldId]);
      }

      stats.seriesFixed++;
      console.log(`      ✅ Fixed (${stats.setsUpdated} sets updated)`);
    }

    await client.query('COMMIT');
    console.log('\n✅ All series IDs fixed!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error applying fixes:', error);
    stats.errors++;
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Rebuild set logos and symbols with correct series IDs
 */
async function rebuildSetLogos(): Promise<void> {
  console.log('\n🔧 Rebuilding set logos and symbols with correct series IDs...\n');

  try {
    const result = await pool.query(`
      SELECT id, series_id FROM sets
    `);

    for (const set of result.rows) {
      const logo = `https://assets.tcgdex.net/en/${set.series_id}/${set.id}/logo`;
      const symbol = `https://assets.tcgdex.net/univ/${set.series_id}/${set.id}/symbol`;

      await pool.query(
        'UPDATE sets SET logo = $1, symbol = $2 WHERE id = $3',
        [logo, symbol, set.id]
      );

      stats.logosUpdated++;
    }

    console.log(`   ✅ Updated ${stats.logosUpdated} set logos/symbols`);

  } catch (error) {
    console.error('   ❌ Error rebuilding logos:', error);
    stats.errors++;
  }
}

/**
 * Rebuild series logos with correct IDs
 */
async function rebuildSeriesLogos(): Promise<void> {
  console.log('\n🔧 Rebuilding series logos with correct IDs...\n');

  try {
    const result = await pool.query('SELECT id FROM series');

    for (const series of result.rows) {
      const logo = `https://assets.tcgdex.net/en/${series.id}/logo`;

      await pool.query(
        'UPDATE series SET logo = $1 WHERE id = $2',
        [logo, series.id]
      );
    }

    console.log(`   ✅ Updated ${result.rows.length} series logos`);

  } catch (error) {
    console.error('   ❌ Error rebuilding series logos:', error);
    stats.errors++;
  }
}

/**
 * Verify fixes by checking a sample card
 */
async function verifyFixes(): Promise<void> {
  console.log('\n🔍 Verifying fixes...\n');

  try {
    // Check a Sun & Moon card
    const result = await pool.query(`
      SELECT
        c.id,
        c.set_id,
        s.series_id,
        s.logo as set_logo
      FROM cards c
      JOIN sets s ON c.set_id = s.id
      WHERE c.id = 'sm1-1'
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      const card = result.rows[0];
      console.log(`   Card: ${card.id}`);
      console.log(`   Set: ${card.set_id}`);
      console.log(`   Series ID: ${card.series_id}`);
      console.log(`   Set Logo: ${card.set_logo}`);

      const expectedImageUrl = `https://assets.tcgdex.net/en/${card.series_id}/${card.set_id}/1`;
      console.log(`   Expected Image URL: ${expectedImageUrl}`);

      if (card.series_id === 'sm') {
        console.log('\n   ✅ Series ID is correct (sm)!');
      } else {
        console.log(`\n   ⚠️  Series ID is still wrong: ${card.series_id} (expected: sm)`);
      }
    } else {
      console.log('   ℹ️  Sample card not found (sm1-1)');
    }

  } catch (error) {
    console.error('   ❌ Error verifying fixes:', error);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚀 Series ID Fix Script');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful\n');

    // Build mapping
    const mappings = await buildSeriesMapping();

    if (mappings.length === 0) {
      console.log('\n✅ All series IDs are already correct!');
      console.log('   No fixes needed.\n');
    } else {
      console.log('\n📋 Series IDs to fix:');
      mappings.forEach(m => {
        console.log(`   - ${m.oldId} → ${m.newId}`);
      });

      // Apply fixes
      await applySeriesFixes(mappings);

      // Rebuild URLs
      await rebuildSetLogos();
      await rebuildSeriesLogos();

      // Verify
      await verifyFixes();

      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('📊 FIX SUMMARY');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`Series fixed: ${stats.seriesFixed}`);
      console.log(`Sets updated: ${stats.setsUpdated}`);
      console.log(`Logos rebuilt: ${stats.logosUpdated}`);
      console.log(`Errors: ${stats.errors}`);
      console.log('═══════════════════════════════════════════════════════════\n');

      if (stats.errors === 0) {
        console.log('✅ All fixes completed successfully!');
        console.log('\n💡 Next steps:');
        console.log('   1. Restart the API: docker-compose restart stable');
        console.log('   2. Clear API cache: curl http://localhost:3000/v2/cache/clear');
        console.log('   3. Test image URLs in frontend');
        console.log('   4. Verify CDN images load correctly\n');
      } else {
        console.log('⚠️  Some errors occurred. Please review the output above.\n');
      }
    }

  } catch (error) {
    console.error('❌ Script failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
