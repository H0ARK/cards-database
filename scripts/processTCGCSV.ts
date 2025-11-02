import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { glob } from "glob";
import { extractFile } from "./utils/ts-extract-utils";

interface PriceData {
	date: string;
	lowPrice: number;
	midPrice: number;
	highPrice: number;
	marketPrice: number;
	directLowPrice: number | null;
	subTypeName: string;
}

interface PriceHistoryPoint {
	date: string;
	price: number;
	low?: number;
	high?: number;
	market?: number;
	currency: string;
}

async function processTCGCSV() {
	try {
		console.log(
			"╔════════════════════════════════════════════════════════╗"
		);
		console.log(
			"║     Processing TCGCSV Historical Price Data           ║"
		);
		console.log(
			"╚════════════════════════════════════════════════════════╝\n"
		);

		// Create directories for historical data
		const historyBaseFolder = "var/models/tcgplayer/history";
		const dailyFolder = `${historyBaseFolder}/daily`;
		await fs.mkdir(dailyFolder, { recursive: true });

		// Find all date folders in tcgcsv directory
		console.log("📁 Scanning for TCGCSV date folders...");
		const tcgcsvDir = "tcgcsv";
		let dateFolders: string[] = [];

		try {
			const entries = await fs.readdir(tcgcsvDir, {
				withFileTypes: true,
			});
			dateFolders = entries
				.filter(
					(entry) =>
						entry.isDirectory() &&
						/^\d{4}-\d{2}-\d{2}$/.test(entry.name)
				)
				.map((entry) => entry.name)
				.sort();
		} catch (error) {
			console.error(
				`❌ Error reading tcgcsv directory: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
			console.log("Looking for old location...");
			// Try old location
			try {
				const entries = await fs.readdir(".", { withFileTypes: true });
				dateFolders = entries
					.filter(
						(entry) =>
							entry.isDirectory() &&
							/^\d{4}-\d{2}-\d{2}$/.test(entry.name)
					)
					.map((entry) => entry.name)
					.sort();
			} catch (err) {
				console.error("❌ Could not find any TCGCSV date folders!");
				process.exit(1);
			}
		}

		if (dateFolders.length === 0) {
			console.error(
				"❌ No date folders found! Please download TCGCSV data first."
			);
			console.log("\nRun: bun downloadHistory.ts 90");
			process.exit(1);
		}

		console.log(
			`✓ Found ${dateFolders.length} date folder(s): ${dateFolders.join(
				", "
			)}\n`
		);

		// Prepare for batched processing
		console.log("📊 Preparing for batched processing...");

		// Track card processing by product ID
		const cardsByProduct = new Map<number, string[]>();
		let totalCardsWithTCGPlayer = 0;

		// Check if we have a cached mapping
		const cacheFile = "var/models/tcgplayer/cards-product-mapping.json";
		let useCache = false;
		try {
			const cached = JSON.parse(await fs.readFile(cacheFile, "utf8"));
			for (const [productId, cardIds] of Object.entries(cached)) {
				cardsByProduct.set(parseInt(productId), cardIds as string[]);
				totalCardsWithTCGPlayer += (cardIds as string[]).length;
			}
			useCache = true;
			console.log("✓ Loaded cached product mapping\n");
		} catch {
			console.log("⚠️  No cache found, scanning card files...\n");
		}

		if (!useCache) {
			// First pass: map cards to product IDs
			console.log(
				"🔍 Phase 1: Mapping cards to TCGPlayer product IDs..."
			);

			// Find all card files (including Asian cards)
			console.log("\n📂 Finding all card files...");
			const cardFilesData = await glob("data/**/*.ts", {
				cwd: process.cwd(),
				ignore: ["**/index.ts"],
			});
			const cardFilesAsia = await glob("data-asia/**/*.ts", {
				cwd: process.cwd(),
				ignore: ["**/index.ts"],
			});
			const cardFiles = [...cardFilesData, ...cardFilesAsia];

			// Filter to only actual card files (numeric filenames in set directories)
			const actualCardFiles = cardFiles.filter((file) => {
				const filename = path.basename(file, ".ts");
				const parentDir = path.dirname(file);
				const parts = parentDir.split(path.sep);
				// Should be: data/Serie/SetName/cardNumber.ts
				return parts.length >= 3 && /^\d+/.test(filename);
			});

			console.log(
				`📋 Found ${actualCardFiles.length} card files to process\n`
			);

			// Second pass: map cards to product IDs
			for (const cardFile of actualCardFiles) {
				try {
					const cardData = extractFile(cardFile);

					if (!cardData || !cardData.thirdParty?.tcgplayer) {
						continue;
					}

					const productId = cardData.thirdParty.tcgplayer;
					const setPath = path.dirname(cardFile);
					const setName = path.basename(setPath);
					const cardNumber = path.basename(cardFile, ".ts");

					// Try to extract set ID from the card's set reference
					let setId = setName.toLowerCase().replace(/[^a-z0-9]/g, "");

					// Better: try to read the set file to get the actual set.id
					try {
						const setFile = path.join(setPath + ".ts");
						const setData = extractFile(setFile);
						if (setData && setData.id) {
							setId = setData.id;
						}
					} catch {}

					const cardId = `${setId}-${cardNumber}`;

					if (!cardsByProduct.has(productId)) {
						cardsByProduct.set(productId, []);
					}
					cardsByProduct.get(productId)!.push(cardId);
					totalCardsWithTCGPlayer++;
				} catch (error) {
					// Silently skip cards that can't be parsed
					continue;
				}
			}

			console.log(
				`  ✓ Found ${totalCardsWithTCGPlayer} cards with TCGPlayer IDs`
			);
			console.log(
				`  ✓ Mapped to ${cardsByProduct.size} unique product IDs\n`
			);

			// Save cache
			const cacheData: Record<string, string[]> = {};
			for (const [productId, cardIds] of cardsByProduct.entries()) {
				cacheData[productId.toString()] = cardIds;
			}
			await fs.mkdir(path.dirname(cacheFile), { recursive: true });
			await fs.writeFile(cacheFile, JSON.stringify(cacheData));
			console.log("✓ Saved product mapping cache\n");
		}

		// Second pass: Process day-by-day BACKWARDS (newest first), appending prices incrementally
		console.log(
			"📝 Phase 2: Processing 612 dates incrementally (NEWEST FIRST)..."
		);
		console.log("   Starting with today and working backwards\n");

		let processedCount = 0;
		let productsWithData = new Set<number>();
		let dateCount = 0;

		// Process dates in REVERSE order (newest first)
		const reverseDateFolders = [...dateFolders].reverse();

		for (const dateFolder of reverseDateFolders) {
			dateCount++;
			if (
				dateCount % 50 === 0 ||
				dateCount === 1 ||
				dateCount === reverseDateFolders.length
			) {
				console.log(
					`  📅 [${dateCount}/${reverseDateFolders.length}] Processing ${dateFolder}... (${processedCount} files)`
				);
			}

			// Try both locations
			const possiblePaths = [
				path.join(tcgcsvDir, dateFolder),
				dateFolder,
			];

			let basePath = "";
			for (const p of possiblePaths) {
				try {
					await fs.access(p);
					basePath = p;
					break;
				} catch {}
			}

			if (!basePath) {
				continue;
			}

			// Find all price files for this date
			const priceFiles = await glob("**/prices", {
				cwd: basePath,
				absolute: false,
			});

			for (const priceFile of priceFiles) {
				try {
					const fullPath = path.join(basePath, priceFile);
					const content = await fs.readFile(fullPath, "utf8");
					const data = JSON.parse(content);

					if (data.success && data.results) {
						for (const result of data.results) {
							const productId = result.productId;

							// Only process products we know about
							if (!cardsByProduct.has(productId)) {
								continue;
							}

							const cardIds = cardsByProduct.get(productId)!;
							const pricePoint = {
								date: dateFolder,
								price:
									result.marketPrice || result.midPrice || 0,
								low: result.lowPrice || 0,
								high: result.highPrice || 0,
								market: result.marketPrice || 0,
								currency: "USD",
							};

							productsWithData.add(productId);

							// Update or create history file for each card
							for (const cardId of cardIds) {
								const filename = `${dailyFolder}/${cardId}.json`;

								let historyData: any;

								// Read existing file if it exists
								if (existsSync(filename)) {
									try {
										const existing = JSON.parse(
											await fs.readFile(filename, "utf8")
										);
										historyData = existing;
										// Add or update the price point for this date
										const existingIndex =
											historyData.history.findIndex(
												(h: any) =>
													h.date === dateFolder
											);
										if (existingIndex >= 0) {
											historyData.history[existingIndex] =
												pricePoint;
										} else {
											historyData.history.push(
												pricePoint
											);
										}
										// Keep sorted by date
										historyData.history.sort(
											(a: any, b: any) =>
												a.date.localeCompare(b.date)
										);
										historyData.days =
											historyData.history.length;
										historyData.dataPoints =
											historyData.history.length;
										historyData.lastUpdated =
											new Date().toISOString();
									} catch {
										// If read fails, create new
										historyData = {
											productId,
											cardId,
											timeRange: "daily",
											days: 1,
											dataPoints: 1,
											lastUpdated:
												new Date().toISOString(),
											history: [pricePoint],
										};
									}
								} else {
									// Create new history file
									historyData = {
										productId,
										cardId,
										timeRange: "daily",
										days: 1,
										dataPoints: 1,
										lastUpdated: new Date().toISOString(),
										history: [pricePoint],
									};
								}

								await fs.writeFile(
									filename,
									JSON.stringify(historyData, null, 2)
								);
								processedCount++;
							}
						}
					}
				} catch (error) {
					// Silently skip
				}
			}
		}

		console.log(
			`\n✅ Completed! Created/updated history for ${processedCount} card files`
		);
		console.log(
			`   (${productsWithData.size} unique products with price data)\n`
		);

		// Create index file
		await createHistoryIndex(historyBaseFolder, processedCount);

		console.log(
			"\n╔════════════════════════════════════════════════════════╗"
		);
		console.log(
			"║              Processing Complete!                      ║"
		);
		console.log(
			"╚════════════════════════════════════════════════════════╝\n"
		);
		console.log("📝 Next Steps:\n");
		console.log("1. Rebuild Docker image with history data:");
		console.log("   docker build -t local-tcgdex .\n");
		console.log("2. Restart server:");
		console.log("   docker-compose down && docker-compose up -d\n");
		console.log("3. Test the API:");
		console.log(
			"   curl http://localhost:3000/v2/en/cards/base1-1/history\n"
		);
	} catch (error) {
		console.error("💥 Fatal error:", error);
		process.exit(1);
	}
}

async function createHistoryIndex(baseFolder: string, totalCards: number) {
	console.log("📝 Creating history index...");

	const index = {
		lastUpdated: new Date().toISOString(),
		version: "1.0",
		totalCards,
		timeRanges: ["daily"],
		cards: {} as Record<
			string,
			{
				productId: number;
				timeRanges: string[];
				dataPoints: Record<string, number>;
			}
		>,
	};

	// Scan daily history files
	const dailyFolder = `${baseFolder}/daily`;
	try {
		const files = await fs.readdir(dailyFolder);

		for (const file of files) {
			if (!file.endsWith(".json")) continue;

			const cardId = file.replace(".json", "");
			const filePath = `${dailyFolder}/${file}`;
			const data = JSON.parse(await fs.readFile(filePath, "utf8"));

			index.cards[cardId] = {
				productId: data.productId,
				timeRanges: ["daily"],
				dataPoints: { daily: data.dataPoints || data.days || 1 },
			};
		}
	} catch (error) {
		console.warn(
			`  ⚠️  Warning: Could not read daily folder: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}

	// Update totalCards
	index.totalCards = Object.keys(index.cards).length;

	// Write index file
	await fs.writeFile(
		`${baseFolder}/index.json`,
		JSON.stringify(index, null, 2)
	);
	console.log(`  ✓ Created index for ${index.totalCards} cards with history`);
}

// Run the processor
if (import.meta.main) {
	processTCGCSV();
}
