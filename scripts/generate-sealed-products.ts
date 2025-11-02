#!/usr/bin/env bun
/**
 * Generate Sealed Products from TCGPlayer Data
 *
 * This script extracts sealed products (booster boxes, ETBs, tins, etc.)
 * from TCGPlayer product files and creates TypeScript files for them.
 *
 * Usage:
 *   bun run scripts/generate-sealed-products.ts [setPath]
 *   bun run scripts/generate-sealed-products.ts --all
 *   bun run scripts/generate-sealed-products.ts --dry
 */

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

interface SetData {
	filePath: string
	name: string
	tcgplayerGroupId?: number
}

type SealedProductType =
	| 'booster-box'
	| 'booster-pack'
	| 'elite-trainer-box'
	| 'blister'
	| 'collection-box'
	| 'tin'
	| 'bundle'
	| 'build-battle-box'
	| 'theme-deck'
	| 'battle-deck'
	| 'trainer-kit'
	| 'starter-set'
	| 'prerelease-kit'
	| 'case'
	| 'other'

interface SealedProductData {
	id: string
	productId: number
	name: string
	setName: string
	productType: SealedProductType
	packCount?: number
	cardsPerPack?: number
	msrp?: number
	exclusive?: boolean
	exclusiveRetailer?: string
	variants?: string[]
}

const stats = {
	setsProcessed: 0,
	productsCreated: 0,
	productsSkipped: 0,
	errors: 0,
	byType: new Map<string, number>()
}

/**
 * Determine if a product is sealed (not a single card)
 */
function isSealedProduct(product: Product): boolean {
	const name = product.name.toLowerCase()
	const hasCardNumber = product.extendedData.some(d => d.name === 'Number')

	// Sealed product keywords
	const sealedKeywords = [
		'booster box', 'booster pack', 'booster bundle',
		'elite trainer box', 'etb',
		'blister',
		'collection box', 'collection',
		'tin',
		'bundle',
		'build & battle', 'build and battle',
		'theme deck',
		'battle deck',
		'trainer kit',
		'starter set', 'starter deck',
		'prerelease',
		'case'
	]

	const isSealed = sealedKeywords.some(keyword => name.includes(keyword))

	// Must be sealed product AND not have a card number
	return isSealed && !hasCardNumber
}

/**
 * Classify the sealed product type
 */
function classifyProductType(productName: string): SealedProductType {
	const name = productName.toLowerCase()

	if (name.includes('booster box') && name.includes('case')) return 'case'
	if (name.includes('booster box')) return 'booster-box'
	if (name.includes('booster pack') && !name.includes('code card')) return 'booster-pack'
	if (name.includes('booster bundle')) return 'bundle'
	if (name.includes('elite trainer box') || name.includes('etb')) return 'elite-trainer-box'
	if (name.includes('blister')) return 'blister'
	if (name.includes('collection')) return 'collection-box'
	if (name.includes('tin')) return 'tin'
	if (name.includes('bundle')) return 'bundle'
	if (name.includes('build & battle') || name.includes('build and battle')) return 'build-battle-box'
	if (name.includes('theme deck')) return 'theme-deck'
	if (name.includes('battle deck')) return 'battle-deck'
	if (name.includes('trainer kit')) return 'trainer-kit'
	if (name.includes('starter set') || name.includes('starter deck')) return 'starter-set'
	if (name.includes('prerelease')) return 'prerelease-kit'
	if (name.includes('case')) return 'case'

	return 'other'
}

/**
 * Extract pack count from product name
 */
function extractPackCount(productName: string, productType: SealedProductType): number | undefined {
	const name = productName.toLowerCase()

	// Specific patterns
	if (name.includes('3 pack')) return 3
	if (name.includes('single pack')) return 1
	if (name.includes('two pack') || name.includes('2 pack')) return 2
	if (name.includes('4 pack')) return 4
	if (name.includes('6 pack')) return 6

	// Standard counts by type
	switch (productType) {
		case 'booster-box':
			return 36
		case 'elite-trainer-box':
			return 9
		case 'build-battle-box':
			return 4
		case 'booster-pack':
			return 1
		case 'bundle':
			return 6
		default:
			return undefined
	}
}

/**
 * Extract cards per pack
 */
