/**
 * Sealed Product Component - PostgreSQL Version
 *
 * This module handles sealed product queries and transformations using PostgreSQL.
 */

import type { SupportedLanguages } from '@tcgdex/sdk'
import { pool } from '../../libs/db'
import { buildSealedProductQuery } from '../../libs/QueryBuilderOptimized'
import type { Query } from '../../libs/QueryEngine/filter'

export interface SealedProduct {
	id: string
	name: string
	productType: string
	packCount?: number
	cardsPerPack?: number
	exclusive?: boolean
	exclusiveRetailer?: string
	image?: string
	thirdParty?: Record<string, number>
	set?: {
		id: string
		name: string
		logo?: string
		symbol?: string
	}
}

export interface SealedProductResume {
	id: string
	name: string
	productType: string
	image?: string
}

/**
 * Transform database row to SealedProduct format
 */
function dbRowToSealedProduct(row: any, lang: SupportedLanguages): SealedProduct {
	return {
		id: row.id,
		name: typeof row.name === 'object' ? (row.name[lang] || row.name.en) : row.name,
		productType: row.product_type,
		packCount: row.pack_count,
		cardsPerPack: row.cards_per_pack,
		exclusive: row.exclusive,
		exclusiveRetailer: row.exclusive_retailer,
		image: row.image,
		thirdParty: row.third_party || {},
		set: row.set_id ? {
			id: row.set_id,
			name: row.set_name ? (typeof row.set_name === 'object' ? (row.set_name[lang] || row.set_name.en) : row.set_name) : row.set_id,
			logo: row.set_logo,
			symbol: row.set_symbol,
		} : undefined,
	}
}

/**
 * Get all sealed products for a language
 */
export async function getAllSealedProducts(lang: SupportedLanguages): Promise<Array<SealedProduct>> {
	try {
		const result = await pool.query(`
			SELECT
				sp.*,
				s.name as set_name,
				s.logo as set_logo,
				s.symbol as set_symbol
			FROM sealed_products sp
			LEFT JOIN sets s ON sp.set_id = s.id
			WHERE sp.game_id = 'pokemon'
			ORDER BY sp.set_id, sp.product_type, sp.id
		`)

		return result.rows.map(row => dbRowToSealedProduct(row, lang))
	} catch (error) {
		console.error('Error loading all sealed products:', error)
		return []
	}
}

/**
 * Find sealed products with filters
 */
export async function findSealedProducts(lang: SupportedLanguages, query: Query = {}): Promise<Array<SealedProduct>> {
	try {
		const qb = buildSealedProductQuery(lang, query as any)

		const baseQuery = `
			SELECT
				sp.*,
				s.name as set_name,
				s.logo as set_logo,
				s.symbol as set_symbol
			FROM sealed_products sp
			LEFT JOIN sets s ON sp.set_id = s.id
			WHERE sp.game_id = 'pokemon'
		`

		const { sql, params } = qb.build(baseQuery)
		const result = await pool.query(sql, params)

		return result.rows.map(row => dbRowToSealedProduct(row, lang))
	} catch (error) {
		console.error('Error finding sealed products:', error)
		return []
	}
}

/**
 * Find one sealed product by ID
 */
export async function findOneSealedProduct(lang: SupportedLanguages, query: Query): Promise<SealedProduct | undefined> {
	const products = await findSealedProducts(lang, query)
	return products.length > 0 ? products[0] : undefined
}

/**
 * Get sealed product by ID
 */
export async function getSealedProductById(lang: SupportedLanguages, id: string): Promise<SealedProduct | null> {
	try {
		const result = await pool.query(`
			SELECT
				sp.*,
				s.name as set_name,
				s.logo as set_logo,
				s.symbol as set_symbol
			FROM sealed_products sp
			LEFT JOIN sets s ON sp.set_id = s.id
			WHERE sp.id = $1
		`, [id])

		if (result.rows.length === 0) {
			return null
		}

		return dbRowToSealedProduct(result.rows[0], lang)
	} catch (error) {
		console.error(`Error loading sealed product ${id}:`, error)
		return null
	}
}

/**
 * Get sealed products by set ID
 */
export async function getSealedProductsBySetId(lang: SupportedLanguages, setId: string): Promise<Array<SealedProduct>> {
	try {
		const result = await pool.query(`
			SELECT
				sp.*,
				s.name as set_name,
				s.logo as set_logo,
				s.symbol as set_symbol
			FROM sealed_products sp
			LEFT JOIN sets s ON sp.set_id = s.id
			WHERE sp.set_id = $1
			ORDER BY sp.product_type, sp.id
		`, [setId])

		return result.rows.map(row => dbRowToSealedProduct(row, lang))
	} catch (error) {
		console.error(`Error loading sealed products for set ${setId}:`, error)
		return []
	}
}

/**
 * Convert sealed product to brief format for listings
 */
export function sealedProductToBrief(product: SealedProduct): SealedProductResume {
	return {
		id: product.id,
		name: product.name,
		productType: product.productType,
		image: product.image,
	}
}
