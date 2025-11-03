/**
 * Serie Component - PostgreSQL Version
 *
 * This module handles series queries and transformations using PostgreSQL
 * instead of in-memory JSON files.
 */

import type { Serie as SDKSerie, SerieResume, SupportedLanguages } from '@tcgdex/sdk'
import { pool } from '../../libs/db'
import type { Query } from '../../libs/QueryEngine/filter'

export type Serie = SDKSerie

/**
 * Transform database row to SDK Serie format
 */
function dbRowToSerie(row: any, lang: SupportedLanguages): SDKSerie {
	return {
		id: row.id,
		name: row.name[lang] || row.name.en,
		logo: row.logo,
	} as SDKSerie
}

/**
 * Get all series for a language
 */
export async function getAllSeries(lang: SupportedLanguages): Promise<Array<SDKSerie>> {
	try {
		const result = await pool.query(`
			SELECT *
			FROM series
			WHERE game_id = 'pokemon'
			ORDER BY id
		`)

		return result.rows.map(row => dbRowToSerie(row, lang))
	} catch (error) {
		console.error('Error loading all series:', error)
		return []
	}
}

/**
 * Find series with filters
 */
export async function findSeries(lang: SupportedLanguages, query: Query<SDKSerie> = {}): Promise<Array<SDKSerie>> {
	try {
		// For now, simple implementation - can be extended with QueryBuilder if needed
		const result = await pool.query(`
			SELECT *
			FROM series
			WHERE game_id = 'pokemon'
			ORDER BY id
		`)

		return result.rows.map(row => dbRowToSerie(row, lang))
	} catch (error) {
		console.error('Error finding series:', error)
		return []
	}
}

/**
 * Find one serie by ID or name
 */
export async function findOneSerie(lang: SupportedLanguages, query: Query<SDKSerie>): Promise<SDKSerie | undefined> {
	const series = await findSeries(lang, query)
	return series.length > 0 ? series[0] : undefined
}

/**
 * Get serie by ID
 */
export async function getSerieById(lang: SupportedLanguages, id: string): Promise<SDKSerie | null> {
	try {
		const result = await pool.query(`
			SELECT *
			FROM series
			WHERE id = $1
		`, [id])

		if (result.rows.length === 0) {
			return null
		}

		return dbRowToSerie(result.rows[0], lang)
	} catch (error) {
		console.error(`Error loading serie ${id}:`, error)
		return null
	}
}

/**
 * Convert serie to brief format for listings
 */
export function serieToBrief(serie: SDKSerie): SerieResume {
	return {
		id: serie.id,
		name: serie.name,
		logo: serie.logo,
	}
}
