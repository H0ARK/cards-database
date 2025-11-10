/**
 * Products Endpoints - NEW System
 *
 * These endpoints use the products table with groups (sets), categories (games),
 * and normalized schema. Full image support and integrated pricing.
 *
 * Routes:
 * - GET /v2/products                    - List all products (paginated)
 * - GET /v2/products/:id                - Get single product by ID
 * - GET /v2/products/search             - Search products
 * - GET /v2/products/group/:groupId     - Get all products in a group (set)
 * - GET /v2/products/category/:categoryId - Get products by category
 * - GET /v2/groups                      - List all groups (sets)
 * - GET /v2/groups/:id                  - Get single group
 * - GET /v2/categories                  - List all categories (games)
 * - GET /v2/categories/:id              - Get single category
 */

import express, { type Request, type Response } from 'express'
import { pool } from '../../libs/db'
import { Errors, sendError } from '../../libs/Errors'
import apicache from 'apicache'

const router = express.Router()

// Cache middleware (1 day for production GET requests)
// TEMPORARILY DISABLED - debugging crash
// router.use(
// 	apicache.middleware(
// 		'1 day',
// 		(req: Request, res: Response) =>
// 			res.statusCode < 400 &&
// 			process.env.NODE_ENV === 'production' &&
// 			req.method === 'GET',
// 		{}
// 	)
// )

/**
 * Construct product image URLs
 */
function getProductImageUrls(productId: number) {
	const base = 'https://tcgplayer-cdn.tcgplayer.com/product'
	return {
		image: `${base}/${productId}_400w.jpg`,
		imageSmall: `${base}/${productId}_200w.jpg`,
		imageHigh: `${base}/${productId}_600w.jpg`,
	}
}

/**
 * Transform database row to product response
 */
function formatProduct(row: any) {
	const images = getProductImageUrls(row.id)

	return {
		id: row.id,
		name: row.name,
		cleanName: row.clean_name,
		cardNumber: row.card_number,
		rarity: row.rarity_name || null,
		cardType: row.card_type_name || null,
		hp: row.hp,
		stage: row.stage,
		retreatCost: row.retreat_cost,
		url: row.url,

		// Images - ALWAYS WORKING! ✅
		...images,

		// Category (game)
		category: row.category_id ? {
			id: row.category_id,
			name: row.category_name,
		} : null,

		// Group (set/expansion)
		group: row.group_id ? {
			id: row.group_id,
			name: row.group_name,
			abbreviation: row.group_abbreviation,
			publishedOn: row.group_published_on,
		} : null,

		// Pricing
		pricing: row.market_price || row.low_price ? {
			marketPrice: row.market_price ? row.market_price / 100 : null,
			lowPrice: row.low_price ? row.low_price / 100 : null,
			highPrice: row.high_price ? row.high_price / 100 : null,
			directLowPrice: row.direct_low_price ? row.direct_low_price / 100 : null,
			lastUpdated: row.price_date,
		} : null,

		// Card text/abilities
		cardText: row.card_text,

		// Metadata
		imageCount: row.image_count,
		isPresale: row.is_presale,
		releasedOn: row.released_on,
		modifiedOn: row.modified_on,
	}
}

/**
 * GET /v2/products
 * List products with filters
 */
