import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';

/**
 * Complete workflow to link Asian cards to TCGPlayer product IDs
 *
 * Steps:
 * 1. Load TCGPlayer product data from var/models/tcgplayer/products/japan-{groupId}.json
 * 2. Build card number -> product ID mapping
 * 3. Find matching Asian card files
 * 4. Add thirdParty.tcgplayer field to card files
 */

interface TCGPlayerProduct {
  productId: number;
  name: string;
  cleanName: string;
  groupId: number;
  categoryId: number;
  extendedData?: Array<{
    name: string;
    displayName: string;
    value: string;
  }>;
}

interface ProductData {
  groupId: number;
  setName: string;
  setId: string;
  totalCards: number;
  products: TCGPlayerProduct[];
}

// Map Asian set IDs to TCGPlayer groupIds
const SET_MAPPING: Record<string, { groupId: number; path: string }> = {
  'SV3': { groupId: 23609, path: 'data-asia/SV/SV3' },
  // Add more mappings as needed:
  // 'SV1S': { groupId: XXXXX, path: 'data-asia/SV/SV1S' },
  // 'SV1V': { groupId: XXXXX, path: 'data-asia/SV/SV1V' },
};

async function loadProductData(groupId: number): Promise<TCGPlayerProduct[]> {
  const productPath = `var/models/tcgplayer/products/japan-${groupId}.json`;

  try {
    const content = await readFile(productPath, 'utf-8');
    const data: ProductData = JSON.parse(content);
    return data.products || [];
  } catch (error) {
    console.error(`❌ Failed to load product data from ${productPath}`);
    console.error(`   Error: ${error.message}`);
    console.error(`\n   Please create the file with this format:`);
    console.error(`   {`);
    console.error(`     "groupId": ${groupId},`);
    console.error(`     "setName": "Set Name",`);
    console.error(`     "setId": "SV3",`);
    console.error(`     "totalCards": 143,`);
    console.error(`     "products": [ {...product data...} ]`);
    console.error(`   }\n`);
    return [];
  }
}

function extractCardNumber(product: TCGPlayerProduct): string | null {
  const numberField = product.extendedData?.find(d => d.name === 'Number');
  if (!numberField?.value) return null;

  // Extract base number from formats like:
  // "001/108" -> "001"
  // "002/108" -> "002"
  // "109/108" -> "109" (secret rare)
  const match = numberField.value.match(/^(\d+)/);
  return match ? match[1] : null;
}

function normalizeCardNumber(num: string): string {
  // Ensure 3-digit format: "1" -> "001", "12" -> "012", "001" -> "001"
  return num.padStart(3, '0');
}

