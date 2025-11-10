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

// Stats tracking
let stats = {
  categoriesImported: 0,
  groupsImported: 0,
  productsImported: 0,
  raritiesCreated: 0,
  cardTypesCreated: 0,
  variantsCreated: 0,
  errors: 0,
  startTime: Date.now(),
};

// Caches for normalized lookups
const rarityCache = new Map<string, number>();
const cardTypeCache = new Map<string, number>();
const variantCache = new Map<string, number>();

// Log file
const LOG_FILE = path.join(__dirname, 'import-metadata-progress.log');

async function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  await fs.appendFile(LOG_FILE, logMessage);
}

// Load lookup caches
async function loadCaches() {
  await log('📦 Loading lookup caches...');

  // Load rarities
  const rarities = await pool.query('SELECT id, name FROM rarities');
  for (const row of rarities.rows) {
    rarityCache.set(row.name, row.id);
  }

  // Load card types
  const cardTypes = await pool.query('SELECT id, name FROM card_types');
  for (const row of cardTypes.rows) {
    cardTypeCache.set(row.name, row.id);
  }

  // Load variants
  const variants = await pool.query('SELECT id, name FROM variants');
  for (const row of variants.rows) {
    variantCache.set(row.name, row.id);
  }

  await log(`✅ Loaded ${rarityCache.size} rarities, ${cardTypeCache.size} card types, ${variantCache.size} variants`);
}

// Get or create rarity ID
async function getOrCreateRarityId(rarityName: string | null): Promise<number | null> {
  if (!rarityName) return null;

  if (rarityCache.has(rarityName)) {
    return rarityCache.get(rarityName)!;
  }

  // Create new rarity
  try {
    const result = await pool.query(
      'INSERT INTO rarities (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
      [rarityName]
    );
    const id = result.rows[0].id;
    rarityCache.set(rarityName, id);
    stats.raritiesCreated++;
    return id;
  } catch (error) {
    // Race condition - try to fetch
    const result = await pool.query('SELECT id FROM rarities WHERE name = $1', [rarityName]);
    const id = result.rows[0].id;
    rarityCache.set(rarityName, id);
    return id;
  }
}

// Get or create card type ID
async function getOrCreateCardTypeId(categoryId: number, typeName: string | null): Promise<number | null> {
  if (!typeName) return null;

  const cacheKey = `${categoryId}_${typeName}`;
  if (cardTypeCache.has(cacheKey)) {
    return cardTypeCache.get(cacheKey)!;
  }

  // Create new card type
  try {
    const result = await pool.query(
      'INSERT INTO card_types (category_id, name, display_name) VALUES ($1, $2, $3) ON CONFLICT (category_id, name) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id',
      [categoryId, typeName, typeName]
    );
    const id = result.rows[0].id;
    cardTypeCache.set(cacheKey, id);
    stats.cardTypesCreated++;
    return id;
  } catch (error) {
    // Race condition - try to fetch
    const result = await pool.query('SELECT id FROM card_types WHERE category_id = $1 AND name = $2', [categoryId, typeName]);
    const id = result.rows[0].id;
    cardTypeCache.set(cacheKey, id);
    return id;
  }
}

// Get or create variant ID
async function getOrCreateVariantId(variantName: string | null): Promise<number | null> {
  if (!variantName) return null;

  if (variantCache.has(variantName)) {
    return variantCache.get(variantName)!;
  }

  // Create new variant
  try {
    const result = await pool.query(
      'INSERT INTO variants (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
      [variantName]
    );
    const id = result.rows[0].id;
    variantCache.set(variantName, id);
    stats.variantsCreated++;
    return id;
  } catch (error) {
    // Race condition - try to fetch
    const result = await pool.query('SELECT id FROM variants WHERE name = $1', [variantName]);
    const id = result.rows[0].id;
    variantCache.set(variantName, id);
    return id;
  }
}

// Extract value from extended data array
function getExtendedValue(extendedData: any[], fieldName: string): string | null {
  if (!Array.isArray(extendedData)) return null;
  const field = extendedData.find((item: any) => item.name === fieldName);
  return field?.value || null;
}

