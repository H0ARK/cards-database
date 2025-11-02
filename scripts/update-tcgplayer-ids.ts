#!/usr/bin/env bun
import fs from 'fs/promises'
import path from 'path'
import { glob } from 'glob'

interface Product {
	productId: number
	name: string
	extendedData: Array<{
		name: string
		displayName: string
		value: string
	}>
}

interface ProductsFile {
	totalItems: number
	success: boolean
	errors: any[]
	results: Product[]
}

interface Set {
	id: string
	name: any
	thirdParty?: {
		tcgplayer?: number
		cardmarket?: number
	}
}

// Track statistics
const stats = {
	setsProcessed: 0,
	cardsUpdated: 0,
	cardsSkipped: 0,
	cardsNotFound: 0,
	errors: 0
}

/**
 * Extract card number from product extendedData
 */
function getCardNumber(product: Product): string | null {
	const numberData = product.extendedData.find(d => d.name === 'Number')
	if (!numberData?.value) return null

	// Extract the card number - handles both "001/197" and "032" formats
	// Keep leading zeros to match file names
	const slashMatch = numberData.value.match(/^(\d+)\//)
	if (slashMatch) return slashMatch[1]

	// For promos and special sets without slash (e.g., "032")
	const numberMatch = numberData.value.match(/^(\d+)$/)
	return numberMatch ? numberMatch[1] : null
}

/**
 * Check if a product is an actual card (not a booster box, etc.)
 */
function isCard(product: Product): boolean {
	const hasCardNumber = product.extendedData.some(d => d.name === 'Number')
	const isSealed = product.name.toLowerCase().includes('booster') ||
		product.name.toLowerCase().includes('box') ||
		product.name.toLowerCase().includes('blister') ||
		product.name.toLowerCase().includes('bundle') ||
		product.name.toLowerCase().includes('case') ||
		product.name.toLowerCase().includes('pack')

	return hasCardNumber && !isSealed
}

/**
 * Load and parse a set file to get TCGPlayer groupId
 */
async function loadSetData(setFilePath: string): Promise<Set | null> {
	try {
		const content = await fs.readFile(setFilePath, 'utf-8')

		// Extract tcgplayer ID directly (works with any variable name)
		const tcgplayerMatch = content.match(/tcgplayer:\s*(\d+)/)
		if (!tcgplayerMatch) return null

		return {
			id: '',
			name: {},
			thirdParty: {
				tcgplayer: parseInt(tcgplayerMatch[1])
			}
		}
	} catch (error) {
		return null
	}
}

/**
 * Update a card file with TCGPlayer productId
 */
async function updateCardFile(cardPath: string, productId: number, dryRun: boolean): Promise<boolean> {
	try {
		let content = await fs.readFile(cardPath, 'utf-8')

		// Check if already has tcgplayer field
		if (content.includes('tcgplayer:')) {
			console.log(`   [SKIP] ${path.basename(cardPath)} - already has tcgplayer`)
			stats.cardsSkipped++
			return false
		}

		// Find the thirdParty block
		if (content.includes('thirdParty:')) {
			// Add tcgplayer to existing thirdParty block
			// Need to add comma after cardmarket and then add tcgplayer
			content = content.replace(
				/(cardmarket:\s*\d+)(\s*\n\s*\})/,
				`$1,\n\t\ttcgplayer: ${productId}$2`
			)
		} else {
			// Add new thirdParty block before the closing brace of card object
			content = content.replace(
				/(\n)(})\n\n(export default card)/,
				`$1\tthirdParty: {\n\t\ttcgplayer: ${productId}\n\t},\n$2\n\n$3`
			)
		}

		if (!dryRun) {
			await fs.writeFile(cardPath, content, 'utf-8')
		}

		console.log(`   [UPDATE] ${path.basename(cardPath)} -> productId ${productId}`)
		stats.cardsUpdated++
		return true
	} catch (error) {
		console.error(`Error updating ${cardPath}:`, error)
		stats.errors++
		return false
	}
}

