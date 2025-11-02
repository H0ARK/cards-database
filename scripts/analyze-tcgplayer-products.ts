#!/usr/bin/env bun
import fs from 'fs/promises'
import path from 'path'
import { glob } from 'glob'

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

interface Set {
	id: string
	name: any
	thirdParty?: {
		tcgplayer?: number
		cardmarket?: number
	}
}

const stats = {
	totalSets: 0,
	setsWithTCGPlayer: 0,
	setsWithProducts: 0,
	setsMissingProducts: [] as Array<{ name: string, groupId: number }>,

	totalProducts: 0,
	cards: 0,
	sealedProducts: 0,
	other: 0,

	productTypes: new Map<string, number>(),
	cardsWithoutNumber: 0,

	missingGroupIds: [] as number[]
}

/**
 * Determine if a product is a card or sealed product
 */
function categorizeProduct(product: Product): 'card' | 'sealed' | 'other' {
	const name = product.name.toLowerCase()
	const hasCardNumber = product.extendedData.some(d => d.name === 'Number')

	// Sealed product keywords
	const sealedKeywords = [
		'booster box', 'booster pack', 'booster bundle',
		'elite trainer box', 'etb',
		'blister', 'case',
		'collection box', 'bundle',
		'tin', 'premium collection',
		'code card', 'theme deck',
		'battle deck', 'trainer kit',
		'deck', 'prerelease',
		'build & battle', 'starter set'
	]

	const isSealed = sealedKeywords.some(keyword => name.includes(keyword))

	if (hasCardNumber && !isSealed) {
		return 'card'
	} else if (isSealed) {
		return 'sealed'
	}

	return 'other'
}

/**
 * Extract product type for categorization
 */
function getProductType(product: Product): string {
	const name = product.name.toLowerCase()

	if (name.includes('booster box')) return 'Booster Box'
	if (name.includes('booster pack')) return 'Booster Pack'
	if (name.includes('booster bundle')) return 'Booster Bundle'
	if (name.includes('elite trainer box') || name.includes('etb')) return 'Elite Trainer Box'
	if (name.includes('blister')) return 'Blister'
	if (name.includes('case')) return 'Case'
	if (name.includes('collection box') || name.includes('collection')) return 'Collection Box'
	if (name.includes('bundle')) return 'Bundle'
	if (name.includes('tin')) return 'Tin'
	if (name.includes('code card')) return 'Code Card'
	if (name.includes('theme deck')) return 'Theme Deck'
	if (name.includes('battle deck')) return 'Battle Deck'
	if (name.includes('trainer kit')) return 'Trainer Kit'
	if (name.includes('build & battle')) return 'Build & Battle Box'
	if (name.includes('prerelease')) return 'Prerelease Kit'
	if (name.includes('starter')) return 'Starter Set'

	return 'Card'
}

/**
 * Load and parse a set file
 */
async function loadSetData(setFilePath: string): Promise<Set | null> {
	try {
		const content = await fs.readFile(setFilePath, 'utf-8')
		const tcgplayerMatch = content.match(/tcgplayer:\s*(\d+)/)
		if (!tcgplayerMatch) return null

		// Extract set name
		const nameMatch = content.match(/name:\s*\{[^}]*en:\s*"([^"]+)"/)
		const setName = nameMatch ? nameMatch[1] : path.basename(setFilePath, '.ts')

		return {
			id: '',
			name: setName,
			thirdParty: {
				tcgplayer: parseInt(tcgplayerMatch[1])
			}
		}
	} catch (error) {
		return null
	}
}

/**
 * Analyze a single product file
 */
async function analyzeProductFile(productPath: string): Promise<void> {
	try {
		const content = await fs.readFile(productPath, 'utf-8')
		const data: ProductsFile = JSON.parse(content)

		stats.totalProducts += data.results.length

		for (const product of data.results) {
			const category = categorizeProduct(product)
			const type = getProductType(product)

			if (category === 'card') {
				stats.cards++
				const hasNumber = product.extendedData.some(d => d.name === 'Number')
				if (!hasNumber) {
					stats.cardsWithoutNumber++
				}
			} else if (category === 'sealed') {
				stats.sealedProducts++
				stats.productTypes.set(type, (stats.productTypes.get(type) || 0) + 1)
			} else {
				stats.other++
			}
		}
	} catch (error) {
		console.error(`Error analyzing ${productPath}:`, error)
	}
}

