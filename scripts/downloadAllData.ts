#!/usr/bin/env bun

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

interface SetInfo {
  serie: string;
  setName: string;
  setId: string;
  tcgplayerId: number;
  cardmarketId?: number;
}

// Extract TCGPlayer ID from set TypeScript file
async function extractSetInfo(setFilePath: string, serie: string): Promise<SetInfo | null> {
  try {
    const content = await readFile(setFilePath, 'utf-8');

    // Extract set id
    const idMatch = content.match(/id:\s*["']([^"']+)["']/);
    if (!idMatch) return null;
    const setId = idMatch[1];

    // Extract set name
    const nameMatch = content.match(/name:\s*\{[^}]*en:\s*["']([^"']+)["']/);
    const setName = nameMatch ? nameMatch[1] : setFilePath.split('/').pop()?.replace('.ts', '') || 'Unknown';

    // Extract TCGPlayer ID
    const tcgMatch = content.match(/tcgplayer:\s*(\d+)/);
    if (!tcgMatch) return null;
    const tcgplayerId = parseInt(tcgMatch[1], 10);

    // Extract Cardmarket ID (optional)
    const cmMatch = content.match(/cardmarket:\s*(\d+)/);
    const cardmarketId = cmMatch ? parseInt(cmMatch[1], 10) : undefined;

    return {
      serie,
      setName,
      setId,
      tcgplayerId,
      cardmarketId
    };
  } catch (error) {
    console.error(`Error reading ${setFilePath}:`, error);
    return null;
  }
}

// Get all sets with TCGPlayer IDs
async function getAllSets(): Promise<SetInfo[]> {
  const dataDir = join(process.cwd(), 'data');
  const serieItems = await readdir(dataDir);

  const allSets: SetInfo[] = [];

  for (const serieItem of serieItems) {
    if (!serieItem.endsWith('.ts')) continue;

    const serieName = serieItem.replace('.ts', '');
    const serieDir = join(dataDir, serieName);

    if (!existsSync(serieDir)) continue;

    try {
      const items = await readdir(serieDir);

      for (const item of items) {
        if (!item.endsWith('.ts')) continue;

        const setFile = join(serieDir, item);
        const setInfo = await extractSetInfo(setFile, serieName);

        if (setInfo) {
          allSets.push(setInfo);
          console.log(`Found: ${serieName} / ${setInfo.setName} (TCGPlayer: ${setInfo.tcgplayerId})`);
        }
      }
    } catch (error) {
      console.error(`Error processing serie ${serieName}:`, error);
    }
  }

  return allSets;
}