/**
 * Process a single set
 */
async function processSet(setPath: string, dryRun: boolean): Promise<void> {
	const setDir = path.dirname(setPath)
	const setName = path.basename(setPath, '.ts')
	const setData = await loadSetData(setPath)

	if (!setData?.thirdParty?.tcgplayer) {
		console.log(`⊘ Skipping ${setName} - no TCGPlayer groupId`)
		return
	}

	const groupId = setData.thirdParty.tcgplayer
	const productsPath = path.resolve(process.cwd(), `var/models/tcgplayer/products/${groupId}.json`)

	// Check if products file exists
	try {
		await fs.access(productsPath)
	} catch {
		console.log(`⊘ Skipping ${setName} - no products file for groupId ${groupId}`)
		return
	}

	// Load products
	const productsData: ProductsFile = JSON.parse(await fs.readFile(productsPath, 'utf-8'))

	// Build card number to productId map
	const cardMap = new Map<string, number>()
	for (const product of productsData.results) {
		if (!isCard(product)) continue

		const cardNumber = getCardNumber(product)
		if (cardNumber) {
			cardMap.set(cardNumber, product.productId)
		}
	}

	console.log(`\n📦 Processing ${setName} (groupId: ${groupId})`)
	console.log(`   Found ${cardMap.size} card products`)

	// Find all card files in this set
	// Cards are in a directory with the same name as the set file
	const cardsDir = path.join(setDir, setName)
	const cardFiles = await glob(`${cardsDir}/[0-9]*.ts`)

	let setUpdated = 0
	let setSkipped = 0
	let setNotFound = 0

	for (const cardPath of cardFiles) {
		const filename = path.basename(cardPath, '.ts')
		// Pad card number with leading zeros to match product card numbers
		// e.g., "1" -> "001", "12" -> "012"
		const cardNumber = filename.padStart(3, '0')

		const productId = cardMap.get(cardNumber)

		if (!productId) {
			console.log(`   [NOT FOUND] ${filename} - no product in TCGPlayer`)
			setNotFound++
			stats.cardsNotFound++
			continue
		}

		const updated = await updateCardFile(cardPath, productId, dryRun)
		if (updated) {
			setUpdated++
		} else {
			setSkipped++
		}
	}

	console.log(`   ✓ Updated: ${setUpdated}, Skipped: ${setSkipped}, Not Found: ${setNotFound}`)
	stats.setsProcessed++
}

/**
 * Main execution
 */
async function main() {
	const args = process.argv.slice(2)
	const dryRun = args.includes('--dry')
	const setPattern = args.find(arg => !arg.startsWith('--')) || 'data/**/*.ts'

	console.log('🚀 TCGPlayer ID Updater')
	console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (files will be modified)'}`)
	console.log(`Pattern: ${setPattern}\n`)

	// Find all set files (not card files)
	const setFiles = await glob(setPattern, {
		ignore: ['**/[0-9]*.ts', '**/node_modules/**']
	})

	console.log(`Found ${setFiles.length} set files to process\n`)

	for (const setFile of setFiles) {
		await processSet(setFile, dryRun)
	}

	console.log('\n' + '='.repeat(60))
	console.log('📊 Summary:')
	console.log('='.repeat(60))
	console.log(`Sets Processed:    ${stats.setsProcessed}`)
	console.log(`Cards Updated:     ${stats.cardsUpdated}`)
	console.log(`Cards Skipped:     ${stats.cardsSkipped} (already have TCGPlayer ID)`)
	console.log(`Cards Not Found:   ${stats.cardsNotFound} (no matching product)`)
	console.log(`Errors:            ${stats.errors}`)
	console.log('='.repeat(60))

	if (dryRun) {
		console.log('\n⚠️  This was a DRY RUN. Run without --dry to apply changes.')
	} else {
		console.log('\n✅ Done! Files have been updated.')
	}
}

main().catch(console.error)
