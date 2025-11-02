import { objectOmit } from '@dzeio/object-util'
import { sets } from '../../../V2/Components/Set'
import TCGPlayer from './TCGPlayer'
import * as fs from 'fs/promises'
import * as path from 'path'

export interface Root {
	success: boolean
	errors: any[]
	results: Result[]
}

export interface Result {
	productId: number
	lowPrice: number
	midPrice: number
	highPrice: number
	marketPrice?: number
	directLowPrice?: number
	subTypeName: string
}

export interface ProductResult {
	productId: number
	name: string
	cleanName: string
	imageUrl: string
	categoryId: number
	groupId: number
	url: string
	modifiedOn: string
	imageCount: number
	presaleInfo: {
		isPresale: boolean
		releasedOn: string | null
		note: string | null
	}
	extendedData: Array<{
		name: string
		displayName: string
		value: string
	}>
}

export interface ProductsRoot {
	success: boolean
	errors: any[]
	results: ProductResult[]
	totalItems: number
}

// Cache structure: cache[cardProductId][variantType] = priceData
let cache: Record<number, Record<string, Result>> = {}

// Product mapping: productMap[setGroupId][cardNumber] = cardProductId
// e.g., productMap[23228]["223"] = 509980
let productMap: Record<number, Record<string, number>> = {}

let lastFetch: Date | undefined = undefined
let lastUpdate: Date | undefined = undefined

// Path to local tcgcsv data
// In Docker, the volume is mounted at /usr/src/tcgcsv
const TCGCSV_BASE_PATH = process.env.TCGCSV_PATH || path.join(process.cwd(), 'tcgcsv')

/**
 * Get the most recent date folder from tcgcsv directory
 */
async function getMostRecentTcgcsvDate(): Promise<string | null> {
	try {
		const entries = await fs.readdir(TCGCSV_BASE_PATH, { withFileTypes: true })
		const dateFolders = entries
			.filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
			.map(entry => entry.name)
			.sort()
			.reverse()

		return dateFolders.length > 0 ? dateFolders[0] : null
	} catch (error) {
		console.error('Error reading tcgcsv directory:', error)
		return null
	}
}

/**
 * Read price data from local tcgcsv file
 * This reads the SET-level price file which contains all cards in that set
 */
async function readLocalPriceData(dateFolder: string, setProductId: number): Promise<Root | null> {
	// TCGPlayer Pokemon category is 3
	const categoryId = 3
	const filePath = path.join(TCGCSV_BASE_PATH, dateFolder, String(categoryId), String(setProductId), 'prices')

	try {
		const fileContent = await fs.readFile(filePath, 'utf-8')
		const data = JSON.parse(fileContent) as Root
		return data
	} catch (error) {
		// File doesn't exist or can't be read - this is normal for sets without price data
		return null
	}
}

/**
 * Fetch products data from tcgcsv API for a given set
 * This maps card numbers to their individual product IDs
 */
async function fetchProductsData(setGroupId: number): Promise<ProductsRoot | null> {
	const categoryId = 3 // Pokemon
	const url = `https://tcgcsv.com/tcgplayer/${categoryId}/${setGroupId}/products`

	try {
		const response = await fetch(url)
		if (response.status >= 400) {
			console.warn(`Couldn't fetch products for set ${setGroupId}: ${response.status}`)
			return null
		}
		const data = await response.json() as ProductsRoot
		return data
	} catch (error) {
		console.error(`Error fetching products for set ${setGroupId}:`, error)
		return null
	}
}

/**
 * Extract card number from product's extendedData
 * Returns the local card number (e.g., "223" from "223/197")
 */
function extractCardNumber(product: ProductResult): string | null {
	const numberData = product.extendedData.find(data => data.name === 'Number')
	if (!numberData) return null

	// Extract the first part before the slash (e.g., "223" from "223/197")
	const match = numberData.value.match(/^(\d+)/)
	return match ? match[1] : null
}

/**
 * Build product mapping for a set
 * Maps card numbers to their TCGPlayer product IDs
 */
async function buildProductMapping(setGroupId: number): Promise<void> {
	const productsData = await fetchProductsData(setGroupId)
	if (!productsData || !productsData.success) {
		return
	}

	const mapping: Record<string, number> = {}
	for (const product of productsData.results) {
		const cardNumber = extractCardNumber(product)
		if (cardNumber) {
			// Store the mapping: cardNumber -> productId
			mapping[cardNumber] = product.productId
		}
	}

	productMap[setGroupId] = mapping
}

