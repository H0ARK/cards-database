#!/usr/bin/env bun

import { readdir, rename } from 'fs/promises';
import { join } from 'path';
import { glob } from 'glob';
import { extractFile } from './utils/ts-extract-utils';

interface SetMapping {
  setName: string;
  setId: string;
}

async function getAllSetMappings(): Promise<Map<string, string>> {
  const mappings = new Map<string, string>();

  // Find all set files
  const dataDir = 'data';
  const serieItems = await readdir(dataDir, { withFileTypes: true });

  for (const serieItem of serieItems) {
    if (!serieItem.isDirectory()) continue;

    const serieName = serieItem.name;
    const serieDir = join(dataDir, serieName);

    try {
      const items = await readdir(serieDir, { withFileTypes: true });

      for (const item of items) {
        if (!item.name.endsWith('.ts')) continue;

        const setFile = join(serieDir, item.name);

        try {
          const setData = extractFile(setFile);

          if (setData && setData.id && setData.name && setData.name.en) {
            const setId = setData.id;
            const setName = setData.name.en;

            mappings.set(setName, setId);

            // Also map variations with spaces normalized
            mappings.set(setName.replace(/\s+/g, ' ').trim(), setId);
          }
        } catch (err) {
          // Skip files that can't be parsed
          continue;
        }
      }
    } catch (error) {
      console.error(`Error processing serie ${serieName}:`, error);
    }
  }

  return mappings;
}

async function renameHistoryFiles() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║       Fixing History File Names (Name → ID)           ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Get set name to ID mappings
  console.log('📋 Loading set mappings...');
  const setMappings = await getAllSetMappings();
  console.log(`✓ Found ${setMappings.size} set mappings\n`);

  // Process history files
  const historyDir = 'var/models/tcgplayer/history/daily';

  console.log('📂 Scanning history files...');
  const files = await readdir(historyDir);
  console.log(`✓ Found ${files.length} history files\n`);

  let renamedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  console.log('🔄 Renaming files...\n');

  for (const filename of files) {
    if (!filename.endsWith('.json')) continue;

    // Parse filename: "Set Name-123.json" -> setName = "Set Name", cardNum = "123"
    const match = filename.match(/^(.+?)-(\d+)\.json$/);

    if (!match) {
      console.log(`  ⚠️  Skipping invalid format: ${filename}`);
      skippedCount++;
      continue;
    }

    const [, setName, cardNum] = match;

    // Look up set ID
    const setId = setMappings.get(setName);

    if (!setId) {
      console.log(`  ⚠️  No mapping found for: "${setName}" (${filename})`);
      skippedCount++;
      continue;
    }

    // New filename format: "setid-cardnum.json"
    const newFilename = `${setId}-${cardNum}.json`;

    if (filename === newFilename) {
      // Already correct
      skippedCount++;
      continue;
    }

    const oldPath = join(historyDir, filename);
    const newPath = join(historyDir, newFilename);

    try {
      await rename(oldPath, newPath);
      renamedCount++;

      if (renamedCount % 100 === 0) {
        console.log(`  ✓ Renamed ${renamedCount} files...`);
      }
    } catch (error) {
      console.error(`  ✗ Error renaming ${filename}: ${error.message}`);
      errorCount++;
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║                 Rename Complete!                       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('📊 Summary:');
  console.log(`✓ Renamed: ${renamedCount}`);
  console.log(`⊙ Skipped: ${skippedCount}`);
  console.log(`✗ Errors:  ${errorCount}`);
  console.log(`━ Total:   ${files.length}\n`);

  if (renamedCount > 0) {
    console.log('📝 Next Steps:\n');
    console.log('1. Rebuild Docker image:');
    console.log('   docker build -t local-tcgdex .\n');
    console.log('2. Restart server:');
    console.log('   docker-compose down && docker-compose up -d\n');
    console.log('3. Test the history API:');
    console.log('   curl http://localhost:3000/v2/en/cards/base1-1/history\n');
  }
}

renameHistoryFiles().catch(console.error);