async function importCategories() {
  await log('📦 Importing categories...');

  const categoriesPath = path.join(TCGCSV_PATH, 'catigories.json');
  const fileContent = await fs.readFile(categoriesPath, 'utf8');
  const data = JSON.parse(fileContent);

  if (!data.success || !Array.isArray(data.results)) {
    throw new Error('Invalid categories file format');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const category of data.results) {
      await client.query(`
        INSERT INTO categories (
          id, name, display_name, popularity, is_scannable, is_direct, modified_on
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          display_name = EXCLUDED.display_name,
          popularity = EXCLUDED.popularity,
          is_scannable = EXCLUDED.is_scannable,
          is_direct = EXCLUDED.is_direct,
          modified_on = EXCLUDED.modified_on
      `, [
        category.categoryId,
        category.name,
        category.displayName,
        category.popularity || 0,
        category.isScannable || false,
        category.isDirect || false,
        category.modifiedOn ? new Date(category.modifiedOn) : null
      ]);

      stats.categoriesImported++;
    }

    await client.query('COMMIT');
    await log(`✅ Imported ${stats.categoriesImported} categories`);

  } catch (error: any) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function importGroups() {
  await log('📦 Importing groups (sets)...');

  const groupsPath = path.join(TCGCSV_PATH, 'groups');
  const groupFiles = await fs.readdir(groupsPath);
  const jsonFiles = groupFiles.filter(f => f.endsWith('.json')).sort((a, b) => {
    const numA = parseInt(a.replace('.json', ''));
    const numB = parseInt(b.replace('.json', ''));
    return numA - numB;
  });

  await log(`Found ${jsonFiles.length} group files to import`);

  for (const file of jsonFiles) {
    const filePath = path.join(groupsPath, file);

    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(fileContent);

      if (!data.success || !Array.isArray(data.results)) {
        await log(`⚠️  Skipping invalid file: ${file}`);
        continue;
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        for (const group of data.results) {
          await client.query(`
            INSERT INTO groups (
              id, category_id, name, abbreviation,
              is_supplemental, published_on, modified_on
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE SET
              category_id = EXCLUDED.category_id,
              name = EXCLUDED.name,
              abbreviation = EXCLUDED.abbreviation,
              is_supplemental = EXCLUDED.is_supplemental,
              published_on = EXCLUDED.published_on,
              modified_on = EXCLUDED.modified_on
          `, [
            group.groupId,
            group.categoryId,
            group.name,
            group.abbreviation,
            group.isSupplemental || false,
            group.publishedOn ? new Date(group.publishedOn) : null,
            group.modifiedOn ? new Date(group.modifiedOn) : null
          ]);

          stats.groupsImported++;
        }

        await client.query('COMMIT');

      } catch (error: any) {
        await client.query('ROLLBACK');
        await log(`❌ Error importing groups from ${file}: ${error.message}`);
        stats.errors++;
      } finally {
        client.release();
      }

      // Log progress periodically
      if (stats.groupsImported % 1000 === 0) {
        await log(`Progress: ${stats.groupsImported} groups imported`);
      }

    } catch (error: any) {
      await log(`❌ Error reading file ${file}: ${error.message}`);
      stats.errors++;
    }
  }

  await log(`✅ Imported ${stats.groupsImported} groups`);
}

