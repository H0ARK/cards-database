import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

async function extractJapaneseProducts() {
  const productsDir = 'var/models/tcgplayer/products';
  await mkdir(productsDir, { recursive: true });
  
  // Check if we have the archive data
  const archiveBase = 'tcgcsv/2024-02-08/1/85';
  
  try {
    const groupFiles = await readdir(archiveBase);
    console.log(`Found ${groupFiles.length} group directories in category 85`);
    
    for (const groupDir of groupFiles) {
      const groupPath = join(archiveBase, groupDir);
      const productFiles = await readdir(groupPath);
      
      const products = [];
      for (const file of productFiles) {
        if (file.endsWith('.json')) {
          const content = await readFile(join(groupPath, file), 'utf-8');
          products.push(JSON.parse(content));
        }
      }
      
      if (products.length > 0) {
        const outputFile = join(productsDir, `japan-${groupDir}.json`);
        await writeFile(outputFile, JSON.stringify(products, null, 2));
        console.log(`✓ Saved ${products.length} products for groupId ${groupDir}`);
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

extractJapaneseProducts();