function extractCardsPerPack(productType: SealedProductType): number | undefined {
	switch (productType) {
		case 'booster-pack':
		case 'booster-box':
		case 'elite-trainer-box':
		case 'blister':
		case 'bundle':
			return 10 // Modern packs have 10 cards
		default:
			return undefined
	}
}

/**
 * Detect if product is exclusive
 */
function detectExclusive(productName: string): { exclusive: boolean, retailer?: string } {
	const name = productName.toLowerCase()

	if (name.includes('pokemon center') || name.includes('pokémon center')) {
		return { exclusive: true, retailer: 'Pokemon Center' }
	}
	if (name.includes('gamestop')) {
		return { exclusive: true, retailer: 'GameStop' }
	}
	if (name.includes('target')) {
		return { exclusive: true, retailer: 'Target' }
	}
	if (name.includes('walmart')) {
		return { exclusive: true, retailer: 'Walmart' }
	}

	return { exclusive: false }
}

/**
 * Extract variant information
 */
function extractVariants(productName: string): string[] {
	const variants: string[] = []

	// Extract text in brackets [...]
	const bracketMatches = productName.matchAll(/\[([^\]]+)\]/g)
	for (const match of bracketMatches) {
		variants.push(match[1])
	}

	return variants
}

/**
 * Generate a unique ID for the sealed product
 */
function generateProductId(setName: string, productName: string, productId: number): string {
	// Clean set name
	const cleanSet = setName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')

	// Clean product name
	const cleanProduct = productName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.substring(0, 50) // Limit length

	return `${cleanSet}-${cleanProduct}-${productId}`
}

/**
 * Generate TypeScript file content for a sealed product
 */
