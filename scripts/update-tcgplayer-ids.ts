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
	cardsWithMultipleVariants: 0,
	totalVariants: 0,
	errors: 0
}

/**
 * Detect variant type from product name
 */
function detectVariant(productName: string): string {
	const lower = productName.toLowerCase()

	if (lower.includes('master ball pattern')) return 'masterball'
	if (lower.includes('poke ball pattern') || lower.includes('pokéball pattern')) return 'pokeball'
	if (lower.includes('reverse holo')) return 'reverse'
	if (lower.includes('holofoil') || lower.includes(' holo')) return 'holo'
	if (lower.includes('etched')) return 'etched'
	if (lower.includes('galaxy')) return 'galaxy'
	if (lower.includes('cosmos')) return 'cosmos'

	return 'normal'
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
		product.name.toLowerCase().includes('pack') ||
		product.name.toLowerCase().includes('elite trainer') ||
		product.name.toLowerCase().includes('collection') ||
		product.name.toLowerCase().includes('tin') ||
		product.name.toLowerCase().includes('deck')

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
 * Update a card file with TCGPlayer productId(s)
 */
async function updateCardFile(
	cardPath: string,
	variants: Record<string, number>,
	dryRun: boolean
): Promise<boolean> {
	try {
		let content = await fs.readFile(cardPath, 'utf-8')

		// Get variant keys for logging
		const variantKeys = Object.keys(variants)

		// Always use object format for consistency across all cards
		const variantLines = Object.entries(variants)
			.sort(([a], [b]) => {
				// Sort: normal first, then alphabetically
				if (a === 'normal') return -1
				if (b === 'normal') return 1
				return a.localeCompare(b)
			})
			.map(([variant, productId]) => `\t\t\t${variant}: ${productId}`)
			.join(',\n')

		const newTcgplayerValue = `{\n${variantLines}\n\t\t}`

		// Check if already has tcgplayer field
		if (content.includes('tcgplayer:')) {
			// Replace existing value (supports both number and object formats)
			content = content.replace(
				/tcgplayer:\s*(\d+|{[^}]*})/s,
				`tcgplayer: ${newTcgplayerValue}`
			)
			console.log(`   [UPDATE] ${path.basename(cardPath)} -> ${variantKeys.length} variant(s)`)
		} else {
			// Add new tcgplayer field
			if (content.includes('thirdParty:')) {
				// Add to existing thirdParty block
				content = content.replace(
					/(cardmarket:\s*\d+)(\s*\n\s*\})/,
					`$1,\n\t\ttcgplayer: ${newTcgplayerValue}$2`
				)
			} else {
				// Add new thirdParty block
				content = content.replace(
					/(\n)(})\n\n(export default card)/,
					`$1\tthirdParty: {\n\t\ttcgplayer: ${newTcgplayerValue}\n\t},\n$2\n\n$3`
				)
			}
			console.log(`   [ADD] ${path.basename(cardPath)} -> ${variantKeys.length} variant(s)`)
		}

		if (!dryRun) {
			await fs.writeFile(cardPath, content, 'utf-8')
		}

		stats.cardsUpdated++
		if (variantKeys.length > 1) {
			stats.cardsWithMultipleVariants++
			console.log(`         Variants: ${variantKeys.join(', ')}`)
		}
		stats.totalVariants += variantKeys.length

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

	// Build card number to variants map (supports multiple product IDs per card)
	const cardVariantsMap = new Map<string, Record<string, number>>()

	for (const product of productsData.results) {
		if (!isCard(product)) continue

		const cardNumber = getCardNumber(product)
		if (!cardNumber) continue

		const variant = detectVariant(product.name)

		if (!cardVariantsMap.has(cardNumber)) {
			cardVariantsMap.set(cardNumber, {})
		}

		cardVariantsMap.get(cardNumber)![variant] = product.productId
	}

	console.log(`\n📦 Processing ${setName} (groupId: ${groupId})`)
	console.log(`   Found ${cardVariantsMap.size} unique cards`)

	// Count total variants
	let totalVariantsInSet = 0
	let cardsWithMultipleVariantsInSet = 0
	cardVariantsMap.forEach(variants => {
		totalVariantsInSet += Object.keys(variants).length
		if (Object.keys(variants).length > 1) {
			cardsWithMultipleVariantsInSet++
		}
	})
	console.log(`   Total product variants: ${totalVariantsInSet}`)
	if (cardsWithMultipleVariantsInSet > 0) {
		console.log(`   Cards with multiple variants: ${cardsWithMultipleVariantsInSet}`)
	}

	// Find all card files in this set
	const cardsDir = path.join(setDir, setName)
	const cardFiles = await glob(`${cardsDir}/[0-9]*.ts`)

	let setUpdated = 0
	let setSkipped = 0
	let setNotFound = 0

	for (const cardPath of cardFiles) {
		const filename = path.basename(cardPath, '.ts')
		// Pad card number with leading zeros to match product card numbers
		const cardNumber = filename.padStart(3, '0')

		const variants = cardVariantsMap.get(cardNumber)

		if (!variants || Object.keys(variants).length === 0) {
			console.log(`   [NOT FOUND] ${filename} - no product in TCGPlayer`)
			setNotFound++
			stats.cardsNotFound++
			continue
		}

		const updated = await updateCardFile(cardPath, variants, dryRun)
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

	console.log('🚀 TCGPlayer ID Updater (Multi-Variant Support)')
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
	console.log(`Sets Processed:              ${stats.setsProcessed}`)
	console.log(`Cards Updated:               ${stats.cardsUpdated}`)
	console.log(`Cards with Multiple Variants: ${stats.cardsWithMultipleVariants}`)
	console.log(`Total Variants Added:        ${stats.totalVariants}`)
	console.log(`Cards Skipped:               ${stats.cardsSkipped}`)
	console.log(`Cards Not Found:             ${stats.cardsNotFound}`)
	console.log(`Errors:                      ${stats.errors}`)
	console.log('='.repeat(60))

	if (stats.cardsWithMultipleVariants > 0) {
		console.log('\n💡 Multi-Variant Format Example:')
		console.log('   thirdParty: {')
		console.log('     tcgplayer: {')
		console.log('       normal: 642180,')
		console.log('       pokeball: 642421,')
		console.log('       masterball: 642349')
		console.log('     }')
		console.log('   }')
	}

	if (dryRun) {
		console.log('\n⚠️  This was a DRY RUN. Run without --dry to apply changes.')
	} else {
		console.log('\n✅ Done! Files have been updated.')
	}
}

main().catch(console.error)