async function importProducts() {
  await log('📦 Importing products (this will take a while)...');

  const productPath = path.join(TCGCSV_PATH, 'product');
  const categoryDirs = (await fs.readdir(productPath)).sort((a, b) => parseInt(a) - parseInt(b));

  await log(`Found ${categoryDirs.length} category directories`);

  for (const categoryDir of categoryDirs) {
    const categoryPath = path.join(productPath, categoryDir);
    const categoryStat = await fs.stat(categoryPath);

    if (!categoryStat.isDirectory()) continue;

    const groupDirs = await fs.readdir(categoryPath);

    for (const groupDir of groupDirs) {
      const groupPath = path.join(categoryPath, groupDir);
      const productsFile = path.join(groupPath, 'products');

      try {
        await fs.access(productsFile);
      } catch {
        continue; // Skip if no products file
      }

      try {
        const fileContent = await fs.readFile(productsFile, 'utf8');

        // Skip XML error responses (Access Denied, etc.)
        if (fileContent.trim().startsWith('<?xml') || fileContent.trim().startsWith('<Error>')) {
          await log(`⚠️  Skipping XML error response: ${productsFile}`);
          continue;
        }

        let data;
        try {
          data = JSON.parse(fileContent);
        } catch (parseError: any) {
          await log(`⚠️  JSON parse error in ${productsFile}: ${parseError.message}`);
          stats.errors++;
          continue;
        }

        if (!data.success || !Array.isArray(data.results)) {
          await log(`⚠️  Invalid products file: ${productsFile}`);
          continue;
        }

        const client = await pool.connect();

        try {
          await client.query('BEGIN');

          for (const product of data.results) {
            // Extract normalized fields from extended data
            const cardNumber = getExtendedValue(product.extendedData, 'Number');
            const rarityName = getExtendedValue(product.extendedData, 'Rarity');
            const cardType = getExtendedValue(product.extendedData, 'Card Type');
            const hp = getExtendedValue(product.extendedData, 'HP');
            const stage = getExtendedValue(product.extendedData, 'Stage');
            const retreatCost = getExtendedValue(product.extendedData, 'RetreatCost');

            // Get or create normalized IDs
            const rarityId = await getOrCreateRarityId(rarityName);
            const cardTypeId = await getOrCreateCardTypeId(product.categoryId, cardType);

            // Build card text JSONB (only the actual text content)
            const cardText: any = {};
            const cardTextField = getExtendedValue(product.extendedData, 'CardText');
            if (cardTextField) cardText.text = cardTextField;

            const attack1 = getExtendedValue(product.extendedData, 'Attack 1');
            if (attack1) cardText.attack1 = attack1;

            const attack2 = getExtendedValue(product.extendedData, 'Attack 2');
            if (attack2) cardText.attack2 = attack2;

            const attack3 = getExtendedValue(product.extendedData, 'Attack 3');
            if (attack3) cardText.attack3 = attack3;

            const weakness = getExtendedValue(product.extendedData, 'Weakness');
            if (weakness) cardText.weakness = weakness;

            const resistance = getExtendedValue(product.extendedData, 'Resistance');
            if (resistance) cardText.resistance = resistance;

            await client.query(`
              INSERT INTO products (
                id, category_id, group_id, name, clean_name,
                card_number, rarity_id, card_type_id,
                hp, stage, retreat_cost,
                image_count, is_presale, released_on, url, modified_on,
                card_text, is_synthetic
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
              ON CONFLICT (id) DO UPDATE SET
                category_id = EXCLUDED.category_id,
                group_id = EXCLUDED.group_id,
                name = EXCLUDED.name,
                clean_name = EXCLUDED.clean_name,
                card_number = EXCLUDED.card_number,
                rarity_id = EXCLUDED.rarity_id,
                card_type_id = EXCLUDED.card_type_id,
                hp = EXCLUDED.hp,
                stage = EXCLUDED.stage,
                retreat_cost = EXCLUDED.retreat_cost,
                image_count = EXCLUDED.image_count,
                is_presale = EXCLUDED.is_presale,
                released_on = EXCLUDED.released_on,
                url = EXCLUDED.url,
                modified_on = EXCLUDED.modified_on,
                card_text = EXCLUDED.card_text
            `, [
              product.productId,
              product.categoryId,
              product.groupId,
              product.name,
              product.cleanName,
              cardNumber,
              rarityId,
              cardTypeId,
              hp ? parseInt(hp) : null,
              stage,
              retreatCost ? parseInt(retreatCost) : null,
              product.imageCount || 0,
              product.presaleInfo?.isPresale || false,
              product.presaleInfo?.releasedOn ? new Date(product.presaleInfo.releasedOn) : null,
              product.url,
              product.modifiedOn ? new Date(product.modifiedOn) : null,
              Object.keys(cardText).length > 0 ? JSON.stringify(cardText) : null,
              false  // is_synthetic - these are real TCGPlayer products
            ]);

            stats.productsImported++;
          }

          await client.query('COMMIT');

        } catch (error: any) {
          await client.query('ROLLBACK');
          await log(`❌ Error importing products from ${productsFile}: ${error.message}`);
          stats.errors++;
        } finally {
          client.release();
        }

        // Log progress periodically
        if (stats.productsImported % 5000 === 0) {
          await log(`Progress: ${stats.productsImported.toLocaleString()} products imported`);
        }

      } catch (error: any) {
        await log(`❌ Error processing products file ${productsFile}: ${error.message}`);
        stats.errors++;
      }
    }
  }

  await log(`✅ Imported ${stats.productsImported.toLocaleString()} products`);
}

async function main() {
  try {
    await log('🚀 Starting TCGPlayer metadata import (normalized schema)...');
    await log(`Source: ${TCGCSV_PATH}`);

    // Test database connection
    const testResult = await pool.query('SELECT NOW()');
    await log(`✅ Database connected: ${testResult.rows[0].now}`);

    // Load caches
    await loadCaches();

    // Import in order (categories → groups → products)
    await importCategories();
    await importGroups();
    await importProducts();

    // Final summary
    const elapsed = (Date.now() - stats.startTime) / 1000;

    await log(`
🎉 Import Complete!

   Categories imported: ${stats.categoriesImported}
   Groups imported: ${stats.groupsImported.toLocaleString()}
   Products imported: ${stats.productsImported.toLocaleString()}

   Normalized lookups created:
   - Rarities: ${stats.raritiesCreated}
   - Card Types: ${stats.cardTypesCreated}
   - Variants: ${stats.variantsCreated}

   Errors: ${stats.errors}
   Total time: ${Math.floor(elapsed)}s (${(elapsed / 60).toFixed(1)} minutes)
    `);

    // Show database stats
    const categoryCount = await pool.query('SELECT COUNT(*) FROM categories');
    const groupCount = await pool.query('SELECT COUNT(*) FROM groups');
    const productCount = await pool.query('SELECT COUNT(*) FROM products');
    const rarityCount = await pool.query('SELECT COUNT(*) FROM rarities');

    await log(`
📊 Database Verification:
   Categories in DB: ${categoryCount.rows[0].count}
   Groups in DB: ${groupCount.rows[0].count}
   Products in DB: ${productCount.rows[0].count}
   Rarities in DB: ${rarityCount.rows[0].count}
    `);

    // Test image URL function
    const imageTest = await pool.query("SELECT get_product_image_url(42346, '400w') as url");
    await log(`🖼️  Image URL test: ${imageTest.rows[0].url}`);

  } catch (error: any) {
    await log(`💥 Fatal error: ${error.message}`);
    await log(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  await log('\n⚠️  Received SIGINT, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await log('\n⚠️  Received SIGTERM, shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

// Run import
main();
