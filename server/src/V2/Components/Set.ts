/**
 * Set Component - PostgreSQL Version
 *
 * This module handles set queries and transformations using PostgreSQL
 * instead of in-memory JSON files.
 */

import type { Set as SDKSet, SetResume, SupportedLanguages } from '@tcgdex/sdk'
import { pool } from '../../libs/db'
import { buildSetQuery } from '../../libs/QueryBuilderOptimized'
import type { Query } from '../../libs/QueryEngine/filter'

export type Set = SDKSet & {
	sealedProducts?: Array<SealedProduct>
}

export interface SealedProduct {
	id: string
	name: string | Record<string, string>
	productType: string
	packCount?: number
	cardsPerPack?: number
	exclusive?: boolean
	exclusiveRetailer?: string
	image?: string
	thirdParty?: Record<string, number>
}

/**
 * Backward compatibility export for TCGPlayer providers
 * (Empty object - providers should be updated to use database queries)
 */
export const sets = {} as const

/**
 * Transform database row to SDK Set format
 */
function dbRowToSet(row: any, lang: SupportedLanguages, includeSealedProducts: boolean = false): Set {
	const set: Set = {
		id: row.id,
		name: row.name[lang] || row.name.en,
		logo: row.logo,
		symbol: row.symbol,
		cardCount: row.card_count || {},
		releaseDate: row.release_date,
		legal: row.legal || {},

		serie: {
			id: row.series_id,
			name: row.series_name ? row.series_name[lang] || row.series_name.en : '',
			logo: row.series_logo,
		},

		tcgOnline: row.metadata?.tcgOnline,
	}

	// Include sealed products if requested and available
	if (includeSealedProducts && row.sealed_products) {
		set.sealedProducts = row.sealed_products.map((sp: any) => ({
			id: sp.id,
			name: typeof sp.name === 'object' ? (sp.name[lang] || sp.name.en) : sp.name,
			productType: sp.product_type,
			packCount: sp.pack_count,
			cardsPerPack: sp.cards_per_pack,
			exclusive: sp.exclusive,
			exclusiveRetailer: sp.exclusive_retailer,
			image: sp.image,
			thirdParty: sp.third_party,
		}))
	}

	return set
}

/**
 * Get all sets for a language
 */
export async function getAllSets(lang: SupportedLanguages): Promise<Array<SDKSet>> {
	try {
		const result = await pool.query(`
			SELECT
				s.*,
				sr.name as series_name,
				sr.logo as series_logo
			FROM sets s
			LEFT JOIN series sr ON s.series_id = sr.id
			WHERE s.game_id = 'pokemon'
			ORDER BY s.release_date DESC, s.id
		`)

		return result.rows.map(row => dbRowToSet(row, lang))
	} catch (error) {
		console.error('Error loading all sets:', error)
		return []
	}
}

/**
 * Find sets with filters
 */
export async function findSets(lang: SupportedLanguages, query: Query<SDKSet> = {}): Promise<Array<SDKSet>> {
	try {
		const qb = buildSetQuery(lang, query as any)

		const baseQuery = `
			SELECT
				s.*,
				sr.name as series_name,
				sr.logo as series_logo
			FROM sets s
			LEFT JOIN series sr ON s.series_id = sr.id
			WHERE s.game_id = 'pokemon'
		`

		const { sql, params } = qb.build(baseQuery)
		const result = await pool.query(sql, params)

		return result.rows.map(row => dbRowToSet(row, lang))
	} catch (error) {
		console.error('Error finding sets:', error)
		return []
	}
}

/**
 * Find one set by ID or name (with sealed products)
 */
export async function findOneSet(lang: SupportedLanguages, query: Query<SDKSet>): Promise<Set | undefined> {
	try {
		// For single set queries, include sealed products
		const setId = query.id as string
		if (!setId) {
			const sets = await findSets(lang, query)
			if (sets.length === 0) return undefined

			// Fetch sealed products for the found set
			return await getSetById(lang, sets[0].id)
		}

		return await getSetById(lang, setId)
	} catch (error) {
		console.error('Error finding one set:', error)
		return undefined
	}
}

/**
 * Get set by ID (with sealed products)
 */
export async function getSetById(lang: SupportedLanguages, id: string): Promise<Set | null> {
	try {
		const result = await pool.query(`
			SELECT
				s.*,
				sr.name as series_name,
				sr.logo as series_logo,
				(
					SELECT json_agg(sp_data.*)
					FROM (
						SELECT sp.*
						FROM sealed_products sp
						WHERE sp.set_id = s.id
						ORDER BY sp.product_type, sp.id
					) sp_data
				) as sealed_products
			FROM sets s
			LEFT JOIN series sr ON s.series_id = sr.id
			WHERE s.id = $1
		`, [id])

		if (result.rows.length === 0) {
			return null
		}

		return dbRowToSet(result.rows[0], lang, true)
	} catch (error) {
		console.error(`Error loading set ${id}:`, error)
		return null
	}
}

/**
 * Convert set to brief format for listings
 */
export function setToBrief(set: Set | SDKSet): SetResume {
	return {
		id: set.id,
		name: set.name,
		logo: set.logo,
		symbol: set.symbol,
		cardCount: set.cardCount,
	}
}
