/**
 * Product Component - PostgreSQL Version
 *
 * This module handles product queries using the NEW TCGPlayer-based products table.
 * Replaces the old TCGdex cards table with properly normalized schema and working images.
 */

import Cache from '@cachex/memory'
import { pool } from '../../libs/db'
import type { Query } from '../../libs/QueryEngine/filter'

const cache = new Cache()

/**
 * Product interface matching the products table schema
 */
export interface Product {
	id: number
	categoryId: number
	groupId: number
	name: string
	cleanName: string
	cardNumber: string | null
	rarity: string | null
	cardType: string | null
	hp: number | null
	stage: string | null
	retreatCost: number | null
	imageCount: number
	isPresale: boolean
	releasedOn: Date | null
	url: string
	modifiedOn: Date
	cardText: any
	isSynthetic: boolean

	// Constructed fields
	image: string
	imageSmall: string
	imageHigh: string

	// Enriched fields
	group?: {
		id: number
		name: string
		abbreviation: string | null
		publishedOn: Date | null
	}
	category?: {
		id: number
		name: string
	}
	pricing?: {
		marketPrice: number | null
		lowPrice: number | null
		highPrice: number | null
		directLowPrice: number | null
		lastUpdated: Date | null
	}
}

/**
 * Product resume/brief for listings
 */
export interface ProductResume {
	id: number
	name: string
	image: string
	cardNumber: string | null
	rarity: string | null
	price: number | null
	set: string | null
}

/**
 * Construct TCGPlayer CDN image URL
 * Pattern: https://tcgplayer-cdn.tcgplayer.com/product/{id}_{size}.jpg
 */