function generateProductFile(product: SealedProductData): string {
	const exclusive = product.exclusive ? `\n\texclusive: true,` : ''
	const exclusiveRetailer = product.exclusiveRetailer ? `\n\texclusiveRetailer: "${product.exclusiveRetailer}",` : ''
	const packCount = product.packCount !== undefined ? `\n\tpackCount: ${product.packCount},` : ''
	const cardsPerPack = product.cardsPerPack !== undefined ? `\n\tcardsPerPack: ${product.cardsPerPack},` : ''
	const variants = product.variants && product.variants.length > 0
		? `\n\tvariants: [${product.variants.map(v => `"${v}"`).join(', ')}],`
		: ''

	return `import { SealedProduct } from "../../../interfaces"
import Set from "../${product.setName}"

const product: SealedProduct = {
	id: "${product.id}",

	name: {
		en: "${product.name.replace(/"/g, '\\"')}"
	},

	set: Set,

	productType: "${product.productType}",${packCount}${cardsPerPack}${exclusive}${exclusiveRetailer}${variants}

	thirdParty: {
		tcgplayer: ${product.productId}
	}
}

export default product
`
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
 * Process a single set and generate sealed products
 */
async function processSet(setPath: string, dryRun: boolean): Promise<void> {
	// Set file is at parent level: data/Series/SetName.ts
	// Set directory is: data/Series/SetName/
	const setName = path.basename(setPath)
	const setFile = setPath.endsWith('.ts') ? setPath : `${setPath}.ts`

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

	// Load products
	const productsPath = `var/models/tcgplayer/products/${setData.tcgplayerGroupId}.json`

	try {
		await fs.access(productsPath)
	} catch {
		console.log(`   ⚠️  No products file found`)
		return
	}

	const productsData: ProductsFile = JSON.parse(await fs.readFile(productsPath, 'utf-8'))

	// Filter sealed products
	const sealedProducts = productsData.results.filter(isSealedProduct)

	console.log(`   Found ${sealedProducts.length} sealed products`)

	if (sealedProducts.length === 0) {
		return
	}

	// Create sealed products directory (data/Series/SetName/sealed/)
	const setDir = setPath.endsWith('.ts') ? setPath.replace(/\.ts$/, '') : setPath
	const sealedDir = path.join(setDir, 'sealed')
	if (!dryRun) {
		try {
			await fs.mkdir(sealedDir, { recursive: true })
		} catch (error) {
			console.error(`   ❌ Error creating directory ${sealedDir}:`, error)
			stats.errors++
			return
		}
	}

	let setProductsCreated = 0

	// Generate files for each sealed product
	for (const product of sealedProducts) {
		const productType = classifyProductType(product.name)
		const exclusive = detectExclusive(product.name)
		const variants = extractVariants(product.name)
		const packCount = extractPackCount(product.name, productType)
		const cardsPerPack = extractCardsPerPack(productType)

		const productData: SealedProductData = {
			id: generateProductId(setData.name, product.name, product.productId),
			productId: product.productId,
			name: product.name,
			setName: setData.name,
			productType,
			packCount,
			cardsPerPack,
			exclusive: exclusive.exclusive,
			exclusiveRetailer: exclusive.retailer,
			variants: variants.length > 0 ? variants : undefined
		}

		const fileContent = generateProductFile(productData)
		const fileName = `${product.productId}.ts`
		const filePath = path.join(sealedDir, fileName)

		if (!dryRun) {
			try {
				await fs.writeFile(filePath, fileContent, 'utf-8')
				setProductsCreated++
				stats.productsCreated++
			} catch (error) {
				console.error(`   ❌ Error writing ${fileName}:`, error)
				stats.errors++
			}
		} else {
			setProductsCreated++
			stats.productsCreated++
		}

		// Track stats by type
		stats.byType.set(productType, (stats.byType.get(productType) || 0) + 1)
	}

	console.log(`   ✅ Created ${setProductsCreated} sealed product files`)
	stats.setsProcessed++
}

/**
 * Main execution
 */
async function main() {
	const args = process.argv.slice(2)
	const dryRun = args.includes('--dry')
	const processAll = args.includes('--all')
	const targetSet = args.find(arg => !arg.startsWith('--'))

	console.log('🎁 Sealed Products Generator\n')
	console.log(`Mode: ${dryRun ? 'DRY RUN (no files created)' : 'LIVE (files will be created)'}`)

	let setDirs: string[]

	if (targetSet) {
		// Process single set
		setDirs = [targetSet]
		console.log(`🎯 Processing single set: ${targetSet}\n`)
	} else if (processAll) {
		// Process all sets - find all .ts files that are not card files (numbered)
		console.log('🔍 Finding all sets...\n')
		const allSetFiles = await glob('data/**/*.ts', {
			ignore: ['**/node_modules/**']
		})

		// Filter to only set files (not numbered card files, not in sealed/)
		const setFiles = allSetFiles.filter(f => {
			const basename = path.basename(f)
			const isCardFile = /^[0-9]/.test(basename)
			const isInSealed = f.includes('/sealed/')
			return !isCardFile && !isInSealed
		})

		setDirs = setFiles.sort()

		console.log(`📚 Found ${setDirs.length} sets\n`)
	} else {
		console.log('❌ Please specify a set path or use --all')
		console.log('\nUsage:')
		console.log('  bun run scripts/generate-sealed-products.ts --all')
		console.log('  bun run scripts/generate-sealed-products.ts "data/Scarlet & Violet/Obsidian Flames"')
		console.log('  bun run scripts/generate-sealed-products.ts --all --dry')
		return
	}

	// Process each set
	for (const setDir of setDirs) {
		await processSet(setDir, dryRun)
	}

	// Print summary
	console.log('\n' + '='.repeat(70))
	console.log('📊 SUMMARY')
	console.log('='.repeat(70))
	console.log(`Sets processed:           ${stats.setsProcessed}`)
	console.log(`Sealed products created:  ${stats.productsCreated}`)
	console.log(`Errors:                   ${stats.errors}`)
	console.log()

	if (stats.byType.size > 0) {
		console.log('📦 Products by Type:')
		console.log('-'.repeat(70))
		const sortedTypes = Array.from(stats.byType.entries())
			.sort((a, b) => b[1] - a[1])

		for (const [type, count] of sortedTypes) {
			console.log(`  ${type.padEnd(30)} ${count.toString().padStart(6)}`)
		}
		console.log()
	}

	console.log('='.repeat(70))

	if (dryRun) {
		console.log('\n⚠️  This was a DRY RUN. Run without --dry to create files.')
	} else {
		console.log('\n✅ Done! Sealed product files have been created.')
		console.log('\n💡 Files are located in: data/[Series]/[Set]/sealed/')
	}
}

main().catch(console.error)
