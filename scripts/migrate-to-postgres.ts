#!/usr/bin/env bun
/**
 * Migration Script: TypeScript Card Files → PostgreSQL
 *
 * This script migrates all Pokemon card data from the TypeScript files
 * in data/ to the PostgreSQL database.
 *
 * Usage: bun scripts/migrate-to-postgres.ts
 */

import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'cards_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Statistics
const stats = {
  series: 0,
  sets: 0,
  cards: 0,
  variants: 0,
  sealedProducts: 0,
  errors: 0,
};

/**
 * Main migration function
 */
async function migrate() {
  console.log('🚀 Starting Pokemon data migration to PostgreSQL...\n');

  try {
    // Test database connection
    await testConnection();

    // Get all series directories
    const dataDir = path.join(process.cwd(), 'data');
    const seriesDirs = await getDirectories(dataDir);

    console.log(`📦 Found ${seriesDirs.length} series to migrate\n`);

    for (const seriesDir of seriesDirs) {
      await migrateSeries(seriesDir);
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Statistics:');
    console.log(`   Series: ${stats.series}`);
    console.log(`   Sets: ${stats.sets}`);
    console.log(`   Cards: ${stats.cards}`);
    console.log(`   Variants: ${stats.variants}`);
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
 * Migrate a series
 */
async function migrateSeries(seriesPath: string) {
  const seriesName = path.basename(seriesPath);
  console.log(`\n📚 Migrating series: ${seriesName}`);

  // Import series data (may not exist, fallback to directory name)
  const seriesDataPath = path.join(seriesPath, 'index.ts');
  let seriesData: any = {
    id: seriesName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    name: seriesName,
    logo: null,
    metadata: {}
  };

  try {
    const module = await import(seriesDataPath);
    const imported = module.default || module;
    if (imported) {
      seriesData = {
        id: imported.id || seriesData.id,
        name: imported.name || seriesName,
        logo: imported.logo || null,
        metadata: imported.metadata || {}
      };
    }
  } catch (error) {
    // No series index file, use fallback data
    console.log(`   ℹ️  No series index file, using directory name`);
  }

  // Insert series into database
  try {
    await pool.query(`
      INSERT INTO series (id, game_id, name, slug, logo, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (game_id, slug) DO UPDATE SET
        name = EXCLUDED.name,
        logo = EXCLUDED.logo,
        metadata = EXCLUDED.metadata
    `, [
      seriesData.id,
      'pokemon',
      JSON.stringify(seriesData.name),
      seriesData.id,
      seriesData.logo,
      JSON.stringify(seriesData.metadata),
    ]);
    stats.series++;
  } catch (error) {
    console.error(`   ❌ Error inserting series:`, error);
    stats.errors++;
    return;
  }

  // Get all set directories in this series
  const setDirs = await getDirectories(seriesPath);

  for (const setDir of setDirs) {
    await migrateSet(setDir, seriesData.id);
  }
}

/**
 * Migrate a set
 */
async function migrateSet(setPath: string, seriesId: string) {
  const setName = path.basename(setPath);
  console.log(`   📦 Migrating set: ${setName}`);

  // Import set data from series-level .ts file (not from set directory)
  const seriesPath = path.dirname(setPath);
  const setDataPath = path.join(seriesPath, `${setName}.ts`);
  let setData: any;

  try {
    const module = await import(setDataPath);
    setData = module.default || module;

    if (!setData || !setData.id) {
      console.error(`      ⚠️  Invalid set data in ${setDataPath}`);
      stats.errors++;
      return;
    }
  } catch (error) {
    console.error(`      ⚠️  Could not load set data from ${setDataPath}: ${error}`);
    stats.errors++;
    return;
  }

  // Insert set into database
  try {
    await pool.query(`
      INSERT INTO sets (id, game_id, series_id, name, slug, card_count, release_date, legal, logo, symbol, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (game_id, slug) DO UPDATE SET
        series_id = EXCLUDED.series_id,
        name = EXCLUDED.name,
        card_count = EXCLUDED.card_count,
        release_date = EXCLUDED.release_date,
        legal = EXCLUDED.legal,
        logo = EXCLUDED.logo,
        symbol = EXCLUDED.symbol,
        metadata = EXCLUDED.metadata
    `, [
      setData.id,
      'pokemon',
      seriesId,
      JSON.stringify(setData.name),
      setData.id,
      JSON.stringify(setData.cardCount || {}),
      setData.releaseDate || null,
      JSON.stringify(setData.legal || {}),
      setData.logo || null,
      setData.symbol || null,
      JSON.stringify({
        tcgOnline: setData.tcgOnline,
        ...(setData.thirdParty || {}),
      }),
    ]);
    stats.sets++;
  } catch (error) {
    console.error(`      ❌ Error inserting set:`, error);
    stats.errors++;
    return;
  }

  // Migrate cards
  const cardFiles = await getTypeScriptFiles(setPath);
  const cardFileCount = cardFiles.filter(f => !f.endsWith('index.ts')).length;
  console.log(`      🃏 Found ${cardFileCount} cards`);

  for (const cardFile of cardFiles) {
    if (cardFile.endsWith('index.ts')) continue;
    await migrateCard(cardFile, setData.id);
  }

  // Migrate sealed products
  const sealedDir = path.join(setPath, 'sealed');
  try {
    const sealedFiles = await getTypeScriptFiles(sealedDir);
    if (sealedFiles.length > 0) {
      console.log(`      📦 Found ${sealedFiles.length} sealed products`);
      for (const sealedFile of sealedFiles) {
        await migrateSealedProduct(sealedFile, setData.id);
      }
    }
  } catch (error) {
    // No sealed products directory, skip
  }
}

/**
 * Migrate a card
 */
async function migrateCard(cardPath: string, setId: string) {
  try {
    const module = await import(cardPath);
    const cardData = module.default || module;

    // Extract localId from filename (e.g., "005.ts" -> "005")
    const filename = path.basename(cardPath);
    const localId = filename.replace('.ts', '');

    // Construct card ID from set ID + local ID
    const cardId = `${setId}-${localId}`;

    // Build attributes JSONB
    const attributes: any = {};

    if (cardData.hp) attributes.hp = cardData.hp;
    if (cardData.types) attributes.types = cardData.types;
    if (cardData.evolveFrom) attributes.evolveFrom = cardData.evolveFrom;
    if (cardData.description) attributes.description = cardData.description;
    if (cardData.level) attributes.level = cardData.level;
    if (cardData.stage) attributes.stage = cardData.stage;
    if (cardData.suffix) attributes.suffix = cardData.suffix;
    if (cardData.item) attributes.item = cardData.item;
    if (cardData.abilities) attributes.abilities = cardData.abilities;
    if (cardData.attacks) attributes.attacks = cardData.attacks;
    if (cardData.weaknesses) attributes.weaknesses = cardData.weaknesses;
    if (cardData.resistances) attributes.resistances = cardData.resistances;
    if (cardData.retreat) attributes.retreat = cardData.retreat;
    if (cardData.effect) attributes.effect = cardData.effect;
    if (cardData.trainerType) attributes.trainerType = cardData.trainerType;
    if (cardData.energyType) attributes.energyType = cardData.energyType;
    if (cardData.dexId) attributes.dexId = cardData.dexId;

    // Handle TCGPlayer variants
    const tcgplayerData = cardData.thirdParty?.tcgplayer;
    let hasVariants = false;

    if (tcgplayerData && typeof tcgplayerData === 'object' && !Array.isArray(tcgplayerData)) {
      // Check if it's the new object format with variants
      if ('normal' in tcgplayerData || 'pokeball' in tcgplayerData || 'masterball' in tcgplayerData ||
          'holo' in tcgplayerData || 'reverse' in tcgplayerData) {
        hasVariants = true;
      }
    }

    // Insert main card
    await pool.query(`
      INSERT INTO cards (
        id, game_id, set_id, local_id, name, illustrator, rarity, category,
        attributes, image, image_small, image_high, legal, regulation_mark, third_party, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        illustrator = EXCLUDED.illustrator,
        rarity = EXCLUDED.rarity,
        category = EXCLUDED.category,
        attributes = EXCLUDED.attributes,
        image = EXCLUDED.image,
        image_small = EXCLUDED.image_small,
        image_high = EXCLUDED.image_high,
        legal = EXCLUDED.legal,
        regulation_mark = EXCLUDED.regulation_mark,
        third_party = EXCLUDED.third_party,
        metadata = EXCLUDED.metadata
    `, [
      cardId,
      'pokemon',
      setId,
      localId,
      JSON.stringify(cardData.name),
      cardData.illustrator || null,
      cardData.rarity || null,
      cardData.category || null,
      JSON.stringify(attributes),
      cardData.image || null,
      cardData.image ? cardData.image.replace('/high', '/low') : null,
      cardData.image || null,
      JSON.stringify(cardData.legal || {}),
      cardData.regulationMark || null,
      JSON.stringify(cardData.thirdParty || {}),
      JSON.stringify({}),
    ]);

    stats.cards++;

    // Insert variants if present
    if (hasVariants && tcgplayerData) {
      const variantTypes = ['normal', 'holo', 'reverse', 'pokeball', 'masterball', 'reverseHolofoil',
                            '1stEditionHolofoil', '1stEditionNormal'];

      for (const variantType of variantTypes) {
        if (tcgplayerData[variantType]) {
          try {
            await pool.query(`
              INSERT INTO card_variants (card_id, variant_type, third_party)
              VALUES ($1, $2, $3)
              ON CONFLICT (card_id, variant_type) DO UPDATE SET
                third_party = EXCLUDED.third_party
            `, [
              cardId,
              variantType.toLowerCase().replace(/([A-Z])/g, '-$1').toLowerCase(),
              JSON.stringify({
                tcgplayer: {
                  productId: tcgplayerData[variantType]
                }
              }),
            ]);
            stats.variants++;
          } catch (error) {
            console.error(`         ⚠️  Error inserting variant ${variantType} for ${cardId}:`, error);
            stats.errors++;
          }
        }
      }
    }
  } catch (error) {
    console.error(`      ⚠️  Error migrating card ${path.basename(cardPath)}:`, error);
    stats.errors++;
  }
}

/**
 * Migrate a sealed product
 */
async function migrateSealedProduct(productPath: string, setId: string) {
  try {
    const module = await import(productPath);
    const productData = module.default || module;

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
        metadata = EXCLUDED.metadata
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
  } catch (error) {
    console.error(`      ⚠️  Error migrating sealed product ${path.basename(productPath)}:`, error);
    stats.errors++;
  }
}

// Run migration
migrate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
