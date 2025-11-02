#!/usr/bin/env bun
/**
 * Update TCGPlayer Product IDs with Multi-Variant Support
 *
 * This script maps TCGPlayer product IDs to card files, supporting multiple
 * variants per card (e.g., Pokéball Pattern, Master Ball Pattern, etc.)
 *
 * Usage:
 *   bun run scripts/update-tcgplayer-ids-variants.ts [setPath]
 *
 * Examples:
 *   bun run scripts/update-tcgplayer-ids-variants.ts "data/Scarlet & Violet/Black Bolt"
 *   bun run scripts/update-tcgplayer-ids-variants.ts  # Process all sets
 */

import fs from 'fs/promises'
import path from 'path'
import { glob } from 'glob'
import { detectVariantFromName, type TCGPlayerVariant } from './types/tcgplayer-variants'

interface Product {
	productId: number
	name: string
	cleanName: string
	categoryId: number
	groupId: number
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

interface SetData {
	filePath: string
	name: string
	tcgplayerGroupId?: number
}

interface CardVariants {
	[cardNumber: string]: {
		[variant: string]: number  // variant -> productId
	}
}

const stats = {
	setsProcessed: 0,
	cardsUpdated: 0,
	cardsSkipped: 0,
	cardsWithMultipleVariants: 0,
	variantsAdded: 0,
	errors: 0
}

/**
 * Extract card number from product's extended data
 */
function getCardNumber(product: Product): string | null {
	const numberField = product.extendedData.find(d => d.name === 'Number')
	return numberField?.value || null
}

/**
 * Normalize card number for matching (pad zeros, handle promos)
 */
function normalizeCardNumber(num: string): string {
	// Handle promo format like "SWSH001" or "SVP001"
	if (/^[A-Z]+\d+/.test(num)) {
		return num
	}

	// Handle format like "001/132" or "001"
	const parts = num.split('/')
	if (parts.length === 2) {
		// Pad both parts to 3 digits
		const [cardNum, setTotal] = parts
		return `${cardNum.padStart(3, '0')}/${setTotal.padStart(3, '0')}`
	}

	// Single number - pad to 3 digits
	return num.padStart(3, '0')
}

/**
 * Check if product is a card (not sealed product)
 */
function isCardProduct(product: Product): boolean {
	const hasCardNumber = product.extendedData.some(d => d.name === 'Number')
	const name = product.name.toLowerCase()

	// Exclude sealed products
	const sealedKeywords = [
		'booster box', 'booster pack', 'booster bundle',
		'elite trainer box', 'etb',
		'blister', 'case',
		'collection box', 'bundle',
		'tin', 'premium collection',
		'code card', 'theme deck',
		'battle deck', 'trainer kit',
		'build & battle', 'prerelease',
		'starter set', 'deck'
	]

	const isSealed = sealedKeywords.some(keyword => name.includes(keyword))

	return hasCardNumber && !isSealed
}

/**
 * Build product map from TCGPlayer product file
 */
async function buildProductMap(groupId: number): Promise<CardVariants> {
	const productPath = `var/models/tcgplayer/products/${groupId}.json`
	const cardVariants: CardVariants = {}

	try {
		const content = await fs.readFile(productPath, 'utf-8')
		const data: ProductsFile = JSON.parse(content)

		for (const product of data.results) {
			if (!isCardProduct(product)) continue

			const cardNumber = getCardNumber(product)
			if (!cardNumber) continue

			const normalized = normalizeCardNumber(cardNumber)
			const variant = detectVariantFromName(product.name)

			if (!cardVariants[normalized]) {
				cardVariants[normalized] = {}
			}

			cardVariants[normalized][variant] = product.productId
		}

		return cardVariants
	} catch (error) {
		console.warn(`⚠️  Could not load products for groupId ${groupId}:`, (error as Error).message)
		return {}
	}
}

/**
 * Load set data from set file
 */
async function loadSetData(setFilePath: string): Promise<SetData | null> {
	try {
		const content = await fs.readFile(setFilePath, 'utf-8')

		// Extract TCGPlayer groupId
		const tcgplayerMatch = content.match(/tcgplayer:\s*(\d+)/)

		// Extract set name
		const nameMatch = content.match(/name:\s*\{[^}]*en:\s*"([^"]+)"/)
		const setName = nameMatch ? nameMatch[1] : path.basename(path.dirname(setFilePath))

		return {
			filePath: setFilePath,
			name: setName,
			tcgplayerGroupId: tcgplayerMatch ? parseInt(tcgplayerMatch[1]) : undefined
		}
	} catch (error) {
		console.error(`Error loading set file ${setFilePath}:`, error)
		return null
	}
}

/**
 * Extract local card number from card file
 */
function getLocalCardNumber(filePath: string): string {
	const filename = path.basename(filePath, '.ts')
	return normalizeCardNumber(filename)
}

/**
 * Update card file with TCGPlayer product IDs
 */