async function linkCardsForSet(setId: string): Promise<void> {
  const setConfig = SET_MAPPING[setId];
  if (!setConfig) {
    console.error(`❌ Unknown set ID: ${setId}`);
    console.error(`   Available sets: ${Object.keys(SET_MAPPING).join(', ')}`);
    return;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing ${setId} (TCGPlayer groupId: ${setConfig.groupId})`);
  console.log('='.repeat(60));

  // Load product data
  console.log('\n📦 Loading TCGPlayer product data...');
  const products = await loadProductData(setConfig.groupId);

  if (products.length === 0) {
    console.log(`⚠️  No products loaded. Skipping ${setId}.`);
    return;
  }

  console.log(`✓ Loaded ${products.length} products`);

  // Build lookup map
  console.log('\n🗺️  Building card number -> product ID mapping...');
  const numberToProduct = new Map<string, number>();
  const skippedProducts: string[] = [];

  for (const product of products) {
    const cardNum = extractCardNumber(product);
    if (cardNum) {
      const normalized = normalizeCardNumber(cardNum);
      numberToProduct.set(normalized, product.productId);
    } else {
      // Probably a booster box/pack or special product
      skippedProducts.push(product.name);
    }
  }

  console.log(`✓ Mapped ${numberToProduct.size} card numbers`);
  if (skippedProducts.length > 0) {
    console.log(`  (Skipped ${skippedProducts.length} non-card products: ${skippedProducts.slice(0, 3).join(', ')}${skippedProducts.length > 3 ? '...' : ''})`);
  }

  // Find card files
  console.log(`\n📁 Finding card files in ${setConfig.path}...`);
  const cardFiles = await glob(`${setConfig.path}/*.ts`, {
    ignore: ['**/index.ts']
  });

  console.log(`✓ Found ${cardFiles.length} card files`);

  // Link cards
  console.log('\n🔗 Linking cards to TCGPlayer product IDs...');
  let linkedCount = 0;
  let alreadyLinkedCount = 0;
  let notFoundCount = 0;
  const notFoundCards: string[] = [];

  for (const file of cardFiles) {
    const filename = file.split('/').pop();
    const cardNum = filename?.replace('.ts', '');

    if (!cardNum || cardNum === 'index') continue;

    const productId = numberToProduct.get(cardNum);

    if (!productId) {
      notFoundCount++;
      notFoundCards.push(cardNum);
      continue;
    }

    // Read card file
    let content = await readFile(file, 'utf-8');

    // Check if already linked
    if (content.includes('thirdParty')) {
      alreadyLinkedCount++;
      continue;
    }

    // Add thirdParty field
    // Insert before the closing brace and export statement
    const thirdPartyBlock = `\n\tthirdParty: {\n\t\ttcgplayer: ${productId}\n\t},`;
    content = content.replace(
      /(\n}\n\nexport default card)/,
      `${thirdPartyBlock}$1`
    );

    await writeFile(file, content);
    linkedCount++;

    if (linkedCount <= 5) {
      console.log(`  ✓ ${cardNum}.ts -> productId ${productId}`);
    } else if (linkedCount === 6) {
      console.log(`  ... (showing first 5)`);
    }
  }

  // Summary
  console.log(`\n${'─'.repeat(60)}`);
  console.log('Summary:');
  console.log(`  ✓ Newly linked:        ${linkedCount}`);
  console.log(`  ⊙ Already had IDs:     ${alreadyLinkedCount}`);
  console.log(`  ⚠ Not found in data:   ${notFoundCount}`);
  console.log(`  Total processed:       ${cardFiles.length}`);

  if (notFoundCards.length > 0) {
    console.log(`\n⚠️  Cards not found in TCGPlayer data:`);
    notFoundCards.slice(0, 10).forEach(num => console.log(`     ${num}`));
    if (notFoundCards.length > 10) {
      console.log(`     ... and ${notFoundCards.length - 10} more`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  console.log('🎴 Asian Cards → TCGPlayer Linking Workflow');
  console.log('='.repeat(60));

  if (args.length === 0) {
    console.log('\nUsage: bun run scripts/linkAsianCardsWorkflow.ts <setId> [setId2] [setId3]...');
    console.log('\nAvailable sets:');
    for (const [setId, config] of Object.entries(SET_MAPPING)) {
      console.log(`  ${setId.padEnd(10)} - groupId ${config.groupId} - ${config.path}`);
    }
    console.log('\nExamples:');
    console.log('  bun run scripts/linkAsianCardsWorkflow.ts SV3');
    console.log('  bun run scripts/linkAsianCardsWorkflow.ts SV3 SV1S SV1V');
    console.log('\n📝 Before running, ensure you have created:');
    console.log('   var/models/tcgplayer/products/japan-{groupId}.json');
    console.log('\n   See ASIAN_CARDS_SOLUTION.md for format details.');
    process.exit(0);
  }

  // Process each set
  for (const setId of args) {
    await linkCardsForSet(setId);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Done!');
  console.log('='.repeat(60));
  console.log('\nNext steps:');
  console.log('  1. Rebuild data:     bun run build');
  console.log('  2. Generate history: bun run scripts/processTCGCSV.ts');
  console.log('  3. Rebuild Docker:   docker-compose build');
  console.log('  4. Restart server:   docker-compose up -d');
  console.log('  5. Test API:         http://135.148.148.65:3000/api/v2/cards/SV3-001/history?range=daily\n');
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
