import { objectOmit } from '@dzeio/object-util'
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
const TCGCSV_PRICE_HISTORY_PATH = path.join(TCGCSV_BASE_PATH, 'price-history')

/**
 * Get the most recent date folder from tcgcsv directory
 */
async function getMostRecentTcgcsvDate(): Promise<string | null> {
	try {
		const entries = await fs.readdir(TCGCSV_PRICE_HISTORY_PATH, { withFileTypes: true })
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
	const filePath = path.join(TCGCSV_PRICE_HISTORY_PATH, dateFolder, String(categoryId), String(setProductId), 'prices')

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

	// Note: We no longer pre-load all set pricing data
	// Instead, we load pricing on-demand when a card is requested
	// This is because sets table doesn't have third_party data in the current schema
	console.log('TCGPlayer provider ready - will load pricing on-demand')

	lastFetch = new Date()
	console.log('TCGPlayer pricing provider initialized (on-demand loading mode)')

	return true
}

/**
 * Load pricing for cards from a SET's price file
 * Returns a map of productId -> variants
 */
async function loadPricingForSet(setGroupId: number): Promise<Record<number, Record<string, Result>> | null> {
	if (!lastUpdate) {
		return null;
	}

	const dateFolder = lastUpdate.toISOString().split('T')[0]

	// The structure is: price-history/YYYY-MM-DD/3/SET_GROUP_ID/prices
	const categoryId = 3 // Pokemon
	const filePath = path.join(TCGCSV_PRICE_HISTORY_PATH, dateFolder, String(categoryId), String(setGroupId), 'prices')

	try {
		const fileContent = await fs.readFile(filePath, 'utf-8')
		const data = JSON.parse(fileContent) as Root

		if (!data || !data.success || !data.results || data.results.length === 0) {
			return null
		}

		// Group results by product ID
		const productMap: Record<number, Record<string, Result>> = {}
		for (const item of data.results) {
			const productId = item.productId
			if (!productMap[productId]) {
				productMap[productId] = {}
			}
			const type = item.subTypeName.toLowerCase().replaceAll(' ', '-')
			productMap[productId][type] = objectOmit(item, 'productId', 'subTypeName')
		}

		return productMap
	} catch (error) {
		// File doesn't exist or can't be read
		return null
	}
}

export async function getTCGPlayerPrice(card: {
	localId: string
	set: {
		id: string
		metadata?: {
			third_party?: {
				tcgplayer?: number
			}
		}
	}
	thirdParty?: { tcgplayer?: number | Record<string, number> }
	variants?: {
		normal?: boolean
		reverse?: boolean
		holo?: boolean
		firstEdition?: boolean
		wPromo?: boolean
	}
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

	// Check if thirdParty.tcgplayer is an object with variant product IDs
	// This is the new database structure: { normal: 219333, reverse: 219334, ... }
	if (card.thirdParty?.tcgplayer && typeof card.thirdParty.tcgplayer === 'object') {
		const variantProductIds = card.thirdParty.tcgplayer as Record<string, number>
		const result: NonNullable<Awaited<ReturnType<typeof getTCGPlayerPrice>>> = {
			updated: (lastUpdate ?? lastFetch).toISOString(),
			unit: 'USD',
		}

		// Get the set group ID to load the entire set's pricing file
		const setGroupId = card.set?.metadata?.third_party?.tcgplayer
		if (!setGroupId || typeof setGroupId !== 'number') {
			return null
		}

		// Load all pricing for this set
		const setProductMap = await loadPricingForSet(setGroupId)
		if (!setProductMap) {
			return null
		}

		// Match each variant's product ID to pricing data
		for (const [variantKey, productId] of Object.entries(variantProductIds)) {
			const productPricing = setProductMap[productId]
			if (productPricing) {
				// Get the first variant data (there should only be one per product ID for cards)
				const variantData = Object.values(productPricing)[0]
				if (variantData) {
					const normalizedKey = variantKey.toLowerCase().replaceAll(' ', '-')
					result[normalizedKey as keyof typeof result] = variantData
				}
			}
		}

		// Return null if no pricing data was found
		if (Object.keys(result).length <= 2) { // Only has 'updated' and 'unit'
			return null
		}

		return result
	}

	// FALLBACK: Old structure - single product ID number
	// This is for cards that haven't been migrated to the new variant-based structure
	if (card.thirdParty?.tcgplayer && typeof card.thirdParty.tcgplayer === 'number') {
		const productId = card.thirdParty.tcgplayer as number
		const setGroupId = card.set?.metadata?.third_party?.tcgplayer

		if (!setGroupId || typeof setGroupId !== 'number') {
			return null
		}

		// Load all pricing for this set
		const setProductMap = await loadPricingForSet(setGroupId)
		if (!setProductMap) {
			return null
		}

		// Find pricing for this specific product ID
		const productPricing = setProductMap[productId]
		if (!productPricing) {
			return null
		}

		const result: NonNullable<Awaited<ReturnType<typeof getTCGPlayerPrice>>> = {
			updated: (lastUpdate ?? lastFetch).toISOString(),
			unit: 'USD',
		}

		// Map all variant types from the product pricing to the result
		for (const [variantType, priceData] of Object.entries(productPricing)) {
			const normalizedKey = variantType.toLowerCase().replaceAll(' ', '-')
			result[normalizedKey as keyof typeof result] = priceData
		}

		// Return null if no pricing data was found
		if (Object.keys(result).length <= 2) { // Only has 'updated' and 'unit'
			return null
		}

		return result
	}

	// No valid TCGPlayer data found
	return null
}
