#!/usr/bin/env bun

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

// Download and extract a single day's price archive
async function downloadDay(dateStr: string, outputDir: string): Promise<'success' | 'skip' | 'fail'> {
  const archiveFile = join(outputDir, `${dateStr}.7z`);
  const extractDir = join(outputDir, dateStr);

  // Check if already extracted
  if (existsSync(extractDir)) {
    return 'skip';
  }

  // Check if archive exists
  if (!existsSync(archiveFile)) {
    try {
      const url = `https://tcgcsv.com/download/ppmd/${dateStr}/ppmd.7z`;
      const response = await fetch(url);

      if (!response.ok) {
        return 'fail';
      }

      const buffer = await response.arrayBuffer();
      await writeFile(archiveFile, Buffer.from(buffer));
      const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(2);
      console.log(`  ✓ Downloaded ${dateStr} (${sizeMB} MB)`);
    } catch (error) {
      return 'fail';
    }
  }

  // Extract archive
  try {
    execSync(`7z x "${archiveFile}" -o"${extractDir}" -y > /dev/null 2>&1`);
    console.log(`  ✓ Extracted ${dateStr}`);
    return 'success';
  } catch (error) {
    console.log(`  ✗ Failed to extract ${dateStr}`);
    return 'fail';
  }
}

// Download historical price archives
async function downloadHistoricalPrices(startDate: Date, endDate: Date) {
  const outputDir = join(process.cwd(), 'tcgcsv');
  await mkdir(outputDir, { recursive: true });

  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║     Downloading TCGCSV Historical Price Data          ║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);
  console.log(`Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}\n`);

  const currentDate = new Date(startDate);
  let success = 0;
  let skip = 0;
  let fail = 0;

  const progressBar = (current: number, total: number) => {
    const percent = Math.round((current / total) * 100);
    const filled = Math.round(percent / 2);
    const bar = '█'.repeat(filled) + '░'.repeat(50 - filled);
    return `[${bar}] ${percent}%`;
  };

  // Calculate total days
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  let processedDays = 0;

  console.log('Progress:\n');

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];

    const result = await downloadDay(dateStr, outputDir);
    processedDays++;

    if (result === 'success') {
      success++;
    } else if (result === 'skip') {
      skip++;
    } else {
      fail++;
    }

    // Update progress bar every 10 days or on last day
    if (processedDays % 10 === 0 || processedDays === totalDays) {
      process.stdout.write(`\r${progressBar(processedDays, totalDays)} (${processedDays}/${totalDays} days)`);
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);

    // Small delay every 5 requests to be nice to the server
    if (success % 5 === 0 && success > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n\n=== Download Summary ===');
  console.log(`✓ Downloaded: ${success}`);
  console.log(`⊙ Already had: ${skip}`);
  console.log(`✗ Failed: ${fail}`);
  console.log(`━ Total days: ${success + skip + fail}`);

  return { success, skip, fail };
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  let startDate: Date;
  let endDate = new Date();

  if (args.length === 0) {
    // Default: last 365 days
    startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);
    console.log('\nNo date range specified. Downloading last 365 days...');
  } else if (args.length === 1) {
    // Number of days back
    const daysBack = parseInt(args[0]);
    if (isNaN(daysBack)) {
      console.error('Usage: bun downloadHistory.ts [days_back | start_date end_date]');
      console.error('Examples:');
      console.error('  bun downloadHistory.ts              # Last 365 days');
      console.error('  bun downloadHistory.ts 90           # Last 90 days');
      console.error('  bun downloadHistory.ts 2024-01-01 2024-12-31  # Specific range');
      process.exit(1);
    }
    startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
  } else {
    // Specific date range
    startDate = new Date(args[0]);
    endDate = new Date(args[1]);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.error('Invalid date format. Use YYYY-MM-DD');
      process.exit(1);
    }
  }

  // Ensure start is before end
  if (startDate > endDate) {
    [startDate, endDate] = [endDate, startDate];
  }

  const result = await downloadHistoricalPrices(startDate, endDate);

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║                Download Complete!                      ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  if (result.success > 0) {
    console.log('📝 Next Steps:\n');
    console.log('1. Process the historical data:');
    console.log('   bun processTCGCSV.ts\n');
    console.log('2. Rebuild Docker image:');
    console.log('   docker build -t local-tcgdex .\n');
    console.log('3. Restart server:');
    console.log('   docker-compose down && docker-compose up -d\n');
  }
}

main().catch(console.error);
