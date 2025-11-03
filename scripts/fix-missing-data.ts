#!/usr/bin/env bun
/**
 * Fix Missing Data Script
 *
 * This script populates all missing constructed/calculated data in PostgreSQL:
 * 1. Set logos and symbols (constructed URLs)
 * 2. Set card_count.total (calculated from actual card count)
 * 3. Series logos (constructed URLs)
 * 4. Card legal.standard and legal.expanded (calculated based on regulation marks and release dates)
 *
 * Usage: bun scripts/fix-missing-data.ts
 */

import { Pool } from 'pg';

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'carddb',
  user: process.env.DB_USER || 'cardadmin',
  password: process.env.DB_PASSWORD || 'cardadmin',
});

const stats = {
  setsUpdated: 0,
  seriesUpdated: 0,
  cardsUpdated: 0,
  errors: 0,
};

/**
 * Construct set logo URL
 * Pattern: https://assets.tcgdex.net/{lang}/{series_id}/{set_id}/logo
 */
function constructSetLogoURL(seriesId: string, setId: string, lang: string = 'en'): string {
  return `https://assets.tcgdex.net/${lang}/${seriesId}/${setId}/logo`;
}

/**
 * Construct set symbol URL
 * Pattern: https://assets.tcgdex.net/univ/{series_id}/{set_id}/symbol
 */
function constructSetSymbolURL(seriesId: string, setId: string): string {
  return `https://assets.tcgdex.net/univ/${seriesId}/${setId}/symbol`;
}

/**
 * Construct series logo URL
 * Pattern: https://assets.tcgdex.net/{lang}/{series_id}/logo
 */
function constructSeriesLogoURL(seriesId: string, lang: string = 'en'): string {
  return `https://assets.tcgdex.net/${lang}/${seriesId}/logo`;
}

/**
 * Calculate card legality based on regulation mark
 * Based on Pokemon TCG rules:
 * - Standard: Regulation marks D and later (current as of 2024)
 * - Expanded: All cards with regulation marks
 */
function calculateLegality(regulationMark: string | null, releaseDate: string | null): { standard: boolean; expanded: boolean } {
  const legal = {
    standard: false,
    expanded: false,
  };

  if (!regulationMark && !releaseDate) {
    // No regulation mark and no release date - assume not legal
    return legal;
  }

  // Expanded: includes most modern cards
  // For simplicity, cards with regulation marks are expanded legal
  if (regulationMark) {
    legal.expanded = true;

    // Standard: regulation marks D, E, F, G, H (as of 2024-2025)
    const standardMarks = ['D', 'E', 'F', 'G', 'H'];
    if (standardMarks.includes(regulationMark.toUpperCase())) {
      legal.standard = true;
    }
  } else if (releaseDate) {
    // Cards without regulation marks
    // Expanded includes cards from XY era onwards (2013+)
    const year = new Date(releaseDate).getFullYear();
    if (year >= 2013) {
      legal.expanded = true;
    }
  }

  return legal;
}

/**
 * Fix set logos and symbols
 */
async function fixSetLogosAndSymbols() {
  console.log('\n🔧 Fixing set logos and symbols...');

  try {
    const result = await pool.query(`
      SELECT id, series_id
      FROM sets
      WHERE logo IS NULL OR logo = '' OR symbol IS NULL OR symbol = ''
    `);

    console.log(`   Found ${result.rows.length} sets to update`);

    for (const set of result.rows) {
      const logo = constructSetLogoURL(set.series_id, set.id);
      const symbol = constructSetSymbolURL(set.series_id, set.id);

      await pool.query(`
        UPDATE sets
        SET logo = $1, symbol = $2
        WHERE id = $3
      `, [logo, symbol, set.id]);

      stats.setsUpdated++;
    }

    console.log(`   ✅ Updated ${stats.setsUpdated} sets`);
  } catch (error) {
    console.error('   ❌ Error fixing set logos/symbols:', error);
    stats.errors++;
  }
}

/**
 * Fix set card_count.total
 */
