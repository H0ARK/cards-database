import fs from 'fs/promises'
import path from 'path'
import { glob } from 'glob'
import { extractFile } from './utils/ts-extract-utils'
import { Card, Set } from '../interfaces'

interface PriceHistoryPoint {
	date: string
	price: number
	low?: number
	high?: number
	market?: number
	volume?: number
	currency: string
}

/**
 * Download TCGPlayer historical price data for all cards
 * This will create a comprehensive historical database for price charts
 */
async function downloadTCGPlayerHistory() {
	try {
		console.log('🚀 Starting TCGPlayer historical data download...')

		// Create directories for historical data
		const historyBaseFolder = 'var/models/tcgplayer/history'
		const dailyFolder = `${historyBaseFolder}/daily`
		const monthlyFolder = `${historyBaseFolder}/monthly`
		const yearlyFolder = `${historyBaseFolder}/yearly`

		await fs.mkdir(dailyFolder, { recursive: true })
		await fs.mkdir(monthlyFolder, { recursive: true })
		await fs.mkdir(yearlyFolder, { recursive: true })

		// Find all card files
		console.log('📂 Finding all card files...')
		const cardFiles = await glob('data/**/*.ts', {
			cwd: process.cwd(),
			ignore: ['data/**/index.ts', 'data/**/serie.ts', 'data/**/set.ts']
		})

		console.log(`📋 Found ${cardFiles.length} card files to process`)

		let processedCount = 0
		let totalCards = 0

		// Process each card file
		for (const cardFile of cardFiles) {
			try {
				const cardData: Card = extractFile(cardFile)

				// Skip if no TCGPlayer ID
				if (!cardData.thirdParty?.tcgplayer) {
					continue
				}

				const productId = cardData.thirdParty.tcgplayer
				const cardId = `${cardData.set.id}-${cardData.localId}`

				console.log(`📊 Processing ${cardId} (TCGPlayer ID: ${productId})`)

				// Download historical data for different time ranges
				await downloadCardHistory(productId, cardId, dailyFolder, monthlyFolder, yearlyFolder)

				processedCount++
				totalCards++

				// Progress logging
				if (processedCount % 100 === 0) {
					console.log(`✅ Processed ${processedCount} cards...`)
				}

				// Rate limiting - don't hammer TCGPlayer API
				await new Promise(resolve => setTimeout(resolve, 100))

			} catch (error) {
				console.error(`❌ Error processing ${cardFile}:`, error)
				continue
			}
		}

		console.log(`🎉 Completed! Downloaded historical data for ${totalCards} cards`)

		// Create index file for quick lookups
		await createHistoryIndex(historyBaseFolder)

	} catch (error) {
		console.error('💥 Fatal error:', error)
		process.exit(1)
	}
}

async function downloadCardHistory(
	productId: number,
	cardId: string,
	dailyFolder: string,
	monthlyFolder: string,
	yearlyFolder: string
) {
	// TCGPlayer price history API endpoints
	const timeRanges = [
		{ name: 'daily', days: 30, folder: dailyFolder },
		{ name: 'monthly', days: 90, folder: monthlyFolder },
		{ name: 'yearly', days: 365, folder: yearlyFolder }
	]

	for (const range of timeRanges) {
		try {
			const historyData = await fetchTCGPlayerHistory(productId, range.days)

			if (historyData && historyData.length > 0) {
				const filename = `${range.folder}/${cardId}.json`
				await fs.writeFile(filename, JSON.stringify({
					productId,
					cardId,
					timeRange: range.name,
					days: range.days,
					dataPoints: historyData.length,
					lastUpdated: new Date().toISOString(),
					history: historyData
				}, null, 2))

				console.log(`  ✅ ${range.name}: ${historyData.length} data points`)
			}
		} catch (error) {
			console.warn(`  ⚠️ Failed to get ${range.name} data for ${cardId}:`, error.message)
		}
	}
}

async function fetchTCGPlayerHistory(productId: number, days: number): Promise<PriceHistoryPoint[]> {
	// TCGPlayer's Infinite API for price history
	// This is a public API that doesn't require authentication
	const range = days <= 30 ? 'week' : days <= 90 ? 'month' : 'quarter'
	const url = `https://infinite-api.tcgplayer.com/price/history/${productId}/detailed?range=${range}`

	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent': 'TCGdex-History-Downloader/1.0',
				'Accept': 'application/json'
			}
		})

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`)
		}

		const data = await response.json()

		// Transform TCGPlayer data format to our standard format
		return data.map((point: any) => ({
			date: point.date,
			price: point.avgPrice || point.marketPrice || 0,
			low: point.loPrice,
			high: point.hiPrice,
			market: point.marketPrice,
			currency: 'USD'
		})).filter((point: PriceHistoryPoint) => point.price > 0)

	} catch (error) {
		console.error(`Error fetching history for product ${productId}:`, error)
		return []
	}
}

async function createHistoryIndex(baseFolder: string) {
	console.log('📝 Creating history index...')

	const index = {
		lastUpdated: new Date().toISOString(),
		version: '1.0',
		totalCards: 0,
		timeRanges: ['daily', 'monthly', 'yearly'],
		cards: {} as Record<string, {
			productId: number
			timeRanges: string[]
			dataPoints: Record<string, number>
		}>
	}

	// Scan all history files
	for (const range of ['daily', 'monthly', 'yearly']) {
		const rangeFolder = `${baseFolder}/${range}`
		try {
			const files = await fs.readdir(rangeFolder)

			for (const file of files) {
				if (!file.endsWith('.json')) continue

				const cardId = file.replace('.json', '')
				const filePath = `${rangeFolder}/${file}`
				const data = JSON.parse(await fs.readFile(filePath, 'utf8'))

				if (!index.cards[cardId]) {
					index.cards[cardId] = {
						productId: data.productId,
						timeRanges: [],
						dataPoints: {}
					}
				}

				index.cards[cardId].timeRanges.push(range)
				index.cards[cardId].dataPoints[range] = data.dataPoints || 0
			}
		} catch (error) {
			console.warn(`Warning: Could not read ${rangeFolder}:`, error.message)
		}
	}

	index.totalCards = Object.keys(index.cards).length

	// Write index file
	await fs.writeFile(`${baseFolder}/index.json`, JSON.stringify(index, null, 2))
	console.log(`✅ Created index for ${index.totalCards} cards`)
}

// Run the downloader
if (import.meta.main) {
	downloadTCGPlayerHistory()
}