router.get('/products', async (req: Request, res: Response) => {
	try {
		const {
			categoryId,
			groupId,
			name,
			rarity,
			cardType,
			stage,
			hp,
			minPrice,
			maxPrice,
			limit = '100',
			offset = '0',
			sort = 'id',
			order = 'ASC',
		} = req.query

		const conditions: string[] = []
		const params: any[] = []
		let paramCounter = 1

		// Category filter (game type)
		if (categoryId) {
			conditions.push(`p.category_id = $${paramCounter}`)
			params.push(parseInt(categoryId as string))
			paramCounter++
		}

		// Group filter (set/expansion)
		if (groupId) {
			conditions.push(`p.group_id = $${paramCounter}`)
			params.push(parseInt(groupId as string))
			paramCounter++
		}

		// Name search
		if (name) {
			conditions.push(`(p.name ILIKE $${paramCounter} OR p.clean_name ILIKE $${paramCounter})`)
			params.push(`%${name}%`)
			paramCounter++
		}

		// Rarity filter
		if (rarity) {
			conditions.push(`r.name ILIKE $${paramCounter}`)
			params.push(`%${rarity}%`)
			paramCounter++
		}

		// Card type filter
		if (cardType) {
			conditions.push(`ct.name ILIKE $${paramCounter}`)
			params.push(`%${cardType}%`)
			paramCounter++
		}

		// Stage filter
		if (stage) {
			conditions.push(`p.stage ILIKE $${paramCounter}`)
			params.push(`%${stage}%`)
			paramCounter++
		}

		// HP filter
		if (hp) {
			conditions.push(`p.hp = $${paramCounter}`)
			params.push(parseInt(hp as string))
			paramCounter++
		}

		// Price range filter
		if (minPrice) {
			conditions.push(`cp.market_price >= $${paramCounter}`)
			params.push(parseFloat(minPrice as string) * 100) // Convert to cents
			paramCounter++
		}
		if (maxPrice) {
			conditions.push(`cp.market_price <= $${paramCounter}`)
			params.push(parseFloat(maxPrice as string) * 100)
			paramCounter++
		}

		const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

		// Validate sort and order
		const validSorts = ['id', 'name', 'card_number', 'hp', 'market_price', 'group_id']
		const sortColumn = validSorts.includes(sort as string) ? sort : 'id'
		const sortOrder = order === 'DESC' ? 'DESC' : 'ASC'

		const query = `
			SELECT
				p.*,
				r.name as rarity_name,
				ct.name as card_type_name,
				g.id as group_id,
				g.name as group_name,
				g.abbreviation as group_abbreviation,
				g.published_on as group_published_on,
				c.id as category_id,
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
			ORDER BY ${sortColumn === 'market_price' ? 'cp.market_price' : 'p.' + sortColumn} ${sortOrder}
			LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
		`

		params.push(parseInt(limit as string), parseInt(offset as string))

		const result = await pool.query(query, params)

		// Get total count for pagination
		const countQuery = `
			SELECT COUNT(*) as total
			FROM products p
			LEFT JOIN rarities r ON p.rarity_id = r.id
			LEFT JOIN card_types ct ON p.card_type_id = ct.id
			LEFT JOIN current_prices cp ON p.id = cp.product_id AND cp.variant_id = 1
			${whereClause}
		`
		const countResult = await pool.query(countQuery, params.slice(0, -2))

		res.json({
			results: result.rows.map(formatProduct),
			pagination: {
				total: parseInt(countResult.rows[0].total),
				limit: parseInt(limit as string),
				offset: parseInt(offset as string),
			},
		})
	} catch (error) {
		console.error('Error fetching products:', error)
		sendError(Errors.GENERAL, res, { error })
	}
})

/**
 * GET /v2/products/search
 * Advanced search with full-text capabilities using trigram indexes
 */