/**
 * Main analysis
 */
async function main() {
	console.log('🔍 Analyzing TCGPlayer Products...\n')

	// Find all set files
	const setFiles = await glob('data/**/*.ts', {
		ignore: ['**/[0-9]*.ts', '**/node_modules/**']
	})

	stats.totalSets = setFiles.length

	// Collect all TCGPlayer groupIds from sets
	const groupIdsFromSets = new Set<number>()
	for (const setFile of setFiles) {
		const setData = await loadSetData(setFile)
		if (setData?.thirdParty?.tcgplayer) {
			stats.setsWithTCGPlayer++
			groupIdsFromSets.add(setData.thirdParty.tcgplayer)
		}
	}

	// Check which sets have product files
	for (const setFile of setFiles) {
		const setData = await loadSetData(setFile)
		if (setData?.thirdParty?.tcgplayer) {
			const groupId = setData.thirdParty.tcgplayer
			const productPath = `var/models/tcgplayer/products/${groupId}.json`

			try {
				await fs.access(productPath)
				stats.setsWithProducts++
			} catch {
				stats.setsMissingProducts.push({
					name: setData.name,
					groupId: groupId
				})
				stats.missingGroupIds.push(groupId)
			}
		}
	}

	// Analyze all product files
	const productFiles = await glob('var/models/tcgplayer/products/*.json')

	for (const productFile of productFiles) {
		await analyzeProductFile(productFile)
	}

	// Print report
	console.log('=' .repeat(70))
	console.log('📊 TCGDEX SETS ANALYSIS')
	console.log('='.repeat(70))
	console.log(`Total Sets:              ${stats.totalSets}`)
	console.log(`Sets with TCGPlayer ID:  ${stats.setsWithTCGPlayer}`)
	console.log(`Sets with Product Files: ${stats.setsWithProducts}`)
	console.log(`Sets Missing Products:   ${stats.setsMissingProducts.length}`)
	console.log()

	if (stats.setsMissingProducts.length > 0) {
		console.log('🚨 SETS MISSING PRODUCT FILES:')
		console.log('-'.repeat(70))
		for (const set of stats.setsMissingProducts.slice(0, 20)) {
			console.log(`  ${set.name.padEnd(50)} (groupId: ${set.groupId})`)
		}
		if (stats.setsMissingProducts.length > 20) {
			console.log(`  ... and ${stats.setsMissingProducts.length - 20} more`)
		}
		console.log()
	}

	console.log('='.repeat(70))
	console.log('📦 TCGPLAYER PRODUCTS ANALYSIS')
	console.log('='.repeat(70))
	console.log(`Total Products:          ${stats.totalProducts}`)
	console.log(`  Cards:                 ${stats.cards}`)
	console.log(`  Sealed Products:       ${stats.sealedProducts}`)
	console.log(`  Other:                 ${stats.other}`)
	console.log(`Cards without Number:    ${stats.cardsWithoutNumber}`)
	console.log()

	console.log('📦 SEALED PRODUCT TYPES:')
	console.log('-'.repeat(70))
	const sortedTypes = Array.from(stats.productTypes.entries())
		.sort((a, b) => b[1] - a[1])

	for (const [type, count] of sortedTypes) {
		console.log(`  ${type.padEnd(30)} ${count.toString().padStart(6)}`)
	}
	console.log()

	// Save missing group IDs to file
	if (stats.missingGroupIds.length > 0) {
		await fs.writeFile(
			'var/missing-product-groups.json',
			JSON.stringify(stats.missingGroupIds, null, 2)
		)
		console.log(`💾 Saved ${stats.missingGroupIds.length} missing group IDs to var/missing-product-groups.json`)
		console.log()
	}

	console.log('='.repeat(70))
	console.log('💡 RECOMMENDATIONS:')
	console.log('='.repeat(70))

	if (stats.setsMissingProducts.length > 0) {
		console.log(`1. Download ${stats.setsMissingProducts.length} missing product files`)
		console.log(`   Run: bun run scripts/download-missing-products.ts`)
	}

	if (stats.sealedProducts > 0) {
		console.log(`2. Create sealed products database (${stats.sealedProducts} products)`)
		console.log(`   Create: data/products/ directory structure`)
	}

	console.log(`3. Extract and validate ${stats.cards} card products`)
	console.log(`   Check for missing cards in tcgdex`)
	console.log()
}

main().catch(console.error)