// Download product catalog for a set
async function downloadProductCatalog(set: SetInfo): Promise<boolean> {
  const outputDir = join(process.cwd(), 'var', 'models', 'tcgplayer', 'products');
  await mkdir(outputDir, { recursive: true });

  const outputFile = join(outputDir, `${set.tcgplayerId}.json`);

  if (existsSync(outputFile)) {
    console.log(`  ✓ Product catalog exists for ${set.setName} (${set.tcgplayerId})`);
    return true;
  }

  // Try different group IDs for TCGCSV
  const groups = [3, 85, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  for (const group of groups) {
    try {
      const url = `https://tcgcsv.com/${group}/${set.tcgplayerId}/products`;
      const response = await fetch(url);

      if (response.ok) {
        const products = await response.json();

        if (Array.isArray(products) && products.length > 0) {
          await writeFile(outputFile, JSON.stringify(products, null, 2));
          console.log(`  ✓ Downloaded ${products.length} products for ${set.setName} (group ${group})`);
          return true;
        }
      }
    } catch (err) {
      // Continue to next group
    }
  }

  console.log(`  ✗ No products found for ${set.setName} (${set.tcgplayerId})`);
  return false;
}

// Download and extract a single day's price archive
async function downloadDay(dateStr: string, outputDir: string): Promise<boolean> {
  const archiveFile = join(outputDir, `${dateStr}.7z`);
  const extractDir = join(outputDir, dateStr);

  // Check if already extracted
  if (existsSync(extractDir)) {
    console.log(`  ⊙ ${dateStr} already extracted`);
    return true;
  }

  // Check if archive exists
  if (!existsSync(archiveFile)) {
    try {
      const url = `https://tcgcsv.com/download/ppmd/${dateStr}/ppmd.7z`;
      const response = await fetch(url);

      if (!response.ok) {
        console.log(`  ✗ ${dateStr} not available (HTTP ${response.status})`);
        return false;
      }

      const buffer = await response.arrayBuffer();
      await writeFile(archiveFile, Buffer.from(buffer));
      const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(2);
      console.log(`  ↓ Downloaded ${dateStr} (${sizeMB} MB)`);
    } catch (error) {
      console.log(`  ✗ Failed to download ${dateStr}`);
      return false;
    }
  }

  // Extract archive
  try {
    execSync(`7z x "${archiveFile}" -o"${extractDir}" -y > /dev/null 2>&1`);
    console.log(`  ✓ Extracted ${dateStr}`);
    return true;
  } catch (error) {
    console.log(`  ✗ Failed to extract ${dateStr}`);
    return false;
  }
}

// Download historical price archives
async function downloadHistoricalPrices(startDate: Date, endDate: Date) {
  const outputDir = join(process.cwd(), 'var', 'tcgcsv', 'history');
  await mkdir(outputDir, { recursive: true });

  console.log(`\nDownloading historical data from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}...\n`);

  const currentDate = new Date(startDate);
  let success = 0;
  let skip = 0;
  let fail = 0;

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];

    const result = await downloadDay(dateStr, outputDir);
    if (result) {
      if (existsSync(join(outputDir, dateStr))) {
        if (existsSync(join(outputDir, `${dateStr}.7z`))) {
          // Was just extracted
          success++;
        } else {
          // Was already there
          skip++;
        }
      }
    } else {
      fail++;
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);

    // Small delay every 5 requests
    if ((success + fail) % 5 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`\n=== Historical Data Summary ===`);
  console.log(`Downloaded: ${success}`);
  console.log(`Already had: ${skip}`);
  console.log(`Failed: ${fail}`);
  console.log(`Total days: ${success + skip + fail}`);
}

// Main execution
async function main() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║   TCGPlayer Complete Data Download & Setup Script     ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Step 1: Find all sets
  console.log('📋 Step 1: Finding all sets with TCGPlayer IDs...\n');
  const sets = await getAllSets();
  console.log(`\n✓ Found ${sets.length} sets with TCGPlayer IDs\n`);

  if (sets.length === 0) {
    console.error('ERROR: No sets found! Check the data directory structure.');
    process.exit(1);
  }

  // Step 2: Download product catalogs
  console.log('📦 Step 2: Downloading product catalogs...\n');
  let productSuccess = 0;
  let productFail = 0;

  for (const set of sets) {
    const success = await downloadProductCatalog(set);
    if (success) productSuccess++;
    else productFail++;

    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log(`\n=== Product Catalog Summary ===`);
  console.log(`Success: ${productSuccess}/${sets.length}`);
  console.log(`Failed: ${productFail}/${sets.length}`);

  // Step 3: Download historical price data
  console.log('\n💰 Step 3: Downloading historical price archives...');

  const endDate = new Date();
  const startDate = new Date();

  // Download last 90 days (adjust as needed)
  // For complete history, set to go back 1-2 years
  startDate.setDate(startDate.getDate() - 90);

  // Uncomment for 1 year of data:
  // startDate.setFullYear(startDate.getFullYear() - 1);

  await downloadHistoricalPrices(startDate, endDate);

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║                  Download Complete!                    ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('📝 Next Steps:\n');
  console.log('1. Link cards to TCGPlayer products:');
  console.log('   bunx jscodeshift -t scripts/linkCardToTCGPlayer.ts "data/**/*.ts" \\');
  console.log('     --ignore-pattern="**/index.ts" --ignore-pattern="**/*.ts" \\');
  console.log('     --extensions=ts --parser=ts\n');

  console.log('2. Process historical data and create history files:');
  console.log('   bun processTCGCSV.ts\n');

  console.log('3. Rebuild Docker image with history data:');
  console.log('   docker build -t local-tcgdex .\n');

  console.log('4. Restart server:');
  console.log('   docker-compose down && docker-compose up -d\n');

  console.log('5. Test the API:');
  console.log('   curl http://localhost:3000/v2/en/cards/base1-1/history\n');
}

main().catch(console.error);
