import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';

// Map Asian set IDs to TCGPlayer groupIds
const SET_MAPPING = {
  'SV3': 23609, // Ruler of the Black Flame
  // Add more mappings as we discover them
};

async function linkAsianCards() {
  console.log('Loading TCGPlayer product data...');
  
  // You provided this data - let's save it
  const sv3ProductsPath = 'var/models/tcgplayer/products/japan-23609.json';
  
  // Check if we have the product data
  let products = [];
  try {
    const content = await readFile(sv3ProductsPath, 'utf-8');
    products = JSON.parse(content);
    console.log(`Loaded ${products.length} products for SV3`);
  } catch {
    console.log('No product data found. Please save TCGPlayer product JSON to:');
    console.log(sv3ProductsPath);
    return;
  }
  
  // Build lookup map: card number -> productId
  const numberToProduct = new Map();
  for (const product of products) {
    const numberField = product.extendedData?.find(d => d.name === 'Number');
    if (numberField?.value) {
      // Extract number (e.g., "001/108" -> "001")
      const match = numberField.value.match(/^(\d+)/);
      if (match) {
        const num = match[1];
        numberToProduct.set(num, product.productId);
      }
    }
  }
  
  console.log(`Built lookup map with ${numberToProduct.size} entries`);
  
  // Find all SV3 cards
  const cardFiles = await glob('data-asia/SV/SV3/*.ts', { 
    ignore: ['**/index.ts']
  });
  
  console.log(`Found ${cardFiles.length} SV3 card files`);
  
  let linkedCount = 0;
  let skippedCount = 0;
  
  for (const file of cardFiles) {
    const filename = file.split('/').pop();
    const cardNum = filename?.replace('.ts', '');
    
    if (!cardNum || cardNum === 'index') continue;
    
    const productId = numberToProduct.get(cardNum);
    
    if (productId) {
      // Read the card file
      let content = await readFile(file, 'utf-8');
      
      // Check if it already has thirdParty
      if (!content.includes('thirdParty')) {
        // Add thirdParty field before the closing brace
        const insertText = `\n\tthirdParty: {\n\t\ttcgplayer: ${productId}\n\t},`;
        content = content.replace(/(\n}\n\nexport default card)/, `${insertText}$1`);
        
        await writeFile(file, content);
        linkedCount++;
        console.log(`✓ Linked ${cardNum} -> ${productId}`);
      } else {
        skippedCount++;
      }
    }
  }
  
  console.log(`\nDone!`);
  console.log(`Linked: ${linkedCount}`);
  console.log(`Skipped (already had IDs): ${skippedCount}`);
  console.log(`Not matched: ${cardFiles.length - linkedCount - skippedCount}`);
}

linkAsianCards().catch(console.error);