export function constructProductImageURL(productId: number, size: '200w' | '400w' | '600w' = '400w'): string {
	return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_${size}.jpg`
}

/**
 * Transform database row to Product format
 */
function dbRowToProduct(row: any): Product {
	return {
		id: row.id,
		categoryId: row.category_id,
		groupId: row.group_id,
		name: row.name,
		cleanName: row.clean_name,
		cardNumber: row.card_number,
		rarity: row.rarity_name || null,
		cardType: row.card_type_name || null,
		hp: row.hp,
		stage: row.stage,
		retreatCost: row.retreat_cost,
		imageCount: row.image_count,
		isPresale: row.is_presale,
		releasedOn: row.released_on,
		url: row.url,
		modifiedOn: row.modified_on,
		cardText: row.card_text,
		isSynthetic: row.is_synthetic,

		// Construct image URLs
		image: constructProductImageURL(row.id, '400w'),
		imageSmall: constructProductImageURL(row.id, '200w'),
		imageHigh: constructProductImageURL(row.id, '600w'),

		// Group (set) information
		group: row.group_id ? {
			id: row.group_id,
			name: row.group_name || '',
			abbreviation: row.group_abbreviation,
			publishedOn: row.group_published_on,
		} : undefined,

		// Category information
		category: row.category_id ? {
			id: row.category_id,
			name: row.category_name || '',
		} : undefined,

		// Pricing information from current_prices
		pricing: row.market_price !== null || row.low_price !== null ? {
			marketPrice: row.market_price,
			lowPrice: row.low_price,
			highPrice: row.high_price,
			directLowPrice: row.direct_low_price,
			lastUpdated: row.price_date,
		} : undefined,
	}
}

/**
 * Load a single product by ID with caching
 */
export async function loadProduct(id: number, includePricing: boolean = true): Promise<Product | null> {
	const key = `product_${id}_${includePricing}`
	const cached = cache.get<Product>(key)

	if (cached) {
		return cached
	}

	try {
		const query = `
			SELECT
				p.*,
				r.name as rarity_name,
				ct.name as card_type_name,
				g.name as group_name,
				g.abbreviation as group_abbreviation,
				g.published_on as group_published_on,
				c.name as category_name
				${includePricing ? `,
				cp.market_price,
				cp.low_price,
				cp.high_price,
				cp.direct_low_price,
				cp.recorded_at as price_date` : ''}
			FROM products p
			LEFT JOIN rarities r ON p.rarity_id = r.id
			LEFT JOIN card_types ct ON p.card_type_id = ct.id
			LEFT JOIN groups g ON p.group_id = g.id
			LEFT JOIN categories c ON p.category_id = c.id
			${includePricing ? 'LEFT JOIN current_prices cp ON p.id = cp.product_id AND cp.variant_id = 1' : ''}
			WHERE p.id = $1
		`

		const result = await pool.query(query, [id])

		if (result.rows.length === 0) {
			return null
		}

		const product = dbRowToProduct(result.rows[0])

		// Cache for 1 hour
		cache.set(key, product, 60 * 60)

		return product
	} catch (error) {
		console.error(`Error loading product ${id}:`, error)
		return null
	}
}

/**
 * Get all products for a category (e.g., Pokemon = 3)
 */
export async function getAllProducts(categoryId: number, limit: number = 1000, offset: number = 0): Promise<Product[]> {
	try {
		const result = await pool.query(`
			SELECT
				p.*,
				r.name as rarity_name,
				ct.name as card_type_name,
				g.name as group_name,
				g.abbreviation as group_abbreviation,
				g.published_on as group_published_on,
				c.name as category_name,
				cp.market_price,
				cp.low_price,
				cp.high_price,
				cp.direct_low_price,
				cp.recorded_at as price_date
			FROM products p
			LEFT JOIN rarities r ON p.rarity_id = r.id
			LEFT JOIN card_types ct ON p.card_type_id = ct.id
			LEFT JOIN groups g ON p.group_id = g.id
			LEFT JOIN categories c ON p.category_id = c.id
			LEFT JOIN current_prices cp ON p.id = cp.product_id AND cp.variant_id = 1
			WHERE p.category_id = $1
			ORDER BY p.group_id, p.card_number
			LIMIT $2 OFFSET $3
		`, [categoryId, limit, offset])

		return result.rows.map(dbRowToProduct)
	} catch (error) {
		console.error(`Error loading products for category ${categoryId}:`, error)
		return []
	}
}

/**
 * Get products by group (set) ID
 */
export async function getProductsByGroup(groupId: number, limit: number = 1000): Promise<Product[]> {
	try {
		const result = await pool.query(`
			SELECT
				p.*,
				r.name as rarity_name,
				ct.name as card_type_name,
				g.name as group_name,
				g.abbreviation as group_abbreviation,
				g.published_on as group_published_on,
				c.name as category_name,
				cp.market_price,
				cp.low_price,
				cp.high_price,
				cp.direct_low_price,
				cp.recorded_at as price_date
			FROM products p
			LEFT JOIN rarities r ON p.rarity_id = r.id
			LEFT JOIN card_types ct ON p.card_type_id = ct.id
			LEFT JOIN groups g ON p.group_id = g.id
			LEFT JOIN categories c ON p.category_id = c.id
			LEFT JOIN current_prices cp ON p.id = cp.product_id AND cp.variant_id = 1
			WHERE p.group_id = $1
			ORDER BY p.card_number
			LIMIT $2
		`, [groupId, limit])

		return result.rows.map(dbRowToProduct)
	} catch (error) {
		console.error(`Error loading products for group ${groupId}:`, error)
		return []
	}
}

/**
 * Search products by name
 */
export async function searchProducts(
	searchTerm: string,
	categoryId?: number,
	limit: number = 50,
	offset: number = 0
): Promise<Product[]> {
	try {
		let query = `
			SELECT
				p.*,
				r.name as rarity_name,
				ct.name as card_type_name,
				g.name as group_name,
				g.abbreviation as group_abbreviation,
				g.published_on as group_published_on,
				c.name as category_name,
				cp.market_price,
				cp.low_price,
				cp.high_price,
				cp.direct_low_price,
				cp.recorded_at as price_date
			FROM products p
			LEFT JOIN rarities r ON p.rarity_id = r.id
			LEFT JOIN card_types ct ON p.card_type_id = ct.id
			LEFT JOIN groups g ON p.group_id = g.id
			LEFT JOIN categories c ON p.category_id = c.id
			LEFT JOIN current_prices cp ON p.id = cp.product_id AND cp.variant_id = 1
			WHERE (p.name ILIKE $1 OR p.clean_name ILIKE $1)
		`

		const params: any[] = [`%${searchTerm}%`]

		if (categoryId !== undefined) {
			query += ` AND p.category_id = $${params.length + 1}`
			params.push(categoryId)
		}

		query += ` ORDER BY
			CASE
				WHEN p.name ILIKE $1 THEN 1
				WHEN p.clean_name ILIKE $1 THEN 2
				ELSE 3
			END,
			p.name
			LIMIT $${params.length + 1} OFFSET $${params.length + 2}
		`

		params.push(limit, offset)

		const result = await pool.query(query, params)

		return result.rows.map(dbRowToProduct)
	} catch (error) {
		console.error(`Error searching products for "${searchTerm}":`, error)
		return []
	}
}

/**
 * Find products with filters
 */
export async function findProducts(filters: {
	categoryId?: number
	groupId?: number
	rarity?: string
	cardType?: string
	stage?: string
	hp?: number
	name?: string
	limit?: number
	offset?: number
}): Promise<Product[]> {
	try {
		const conditions: string[] = []
		const params: any[] = []
		let paramCounter = 1

		if (filters.categoryId !== undefined) {
			conditions.push(`p.category_id = $${paramCounter}`)
			params.push(filters.categoryId)
			paramCounter++
		}

		if (filters.groupId !== undefined) {
			conditions.push(`p.group_id = $${paramCounter}`)
			params.push(filters.groupId)
			paramCounter++
		}

		if (filters.rarity !== undefined) {
			conditions.push(`r.name ILIKE $${paramCounter}`)
			params.push(`%${filters.rarity}%`)
			paramCounter++
		}

		if (filters.cardType !== undefined) {
			conditions.push(`ct.name ILIKE $${paramCounter}`)
			params.push(`%${filters.cardType}%`)
			paramCounter++
		}

		if (filters.stage !== undefined) {
			conditions.push(`p.stage ILIKE $${paramCounter}`)
			params.push(`%${filters.stage}%`)
			paramCounter++
		}

		if (filters.hp !== undefined) {
			conditions.push(`p.hp = $${paramCounter}`)
			params.push(filters.hp)
			paramCounter++
		}

		if (filters.name !== undefined) {
			conditions.push(`(p.name ILIKE $${paramCounter} OR p.clean_name ILIKE $${paramCounter})`)
			params.push(`%${filters.name}%`)
			paramCounter++
		}

		const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

		const limit = filters.limit || 100
		const offset = filters.offset || 0

		const query = `
			SELECT
				p.*,
				r.name as rarity_name,
				ct.name as card_type_name,
				g.name as group_name,
				g.abbreviation as group_abbreviation,
				g.published_on as group_published_on,
				c.name as category_name,
				cp.market_price,
				cp.low_price,
				cp.high_price,
				cp.direct_low_price,
				cp.recorded_at as price_date
			FROM products p
			LEFT JOIN rarities r ON p.rarity_id = r.id
			LEFT JOIN card_types ct ON p.card_type_id = ct.id
			LEFT JOIN groups g ON p.group_id = g.id
			LEFT JOIN categories c ON p.category_id = c.id
			LEFT JOIN current_prices cp ON p.id = cp.product_id AND cp.variant_id = 1
			${whereClause}
			ORDER BY p.group_id, p.card_number
			LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
		`

		params.push(limit, offset)

		const result = await pool.query(query, params)

		return result.rows.map(dbRowToProduct)
	} catch (error) {
		console.error(`Error finding products:`, error)
		return []
	}
}

/**
 * Convert product to brief format for listings
 */
export function toBrief(product: Product): ProductResume {
	return {
		id: product.id,
		name: product.name,
		image: product.image,
		cardNumber: product.cardNumber,
		rarity: product.rarity,
		price: product.pricing?.marketPrice || null,
		set: product.group?.name || null,
	}
}

/**
 * Get product count for a category
 */
export async function getProductCount(categoryId?: number): Promise<number> {
	try {
		const query = categoryId !== undefined
			? 'SELECT COUNT(*) FROM products WHERE category_id = $1'
			: 'SELECT COUNT(*) FROM products'

		const params = categoryId !== undefined ? [categoryId] : []
		const result = await pool.query(query, params)

		return parseInt(result.rows[0].count, 10)
	} catch (error) {
		console.error('Error getting product count:', error)
		return 0
	}
}

/**
 * Get price history for a product
 */
export async function getProductPriceHistory(
	productId: number,
	variantId: number = 1,
	days: number = 30
): Promise<any[]> {
	try {
		const result = await pool.query(`
			SELECT
				recorded_at,
				low_price,
				mid_price,
				high_price,
				market_price,
				direct_low_price,
				low_price_usd,
				mid_price_usd,
				high_price_usd,
				market_price_usd
			FROM price_history
			WHERE product_id = $1
				AND variant_id = $2
				AND recorded_at >= NOW() - INTERVAL '${days} days'
			ORDER BY recorded_at ASC
		`, [productId, variantId])

		return result.rows.map(row => ({
			date: row.recorded_at,
			low: row.low_price_usd ? parseFloat(row.low_price_usd) : row.low_price ? row.low_price / 100 : null,
			mid: row.mid_price_usd ? parseFloat(row.mid_price_usd) : row.mid_price ? row.mid_price / 100 : null,
			high: row.high_price_usd ? parseFloat(row.high_price_usd) : row.high_price ? row.high_price / 100 : null,
			market: row.market_price_usd ? parseFloat(row.market_price_usd) : row.market_price ? row.market_price / 100 : null,
		}))
	} catch (error) {
		console.error(`Error loading price history for product ${productId}:`, error)
		return []
	}
}