router.get('/products/search', async (req: Request, res: Response) => {
	const startTime = Date.now()
	try {
		const { q, categoryId = '3', limit = '50', offset = '0' } = req.query

		if (!q) {
			return sendError(Errors.GENERAL, res, { message: 'Query parameter "q" is required' })
		}

		// Fast search query using trigram indexes - minimal JOINs for speed
		// Note: Pricing excluded for performance - use /products/:id endpoint for full details with pricing
		const query = `
			SELECT
				p.id,
				p.name,
				p.clean_name,
				p.card_number,
				p.url,
				p.image_count,
				p.group_id,
				g.name as group_name,
				g.abbreviation as group_abbreviation
			FROM products p
			LEFT JOIN groups g ON p.group_id = g.id
			WHERE (p.name ILIKE $1 OR p.clean_name ILIKE $1)
				AND p.category_id = $2
			ORDER BY p.name
			LIMIT $3 OFFSET $4
		`

		const searchTerm = q as string
		const params = [
			`%${searchTerm}%`,
			parseInt(categoryId as string),
			parseInt(limit as string),
			parseInt(offset as string),
		]

		const result = await pool.query(query, params)

		// Format results with image URLs
		const results = result.rows.map(row => ({
			id: row.id,
			name: row.name,
			cleanName: row.clean_name,
			cardNumber: row.card_number,
			url: row.url,
			images: getProductImageUrls(row.id, row.image_count),
			group: row.group_id ? {
				id: row.group_id,
				name: row.group_name,
				abbreviation: row.group_abbreviation
			} : null
		}))

		res.json({
			query: searchTerm,
			results,
			count: results.length,
		})
	} catch (error) {
		console.error('Error searching products:', error)
		sendError(Errors.GENERAL, res, { error })
	}
})

/**
 * GET /v2/products/:id
 * Get single product by ID
 */
router.get('/products/:id(\\d+)', async (req: Request, res: Response) => {
	try {
		const productId = parseInt(req.params.id)

		const query = `
			SELECT
				p.*,
				r.name as rarity_name,
				ct.name as card_type_name,
				g.id as group_id,
				g.name as group_name,
				g.abbreviation as group_abbreviation,
				g.published_on as group_published_on,
				c.id as category_id,
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
			WHERE p.id = $1
		`

		const result = await pool.query(query, [productId])

		if (result.rows.length === 0) {
			return sendError(Errors.NOT_FOUND, res, { productId })
		}

		res.json(formatProduct(result.rows[0]))
	} catch (error) {
		console.error('Error fetching product:', error)
		sendError(Errors.GENERAL, res, { error })
	}
})

/**
 * GET /v2/products/:id/history
 * Get price history for a product
 */
router.get('/products/:id(\\d+)/history', async (req: Request, res: Response) => {
	try {
		const productId = parseInt(req.params.id)
		const { days = '30', variant = '1' } = req.query

		const query = `
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
				AND recorded_at >= NOW() - INTERVAL '${parseInt(days as string)} days'
			ORDER BY recorded_at ASC
		`

		const result = await pool.query(query, [productId, parseInt(variant as string)])

		const history = result.rows.map(row => ({
			date: row.recorded_at,
			low: row.low_price_usd ? parseFloat(row.low_price_usd) : row.low_price ? row.low_price / 100 : null,
			mid: row.mid_price_usd ? parseFloat(row.mid_price_usd) : row.mid_price ? row.mid_price / 100 : null,
			high: row.high_price_usd ? parseFloat(row.high_price_usd) : row.high_price ? row.high_price / 100 : null,
			market: row.market_price_usd ? parseFloat(row.market_price_usd) : row.market_price ? row.market_price / 100 : null,
		}))

		res.json({
			productId,
			variant: parseInt(variant as string),
			days: parseInt(days as string),
			dataPoints: history.length,
			history,
		})
	} catch (error) {
		console.error('Error fetching price history:', error)
		sendError(Errors.GENERAL, res, { error })
	}
})

/**
 * GET /v2/products/group/:groupId
 * Get all products in a group (set)
 */
router.get('/products/group/:groupId(\\d+)', async (req: Request, res: Response) => {
	try {
		const groupId = parseInt(req.params.groupId)
		const { limit = '500', offset = '0' } = req.query

		const query = `
			SELECT
				p.*,
				r.name as rarity_name,
				ct.name as card_type_name,
				g.id as group_id,
				g.name as group_name,
				g.abbreviation as group_abbreviation,
				g.published_on as group_published_on,
				c.id as category_id,
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
			ORDER BY p.card_number, p.name
			LIMIT $2 OFFSET $3
		`

		const result = await pool.query(query, [
			groupId,
			parseInt(limit as string),
			parseInt(offset as string),
		])

		// Get group info
		const groupQuery = await pool.query('SELECT * FROM groups WHERE id = $1', [groupId])

		if (groupQuery.rows.length === 0) {
			return sendError(Errors.NOT_FOUND, res, { groupId })
		}

		res.json({
			group: {
				id: groupQuery.rows[0].id,
				name: groupQuery.rows[0].name,
				abbreviation: groupQuery.rows[0].abbreviation,
				categoryId: groupQuery.rows[0].category_id,
				publishedOn: groupQuery.rows[0].published_on,
			},
			products: result.rows.map(formatProduct),
			count: result.rows.length,
		})
	} catch (error) {
		console.error('Error fetching group products:', error)
		sendError(Errors.GENERAL, res, { error })
	}
})