async function updateCardFile(
	cardFilePath: string,
	variants: { [variant: string]: number }
): Promise<boolean> {
	try {
		let content = await fs.readFile(cardFilePath, 'utf-8')

		// Determine if we should use single ID or variants object
		const variantKeys = Object.keys(variants)
		const hasSingleVariant = variantKeys.length === 1
		const hasOnlyNormal = hasSingleVariant && variantKeys[0] === 'normal'

		let newTcgplayerValue: string

		if (hasOnlyNormal) {
			// Single normal variant - use simple number format
			newTcgplayerValue = variants.normal.toString()
		} else {
			// Multiple variants or non-normal variant - use object format
			const variantLines = Object.entries(variants)
				.sort(([a], [b]) => {
					// Sort: normal first, then alphabetically
					if (a === 'normal') return -1
					if (b === 'normal') return 1
					return a.localeCompare(b)
				})
				.map(([variant, productId]) => `\t\t\t${variant}: ${productId}`)
				.join(',\n')

			newTcgplayerValue = `{\n${variantLines}\n\t\t}`
		}

		// Check if thirdParty section exists
		const hasThirdParty = /thirdParty:\s*\{/.test(content)

		if (hasThirdParty) {
			// Check if tcgplayer field exists
			const hasTcgplayer = /tcgplayer:\s*(\d+|{)/.test(content)

			if (hasTcgplayer) {
				// Replace existing tcgplayer value
				// Handle both number and object formats
				content = content.replace(
					/tcgplayer:\s*(\d+|{[^}]*})/s,
					`tcgplayer: ${newTcgplayerValue}`
				)
			} else {
				// Add tcgplayer field to existing thirdParty
				content = content.replace(
					/thirdParty:\s*\{/,
					`thirdParty: {\n\t\ttcgplayer: ${newTcgplayerValue},`
				)
			}
		} else {
			// Add entire thirdParty section before export
			const thirdPartySection = `\n\tthirdParty: {\n\t\ttcgplayer: ${newTcgplayerValue}\n\t}\n`
			content = content.replace(
				/}\n\nexport default card/,
				`${thirdPartySection}}\n\nexport default card`
			)
		}

		await fs.writeFile(cardFilePath, content, 'utf-8')
		return true
	} catch (error) {
		console.error(`Error updating card file ${cardFilePath}:`, error)
		stats.errors++
		return false
	}
}

/**
 * Process a single set
 */
async function processSet(setPath: string): Promise<void> {
	const setFile = path.join(setPath, path.basename(setPath) + '.ts')

	try {
		await fs.access(setFile)
	} catch {
		console.warn(`⚠️  Set file not found: ${setFile}`)
		return
	}

	const setData = await loadSetData(setFile)
	if (!setData || !setData.tcgplayerGroupId) {
		console.log(`⏭️  Skipping ${setData?.name || setPath} (no TCGPlayer groupId)`)
		return
	}

	console.log(`\n📦 Processing: ${setData.name} (groupId: ${setData.tcgplayerGroupId})`)

	// Build product map
	const cardVariants = await buildProductMap(setData.tcgplayerGroupId)
	const variantCount = Object.keys(cardVariants).length

	if (variantCount === 0) {
		console.log(`   ⚠️  No products found`)
		return
	}

	console.log(`   📊 Found ${variantCount} card numbers in products`)

	// Get all card files in set
	const cardFiles = await glob(`${setPath}/[0-9]*.ts`)
	let setCardsUpdated = 0
	let setCardsSkipped = 0

	for (const cardFile of cardFiles) {
		const localNumber = getLocalCardNumber(cardFile)
		const variants = cardVariants[localNumber]

		if (!variants || Object.keys(variants).length === 0) {
			setCardsSkipped++
			continue
		}

		const variantCount = Object.keys(variants).length
		const success = await updateCardFile(cardFile, variants)

		if (success) {
			setCardsUpdated++
			stats.variantsAdded += variantCount

			if (variantCount > 1) {
				stats.cardsWithMultipleVariants++
				const variantList = Object.keys(variants).join(', ')
				console.log(`   ✅ ${path.basename(cardFile, '.ts')}: ${variantCount} variants (${variantList})`)
			}
		}
	}

	console.log(`   ✨ Updated ${setCardsUpdated} cards, skipped ${setCardsSkipped}`)

	stats.setsProcessed++
	stats.cardsUpdated += setCardsUpdated
	stats.cardsSkipped += setCardsSkipped
}

/**
 * Main execution
 */
async function main() {
	const args = process.argv.slice(2)
	const targetSet = args[0]

	console.log('🎴 TCGPlayer Multi-Variant ID Updater\n')

	let setDirs: string[]

	if (targetSet) {
		// Process single set
		setDirs = [targetSet]
		console.log(`🎯 Processing single set: ${targetSet}\n`)
	} else {
		// Process all sets
		console.log('🔍 Finding all sets...\n')
		const allSetFiles = await glob('data/**/*.ts', {
			ignore: ['**/[0-9]*.ts', '**/node_modules/**']
		})

		// Get unique set directories
		const setDirSet = new Set(allSetFiles.map(f => path.dirname(f)))
		setDirs = Array.from(setDirSet).sort()

		console.log(`📚 Found ${setDirs.length} sets\n`)
	}

	// Process each set
	for (const setDir of setDirs) {
		await processSet(setDir)
	}

	// Print summary
	console.log('\n' + '='.repeat(70))
	console.log('📊 SUMMARY')
	console.log('='.repeat(70))
	console.log(`Sets processed:              ${stats.setsProcessed}`)
	console.log(`Cards updated:               ${stats.cardsUpdated}`)
	console.log(`Cards skipped:               ${stats.cardsSkipped}`)
	console.log(`Cards with multiple variants: ${stats.cardsWithMultipleVariants}`)
	console.log(`Total variants added:        ${stats.variantsAdded}`)
	console.log(`Errors:                      ${stats.errors}`)
	console.log('='.repeat(70))

	if (stats.cardsWithMultipleVariants > 0) {
		console.log('\n💡 Note: Cards with multiple variants now use object format:')
		console.log('   thirdParty: {')
		console.log('     tcgplayer: {')
		console.log('       normal: 123456,')
		console.log('       pokeball: 123457,')
		console.log('       masterball: 123458')
		console.log('     }')
		console.log('   }')
	}
}

main().catch(console.error)
