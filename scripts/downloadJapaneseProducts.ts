import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

// Known Japanese set groupIds from TCGCSV
const JAPANESE_SETS = [
  { groupId: 23609, name: 'SV3 Ruler of the Black Flame' },
  // Add more as needed
];

const TCGPLAYER_API = 'https://mpapi.tcgplayer.com/v2/product';

async function downloadJapaneseProducts() {
  const productsDir = 'var/models/tcgplayer/products';
  await mkdir(productsDir, { recursive: true });

  for (const set of JAPANESE_SETS) {
    console.log(`Downloading products for ${set.name} (groupId: ${set.groupId})...`);
    
    const url = `${TCGPLAYER_API}?categoryId=85&groupId=${set.groupId}&getExtendedFields=true&includeSkus=false`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success && data.results) {
        const filename = `japan-${set.groupId}.json`;
        const filepath = join(productsDir, filename);
        await writeFile(filepath, JSON.stringify(data.results, null, 2));
        console.log(`✓ Saved ${data.results.length} products to ${filename}`);
      }
    } catch (error) {
      console.error(`✗ Failed to download ${set.name}:`, error.message);
    }
  }
}

downloadJapaneseProducts();
