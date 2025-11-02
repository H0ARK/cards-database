import { objectOmit } from '@dzeio/object-util'
import { sets } from '../../../V2/Components/Set'
import TCGPlayer from './TCGPlayer'
import list from './product-skus.mapping.json'

const tcgplayer = new TCGPlayer()

type Result = Awaited<ReturnType<typeof TCGPlayer['prototype']['price']['groupProduct']>>

// Multi-variant support: TCGPlayer config can be number or object
type TCGPlayerConfig = number | Record<string, number>

let cache: Record<number, Record<string, Result['results'][number]>> = {}
let lastFetch: Date | undefined = undefined

/**
 * Helper to extract all product IDs from a TCGPlayer config
 */
function getAllProductIds(config: TCGPlayerConfig | undefined): number[] {
	if (!config) return []
	if (typeof config === 'number') return [config]
	return Object.values(config)
}

/**
 * Helper to get primary product ID (for backward compatibility)
 */
function getPrimaryProductId(config: TCGPlayerConfig | undefined): number | undefined {
	if (!config) return undefined
	if (typeof config === 'number') return config
	// Prefer 'normal' variant, fallback to first available
	return config.normal || Object.values(config)[0]
}
export async function updateTCGPlayerDatas(): Promise<boolean> {


	// only fetch at max, once an hour
	if (lastFetch && lastFetch.getTime() > new Date().getTime() - 3600000) {
		return false
	}

	const products = sets.en
		.filter((it) => it?.thirdParty?.tcgplayer)
		.map((it) => it!.thirdParty!.tcgplayer as TCGPlayerConfig)

	// Collect all unique product IDs (may be multiple per card for variants)
	const uniqueProductIds = new Set<number>()
	for (const config of products) {
		if (!config) continue
		const productIds = getAllProductIds(config)
		productIds.forEach(id => uniqueProductIds.add(id))
	}

	// Fetch prices for all product IDs
	// Group by set to minimize API calls (existing behavior)
	const productsBySet = sets.en
		.filter((it) => it?.thirdParty?.tcgplayer)
		.reduce((acc, set) => {
			const groupId = (set!.thirdParty! as any).tcgplayer
			if (typeof groupId === 'number') {
				acc[groupId] = set
			}
			return acc
		}, {} as Record<number, any>)

	for (const [groupId, setData] of Object.entries(productsBySet)) {
		let data: Awaited<ReturnType<typeof TCGPlayer['prototype']['price']['groupProduct']>>
		try {
			data = await tcgplayer.price.groupProduct(parseInt(groupId))
		} catch {
			continue
		}

		for (const item of data.results) {
			const cacheItem = cache[item.productId] ?? {}

			if (!(item.subTypeName in cacheItem)) {
				const type = item.subTypeName.toLowerCase().replaceAll(' ', '-')
				cacheItem[type] = objectOmit(item, 'productId', 'subTypeName')
			}
			cache[item.productId] = cacheItem
		}
	}

	lastFetch = new Date()

	return true
}

export async function getTCGPlayerPrice(card: { thirdParty: { tcgplayer?: TCGPlayerConfig } }): Promise<{
	unit: 'USD',
	updated: string
	normal?: Omit<Result, 'productId' | 'subTypeName'>
	reverse?: Omit<Result, 'productId' | 'subTypeName'>
	holo?: Omit<Result, 'productId' | 'subTypeName'>
	pokeball?: Omit<Result, 'productId' | 'subTypeName'>
	masterball?: Omit<Result, 'productId' | 'subTypeName'>
	[variant: string]: any
} | null> {
	if (!lastFetch || !card.thirdParty?.tcgplayer) {
		return null
	}

	const config = card.thirdParty.tcgplayer
	const productIds = getAllProductIds(config)

	if (productIds.length === 0) {
		return null
	}

	const res: NonNullable<Awaited<ReturnType<typeof getTCGPlayerPrice>>> = {
		updated: lastFetch.toISOString(),
		unit: 'USD'
	}

	// Handle legacy format (single number) - backward compatibility
	if (typeof config === 'number') {
		const variants = cache[config]
		if (!variants) return null
		return { ...res, ...variants }
	}

	// Handle new object format with multiple variants
	for (const [variantName, productId] of Object.entries(config)) {
		const cachedVariants = cache[productId]
		if (!cachedVariants) continue

		// TCGPlayer returns sub-types (normal, reverse, holo) per product
		// Our variant names are card-level (normal, pokeball, masterball)

		// If the cached data has multiple subtypes, flatten them
		for (const [subType, priceData] of Object.entries(cachedVariants)) {
			// For 'normal' variant, use subType names directly (normal, reverse, holo)
			// For pattern variants, prefix with pattern name (pokeball-normal, masterball-reverse, etc)
			const key = variantName === 'normal' && subType === 'normal'
				? 'normal'
				: variantName === 'normal'
				? subType
				: `${variantName}-${subType}`

			res[key] = priceData
		}
	}

	return Object.keys(res).length > 2 ? res : null // Must have more than just unit/updated
}

export async function listSKUs(card: { thirdParty: { tcgplayer?: TCGPlayerConfig } }): Promise<any> {
	if (!card.thirdParty.tcgplayer) {
		return null
	}

	const primaryId = getPrimaryProductId(card.thirdParty.tcgplayer)
	if (!primaryId) {
		return null
	}

	const skus: Array<{ sku: number }> = (list as any)[primaryId]
	if (!skus) {
		return null
	}

	const res = await tcgplayer.price.listForSKUs(...skus.map((it) => it.sku))
	return res.results.map((it) => ({
		...objectOmit(it, 'skuId'),
		...skus.find((sku) => sku.sku === it.skuId)
	}))
}