/**
 * GET /v2/products/category/:categoryId
 * Get products by category (game)
 */
router.get('/products/category/:categoryId(\\d+)', async (req: Request, res: Response) => {
	try {
		const categoryId = parseInt(req.params.categoryId)
		const { limit = '100', offset = '0' } = req.query

		const query = `
			SELECT
				p.*,
				r.name as rarity_name,
				ct.name as card_type_name,
				g.id as group_id,
				g.name as group_name,
				g.abbreviation as group_abbreviation,
				g.published_on as group_published_on,
				c.id as category_id,
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
		`

		const result = await pool.query(query, [
			categoryId,
			parseInt(limit as string),
			parseInt(offset as string),
		])

		res.json({
			categoryId,
			products: result.rows.map(formatProduct),
			count: result.rows.length,
		})
	} catch (error) {
		console.error('Error fetching category products:', error)
		sendError(Errors.GENERAL, res, { error })
	}
})

/**
 * GET /v2/groups
 * List all groups (sets)
 */
router.get('/groups', async (req: Request, res: Response) => {
	try {
		const { categoryId, limit = '1000', offset = '0' } = req.query

		let query = `
			SELECT
				g.*,
				c.name as category_name,
				COUNT(p.id) as product_count
			FROM groups g
			LEFT JOIN categories c ON g.category_id = c.id
			LEFT JOIN products p ON p.group_id = g.id
		`

		const params: any[] = []
		if (categoryId) {
			query += ' WHERE g.category_id = $1'
			params.push(parseInt(categoryId as string))
		}

		query += `
			GROUP BY g.id, c.name
			ORDER BY g.published_on DESC, g.name
			LIMIT $${params.length + 1} OFFSET $${params.length + 2}
		`

		params.push(parseInt(limit as string), parseInt(offset as string))

		const result = await pool.query(query, params)

		res.json({
			groups: result.rows.map(row => ({
				id: row.id,
				name: row.name,
				abbreviation: row.abbreviation,
				categoryId: row.category_id,
				categoryName: row.category_name,
				isSupplemental: row.is_supplemental,
				publishedOn: row.published_on,
				productCount: parseInt(row.product_count),
			})),
		})
	} catch (error) {
		console.error('Error fetching groups:', error)
		sendError(Errors.GENERAL, res, { error })
	}
})

/**
 * GET /v2/groups/:id
 * Get single group (set) info
 */
router.get('/groups/:id(\\d+)', async (req: Request, res: Response) => {
	try {
		const groupId = parseInt(req.params.id)

		const query = `
			SELECT
				g.*,
				c.name as category_name,
				COUNT(p.id) as product_count
			FROM groups g
			LEFT JOIN categories c ON g.category_id = c.id
			LEFT JOIN products p ON p.group_id = g.id
			WHERE g.id = $1
			GROUP BY g.id, c.name
		`

		const result = await pool.query(query, [groupId])

		if (result.rows.length === 0) {
			return sendError(Errors.NOT_FOUND, res, { groupId })
		}

		const row = result.rows[0]
		res.json({
			id: row.id,
			name: row.name,
			abbreviation: row.abbreviation,
			categoryId: row.category_id,
			categoryName: row.category_name,
			isSupplemental: row.is_supplemental,
			publishedOn: row.published_on,
			modifiedOn: row.modified_on,
			productCount: parseInt(row.product_count),
		})
	} catch (error) {
		console.error('Error fetching group:', error)
		sendError(Errors.GENERAL, res, { error })
	}
})