async function fixSetCardCountTotal() {
  console.log('\n🔧 Fixing set card_count.total...');

  try {
    const result = await pool.query(`
      SELECT
        s.id,
        s.card_count,
        COUNT(c.id) as actual_count
      FROM sets s
      LEFT JOIN cards c ON c.set_id = s.id
      GROUP BY s.id, s.card_count
    `);

    console.log(`   Found ${result.rows.length} sets to check`);

    let updated = 0;
    for (const set of result.rows) {
      const currentCardCount = set.card_count || {};
      const newCardCount = {
        ...currentCardCount,
        total: parseInt(set.actual_count),
      };

      await pool.query(`
        UPDATE sets
        SET card_count = $1
        WHERE id = $2
      `, [JSON.stringify(newCardCount), set.id]);

      updated++;
    }

    console.log(`   ✅ Updated ${updated} sets with card_count.total`);
  } catch (error) {
    console.error('   ❌ Error fixing card_count.total:', error);
    stats.errors++;
  }
}

/**
 * Fix series logos
 */
async function fixSeriesLogos() {
  console.log('\n🔧 Fixing series logos...');

  try {
    const result = await pool.query(`
      SELECT id
      FROM series
      WHERE logo IS NULL OR logo = ''
    `);

    console.log(`   Found ${result.rows.length} series to update`);

    for (const series of result.rows) {
      const logo = constructSeriesLogoURL(series.id);

      await pool.query(`
        UPDATE series
        SET logo = $1
        WHERE id = $2
      `, [logo, series.id]);

      stats.seriesUpdated++;
    }

    console.log(`   ✅ Updated ${stats.seriesUpdated} series`);
  } catch (error) {
    console.error('   ❌ Error fixing series logos:', error);
    stats.errors++;
  }
}

/**
 * Fix card legal data
 */
async function fixCardLegal() {
  console.log('\n🔧 Fixing card legal data...');
  console.log('   This may take a few minutes for 21,000+ cards...');

  try {
    // Get all cards that need legal data
    const result = await pool.query(`
      SELECT
        c.id,
        c.regulation_mark,
        s.release_date
      FROM cards c
      LEFT JOIN sets s ON c.set_id = s.id
      WHERE c.legal = '{}' OR c.legal IS NULL
    `);

    console.log(`   Found ${result.rows.length} cards to update`);

    // Process in batches for better performance
    const batchSize = 1000;
    let processed = 0;

    for (let i = 0; i < result.rows.length; i += batchSize) {
      const batch = result.rows.slice(i, i + batchSize);

      // Use transaction for batch
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (const card of batch) {
          const legal = calculateLegality(card.regulation_mark, card.release_date);

          await client.query(`
            UPDATE cards
            SET legal = $1
            WHERE id = $2
          `, [JSON.stringify(legal), card.id]);

          processed++;
          stats.cardsUpdated++;
        }

        await client.query('COMMIT');

        // Progress update
        if (processed % 5000 === 0 || processed === result.rows.length) {
          console.log(`   Progress: ${processed}/${result.rows.length} cards (${((processed / result.rows.length) * 100).toFixed(1)}%)`);
        }
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`   ❌ Error in batch at ${i}:`, error);
        stats.errors++;
      } finally {
        client.release();
      }
    }

    console.log(`   ✅ Updated ${stats.cardsUpdated} cards with legal data`);
  } catch (error) {
    console.error('   ❌ Error fixing card legal data:', error);
    stats.errors++;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting data fix process...\n');

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');

    // Fix all missing data
    await fixSetLogosAndSymbols();
    await fixSetCardCountTotal();
    await fixSeriesLogos();
    await fixCardLegal();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 FIX SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Sets updated (logos/symbols): ${stats.setsUpdated}`);
    console.log(`Series updated (logos): ${stats.seriesUpdated}`);
    console.log(`Cards updated (legal data): ${stats.cardsUpdated}`);
    console.log(`Errors encountered: ${stats.errors}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    if (stats.errors === 0) {
      console.log('✅ All fixes completed successfully!');
      console.log('\n💡 Next steps:');
      console.log('   1. Run audit script to verify: bun scripts/audit-missing-data.ts');
      console.log('   2. Test API endpoints to verify data is returned correctly');
      console.log('   3. Clear API cache if needed: curl http://localhost:3000/v2/cache/clear');
    } else {
      console.log('⚠️  Some errors occurred. Please review the output above.');
    }

  } catch (error) {
    console.error('❌ Fix process failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
