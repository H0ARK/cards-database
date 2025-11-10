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

export type Set = SDKSet

/**
 * Transform database row to SDK Set format
 */
function dbRowToSet(row: any, lang: SupportedLanguages): SDKSet {
	return {
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
	} as SDKSet
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
 * Find one set by ID or name
 */
export async function findOneSet(lang: SupportedLanguages, query: Query<SDKSet>): Promise<SDKSet | undefined> {
	const sets = await findSets(lang, query)
	return sets.length > 0 ? sets[0] : undefined
}

/**
 * Get set by ID
 */
export async function getSetById(lang: SupportedLanguages, id: string): Promise<SDKSet | null> {
	try {
		const result = await pool.query(`
			SELECT
				s.*,
				sr.name as series_name,
				sr.logo as series_logo
			FROM sets s
			LEFT JOIN series sr ON s.series_id = sr.id
			WHERE s.id = $1
		`, [id])

		if (result.rows.length === 0) {
			return null
		}

		return dbRowToSet(result.rows[0], lang)
	} catch (error) {
		console.error(`Error loading set ${id}:`, error)
		return null
	}
}

/**
 * Convert set to brief format for listings
 */
export function setToBrief(set: SDKSet): SetResume {
	return {
		id: set.id,
		name: set.name,
		logo: set.logo,
		symbol: set.symbol,
		cardCount: set.cardCount,
	}
}