/**
 * GET /v2/categories
 * List all categories (games)
 */
router.get('/categories', async (req: Request, res: Response) => {
	try {
		const query = `
			SELECT
				c.*,
				COUNT(p.id) as product_count
			FROM categories c
			LEFT JOIN products p ON p.category_id = c.id
			GROUP BY c.id
			ORDER BY c.popularity DESC, c.name
		`

		const result = await pool.query(query)

		res.json({
			categories: result.rows.map(row => ({
				id: row.id,
				name: row.name,
				displayName: row.display_name,
				popularity: row.popularity,
				productCount: parseInt(row.product_count),
			})),
		})
	} catch (error) {
		console.error('Error fetching categories:', error)
		sendError(Errors.GENERAL, res, { error })
	}
})

/**
 * GET /v2/categories/:id
 * Get single category (game) info
 */
router.get('/categories/:id(\\d+)', async (req: Request, res: Response) => {
	try {
		const categoryId = parseInt(req.params.id)

		const query = `
			SELECT
				c.*,
				COUNT(p.id) as product_count,
				COUNT(DISTINCT p.group_id) as group_count
			FROM categories c
			LEFT JOIN products p ON p.category_id = c.id
			WHERE c.id = $1
			GROUP BY c.id
		`

		const result = await pool.query(query, [categoryId])

		if (result.rows.length === 0) {
			return sendError(Errors.NOT_FOUND, res, { categoryId })
		}

		const row = result.rows[0]
		res.json({
			id: row.id,
			name: row.name,
			displayName: row.display_name,
			popularity: row.popularity,
			isScannable: row.is_scannable,
			isDirect: row.is_direct,
			productCount: parseInt(row.product_count),
			groupCount: parseInt(row.group_count),
		})
	} catch (error) {
		console.error('Error fetching category:', error)
		sendError(Errors.GENERAL, res, { error })
	}
})

/**
 * GET /v2/status/data
 * Get data freshness information - when was data last updated
 */
router.get('/status/data', async (req: Request, res: Response) => {
	try {
		// Get latest product modification date
		const productQuery = `
			SELECT MAX(modified_on) as latest_product
			FROM products
		`
		const productResult = await pool.query(productQuery)

		// Get latest price date
		const priceQuery = `
			SELECT MAX(recorded_at) as latest_price
			FROM price_history
		`
		const priceResult = await pool.query(priceQuery)

		// Count totals
		const statsQuery = `
			SELECT
				(SELECT COUNT(*) FROM products) as total_products,
				(SELECT COUNT(*) FROM products WHERE category_id = 3) as pokemon_products,
				(SELECT COUNT(DISTINCT recorded_at) FROM price_history) as price_dates,
				(SELECT COUNT(*) FROM price_history WHERE recorded_at >= CURRENT_DATE - INTERVAL '7 days') as recent_prices
		`
		const statsResult = await pool.query(statsQuery)

		res.json({
			status: 'ok',
			lastUpdated: {
				products: productResult.rows[0].latest_product,
				prices: priceResult.rows[0].latest_price
			},
			stats: {
				totalProducts: parseInt(statsResult.rows[0].total_products),
				pokemonProducts: parseInt(statsResult.rows[0].pokemon_products),
				priceHistoryDates: parseInt(statsResult.rows[0].price_dates),
				recentPrices: parseInt(statsResult.rows[0].recent_prices)
			},
			dataSource: 'tcgcsv.com (TCGPlayer)',
			updateFrequency: 'Daily at 2:00 AM UTC'
		})
	} catch (error) {
		console.error('Error fetching data status:', error)
		sendError(Errors.GENERAL, res, { error })
	}
})

