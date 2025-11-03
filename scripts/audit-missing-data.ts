#!/usr/bin/env bun
/**
 * Data Audit Script: Identify Missing/Incorrect Data in PostgreSQL Migration
 *
 * This script audits the PostgreSQL database to identify:
 * 1. Missing image URLs (should be constructed from CDN pattern)
 * 2. Missing set logos and symbols (should be constructed)
 * 3. Missing card_count.total (should be calculated from actual card count)
 * 4. Missing legal.standard and legal.expanded (should be calculated)
 * 5. Missing variants data
 * 6. Any other data inconsistencies
 *
 * Usage: bun scripts/audit-missing-data.ts
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

interface AuditResults {
  cards: {
    total: number;
    missingImages: number;
    missingLegal: number;
    missingVariants: number;
    missingAttributes: number;
  };
  sets: {
    total: number;
    missingLogos: number;
    missingSymbols: number;
    missingCardCountTotal: number;
    incorrectCardCountTotal: number;
  };
  series: {
    total: number;
    missingLogos: number;
  };
}

async function auditDatabase(): Promise<AuditResults> {
  console.log('🔍 Starting data audit...\n');

  const results: AuditResults = {
    cards: {
      total: 0,
      missingImages: 0,
      missingLegal: 0,
      missingVariants: 0,
      missingAttributes: 0,
    },
    sets: {
      total: 0,
      missingLogos: 0,
      missingSymbols: 0,
      missingCardCountTotal: 0,
      incorrectCardCountTotal: 0,
    },
    series: {
      total: 0,
      missingLogos: 0,
    },
  };

  // Audit Cards
  console.log('📊 Auditing cards...');
  const cardsResult = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE image IS NULL) as missing_images,
      COUNT(*) FILTER (WHERE legal = '{}' OR legal IS NULL) as missing_legal,
      COUNT(*) FILTER (WHERE NOT (attributes ? 'hp' OR attributes ? 'types' OR attributes ? 'attacks')) as missing_attributes
    FROM cards
  `);

  results.cards.total = parseInt(cardsResult.rows[0].total);
  results.cards.missingImages = parseInt(cardsResult.rows[0].missing_images);
  results.cards.missingLegal = parseInt(cardsResult.rows[0].missing_legal);
  results.cards.missingAttributes = parseInt(cardsResult.rows[0].missing_attributes);

  console.log(`   Total cards: ${results.cards.total}`);
  console.log(`   Missing images: ${results.cards.missingImages}`);
  console.log(`   Missing legal data: ${results.cards.missingLegal}`);
  console.log(`   Missing key attributes: ${results.cards.missingAttributes}`);

  // Audit Sets
  console.log('\n📊 Auditing sets...');
  const setsResult = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE logo IS NULL OR logo = '') as missing_logos,
      COUNT(*) FILTER (WHERE symbol IS NULL OR symbol = '') as missing_symbols,
      COUNT(*) FILTER (WHERE NOT (card_count ? 'total')) as missing_card_count_total
    FROM sets
  `);

  results.sets.total = parseInt(setsResult.rows[0].total);
  results.sets.missingLogos = parseInt(setsResult.rows[0].missing_logos);
  results.sets.missingSymbols = parseInt(setsResult.rows[0].missing_symbols);
  results.sets.missingCardCountTotal = parseInt(setsResult.rows[0].missing_card_count_total);

  // Check for incorrect card_count.total
  const cardCountCheck = await pool.query(`
    SELECT
      s.id,
      s.name,
      s.card_count,
      COUNT(c.id) as actual_count
    FROM sets s
    LEFT JOIN cards c ON c.set_id = s.id
    GROUP BY s.id, s.name, s.card_count
    HAVING
      (s.card_count->>'total')::int != COUNT(c.id)
      OR s.card_count->>'total' IS NULL
  `);

  results.sets.incorrectCardCountTotal = cardCountCheck.rows.length;

  console.log(`   Total sets: ${results.sets.total}`);
  console.log(`   Missing logos: ${results.sets.missingLogos}`);
  console.log(`   Missing symbols: ${results.sets.missingSymbols}`);
  console.log(`   Missing card_count.total: ${results.sets.missingCardCountTotal}`);
  console.log(`   Incorrect card_count.total: ${results.sets.incorrectCardCountTotal}`);

  if (results.sets.incorrectCardCountTotal > 0) {
    console.log('\n   Sets with incorrect card counts (showing first 10):');
    cardCountCheck.rows.slice(0, 10).forEach(row => {
      const storedTotal = row.card_count?.total || 'null';
      console.log(`     - ${row.id}: stored=${storedTotal}, actual=${row.actual_count}`);
    });
  }

  // Audit Series
  console.log('\n📊 Auditing series...');
  const seriesResult = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE logo IS NULL OR logo = '') as missing_logos
    FROM series
  `);

  results.series.total = parseInt(seriesResult.rows[0].total);
  results.series.missingLogos = parseInt(seriesResult.rows[0].missing_logos);

  console.log(`   Total series: ${results.series.total}`);
  console.log(`   Missing logos: ${results.series.missingLogos}`);

  // Check for sample cards to verify data structure
  console.log('\n📝 Sample card data check...');
  const sampleCards = await pool.query(`
    SELECT id, name, attributes, legal, image
    FROM cards
    LIMIT 3
  `);

  sampleCards.rows.forEach(card => {
    console.log(`\n   Card: ${card.id}`);
    console.log(`     - Has image: ${card.image ? 'YES' : 'NO'}`);
    console.log(`     - Has HP: ${card.attributes?.hp ? 'YES' : 'NO'}`);
    console.log(`     - Has types: ${card.attributes?.types ? 'YES' : 'NO'}`);
    console.log(`     - Has legal: ${card.legal && Object.keys(card.legal).length > 0 ? 'YES' : 'NO'}`);
    console.log(`     - Attributes keys: ${card.attributes ? Object.keys(card.attributes).join(', ') : 'none'}`);
  });

  return results;
}

async function generateReport(results: AuditResults) {
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('📋 AUDIT SUMMARY REPORT');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Cards Summary
  console.log('🃏 CARDS');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`Total Cards: ${results.cards.total}`);
  console.log(`Missing Images: ${results.cards.missingImages} (${((results.cards.missingImages / results.cards.total) * 100).toFixed(1)}%)`);
  console.log(`Missing Legal Data: ${results.cards.missingLegal} (${((results.cards.missingLegal / results.cards.total) * 100).toFixed(1)}%)`);
  console.log(`Missing Key Attributes: ${results.cards.missingAttributes} (${((results.cards.missingAttributes / results.cards.total) * 100).toFixed(1)}%)`);

  // Sets Summary
  console.log('\n📦 SETS');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`Total Sets: ${results.sets.total}`);
  console.log(`Missing Logos: ${results.sets.missingLogos} (${((results.sets.missingLogos / results.sets.total) * 100).toFixed(1)}%)`);
  console.log(`Missing Symbols: ${results.sets.missingSymbols} (${((results.sets.missingSymbols / results.sets.total) * 100).toFixed(1)}%)`);
  console.log(`Missing card_count.total: ${results.sets.missingCardCountTotal} (${((results.sets.missingCardCountTotal / results.sets.total) * 100).toFixed(1)}%)`);
  console.log(`Incorrect card_count.total: ${results.sets.incorrectCardCountTotal} (${((results.sets.incorrectCardCountTotal / results.sets.total) * 100).toFixed(1)}%)`);

  // Series Summary
  console.log('\n📚 SERIES');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`Total Series: ${results.series.total}`);
  console.log(`Missing Logos: ${results.series.missingLogos} (${((results.series.missingLogos / results.series.total) * 100).toFixed(1)}%)`);

  // Priority Issues
  console.log('\n⚠️  PRIORITY ISSUES TO FIX');
  console.log('─────────────────────────────────────────────────────────');

  const issues: string[] = [];

  if (results.cards.missingImages > 0) {
    issues.push(`1. ${results.cards.missingImages} cards missing images - FIXED IN API (constructed from CDN pattern)`);
  }

  if (results.sets.missingLogos > 0) {
    issues.push(`2. ${results.sets.missingLogos} sets missing logos - NEED TO CONSTRUCT URLs`);
  }

  if (results.sets.missingSymbols > 0) {
    issues.push(`3. ${results.sets.missingSymbols} sets missing symbols - NEED TO CONSTRUCT URLs`);
  }

  if (results.sets.missingCardCountTotal > 0 || results.sets.incorrectCardCountTotal > 0) {
    const total = results.sets.missingCardCountTotal + results.sets.incorrectCardCountTotal;
    issues.push(`4. ${total} sets with missing/incorrect card_count.total - NEED TO CALCULATE`);
  }

  if (results.cards.missingLegal > 0) {
    issues.push(`5. ${results.cards.missingLegal} cards missing legal data - NEED TO CALCULATE`);
  }

  if (issues.length === 0) {
    console.log('✅ No critical issues found!');
  } else {
    issues.forEach(issue => console.log(issue));
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');
}

async function main() {
  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful\n');

    const results = await auditDatabase();
    await generateReport(results);

    console.log('💡 NEXT STEPS:');
    console.log('   1. Images are now constructed in the API (already fixed)');
    console.log('   2. Run fix script to populate set logos/symbols');
    console.log('   3. Run fix script to calculate card_count.total');
    console.log('   4. Run fix script to calculate legal.standard/expanded');
    console.log('   5. Re-audit to verify all fixes\n');

  } catch (error) {
    console.error('❌ Audit failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