export async function updateTCGPlayerDatas(): Promise<boolean> {
	// only fetch at max, once an hour
	if (lastFetch && lastFetch.getTime() > new Date().getTime() - 3600000) {
		return false
	}

	console.log('Loading TCGPlayer data from local tcgcsv files...')

	// Get the most recent date folder
	const dateFolder = await getMostRecentTcgcsvDate()
	if (!dateFolder) {
		console.error('No tcgcsv date folders found')
		return false
	}

	console.log(`Using tcgcsv data from: ${dateFolder}`)
	lastUpdate = new Date(dateFolder)

	// Get all SET group IDs from the sets
	const setGroupIds = sets.en
		.filter((it) => it?.thirdParty?.tcgplayer)
		.map((it) => it!.thirdParty!.tcgplayer)

	let successCount = 0
	let failCount = 0
	let totalCards = 0

	// Step 1: Build product mappings for all sets
	console.log('Fetching product mappings from tcgcsv API...')
	let productMappingCount = 0
	for (const setGroupId of setGroupIds) {
		await buildProductMapping(setGroupId)
		if (productMap[setGroupId]) {
			productMappingCount++
		}
	}
	console.log(`Built product mappings for ${productMappingCount} sets`)

	// Step 2: Load price data for all sets
	console.log('Loading price data from local files...')
	for (const setGroupId of setGroupIds) {
		const data = await readLocalPriceData(dateFolder, setGroupId)

		if (!data || !data.success) {
			failCount++
			continue
		}

		// Each result in the data is a CARD with its own product ID
		// We cache by CARD product ID, not SET group ID
		for (const item of data.results) {
			const cardProductId = item.productId
			const cacheItem = cache[cardProductId] ?? {}

			// Store variants by type (normalized subTypeName)
			const type = item.subTypeName.toLowerCase().replaceAll(' ', '-')
			if (!(type in cacheItem)) {
				cacheItem[type] = objectOmit(item, 'productId', 'subTypeName')
			}

			cache[cardProductId] = cacheItem
			totalCards++
		}
		successCount++
	}

	lastFetch = new Date()

	console.log(`Loaded TCGPlayer data: ${successCount} sets successfully (${totalCards} individual cards cached), ${failCount} sets not found`)

	return true
}

export async function getTCGPlayerPrice(card: {
	localId: string
	set: { id: string }
	thirdParty?: { tcgplayer?: number }
}): Promise<{
	unit: 'USD',
	updated: string
	normal?: Omit<Result, 'productId' | 'subTypeName'>
	reverse?: Omit<Result, 'productId' | 'subTypeName'>
	holo?: Omit<Result, 'productId' | 'subTypeName'>
	foil?: Omit<Result, 'productId' | 'subTypeName'>
	holofoil?: Omit<Result, 'productId' | 'subTypeName'>
	'1st-edition-holofoil'?: Omit<Result, 'productId' | 'subTypeName'>
	'1st-edition-normal'?: Omit<Result, 'productId' | 'subTypeName'>
	'reverse-holofoil'?: Omit<Result, 'productId' | 'subTypeName'>
} | null> {
	if (!lastFetch) {
		return null
	}

	// Get the set's group ID from thirdParty data
	const setGroupId = card.thirdParty?.tcgplayer
	if (typeof setGroupId !== 'number') {
		return null
	}

	// Get the card number (localId)
	const cardNumber = card.localId

	// Look up the card's individual product ID using set group ID + card number
	const setProductMapping = productMap[setGroupId]
	if (!setProductMapping) {
		// No product mapping for this set
		return null
	}

	const cardProductId = setProductMapping[cardNumber]
	if (!cardProductId) {
		// No product ID found for this card number
		return null
	}

	// Now look up the price variants using the card's product ID
	const variants = cache[cardProductId]
	if (!variants) {
		return null
	}

	const res: NonNullable<Awaited<ReturnType<typeof getTCGPlayerPrice>>> = {
		updated: (lastUpdate ?? lastFetch).toISOString(),
		unit: 'USD',
		...variants
	}
	return res
}