/**
 * GET /v2/products/pricing/batch
 * Get current pricing for multiple product IDs (efficient batch lookup)
 * @param ids - Comma-separated product IDs
 * @param variant - Variant ID (default: 1)
 * @param date - Date filter: 'latest' (default), 'yesterday', or specific date (YYYY-MM-DD)
 */
router.get('/products/pricing/batch', async (req: Request, res: Response) => {
	try {
		const { ids, variant = '1', date = 'latest' } = req.query

		if (!ids) {
			return sendError(Errors.GENERAL, res, { message: 'Query parameter "ids" is required (comma-separated product IDs)' })
		}

		// Parse comma-separated IDs
		const productIds = (ids as string).split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))

		if (productIds.length === 0) {
			return sendError(Errors.GENERAL, res, { message: 'No valid product IDs provided' })
		}

		if (productIds.length > 100) {
			return sendError(Errors.GENERAL, res, { message: 'Maximum 100 product IDs allowed per request' })
		}

		// Parse date parameter
		let targetDate: Date | null = null
		const dateParam = date as string

		if (dateParam !== 'latest') {
			if (dateParam === 'yesterday') {
				targetDate = new Date()
				targetDate.setDate(targetDate.getDate() - 1)
				targetDate.setHours(0, 0, 0, 0)
			} else {
				// Try to parse as YYYY-MM-DD format
				const parsedDate = new Date(dateParam)
				if (isNaN(parsedDate.getTime())) {
					return sendError(Errors.GENERAL, res, {
						message: 'Invalid date format. Use "latest", "yesterday", or YYYY-MM-DD format'
					})
				}
				targetDate = parsedDate
				targetDate.setHours(0, 0, 0, 0)
			}
		}

		// Build query based on date parameter
		let query: string
		let queryParams: any[]

		if (targetDate) {
			// Get pricing for specific date (closest record on or before target date)
			const endOfDay = new Date(targetDate)
			endOfDay.setHours(23, 59, 59, 999)

			query = `
				SELECT DISTINCT ON (product_id)
					product_id,
					recorded_at,
					low_price,
					mid_price,
					high_price,
					market_price,
					direct_low_price
				FROM price_history
				WHERE product_id = ANY($1)
					AND variant_id = $2
					AND recorded_at <= $3
				ORDER BY product_id, recorded_at DESC
			`
			queryParams = [productIds, parseInt(variant as string), endOfDay]
		} else {
			// Get latest pricing for each product
			query = `
				SELECT DISTINCT ON (product_id)
					product_id,
					recorded_at,
					low_price,
					mid_price,
					high_price,
					market_price,
					direct_low_price
				FROM price_history
				WHERE product_id = ANY($1)
					AND variant_id = $2
				ORDER BY product_id, recorded_at DESC
			`
			queryParams = [productIds, parseInt(variant as string)]
		}

		const result = await pool.query(query, queryParams)

		// Format as a map for easy lookup
		const pricing: Record<number, any> = {}
		result.rows.forEach(row => {
			pricing[row.product_id] = {
				productId: row.product_id,
				marketPrice: row.market_price ? parseFloat((row.market_price / 100).toFixed(2)) : null,
				lowPrice: row.low_price ? parseFloat((row.low_price / 100).toFixed(2)) : null,
				midPrice: row.mid_price ? parseFloat((row.mid_price / 100).toFixed(2)) : null,
				highPrice: row.high_price ? parseFloat((row.high_price / 100).toFixed(2)) : null,
				directLowPrice: row.direct_low_price ? parseFloat((row.direct_low_price / 100).toFixed(2)) : null,
				lastUpdated: row.recorded_at
			}
		})

		res.json({
			variant: parseInt(variant as string),
			date: dateParam,
			targetDate: targetDate ? targetDate.toISOString().split('T')[0] : null,
			count: result.rows.length,
			pricing
		})
	} catch (error) {
		console.error('Error fetching batch pricing:', error)
		sendError(Errors.GENERAL, res, { error })
	}
})

export default router
