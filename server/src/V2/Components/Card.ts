/**
 * Card Component - PostgreSQL Version
 *
 * This module handles card queries and transformations using PostgreSQL
 * instead of in-memory JSON files.
 */

import Cache from '@cachex/memory'
import { objectOmit } from '@dzeio/object-util'
import type { CardResume, Card as SDKCard } from '@tcgdex/sdk'
import { SupportedLanguages } from '@tcgdex/sdk'
import { pool } from '../../libs/db'
import { buildCardQuery } from '../../libs/QueryBuilder'
import { getCardMarketPrice } from '../../libs/providers/cardmarket'
import { getTCGPlayerPrice } from '../../libs/providers/tcgplayer'
import type { Query } from '../../libs/QueryEngine/filter'

/**
 * Construct image URL for a card
 * Pattern: https://assets.tcgdex.net/{lang}/{series_id}/{set_id}/{localId}
 */
function constructImageURL(lang: SupportedLanguages, seriesId: string, setId: string, localId: string): string {
	return `https://assets.tcgdex.net/${lang}/${seriesId}/${setId}/${localId}`
}

const cache = new Cache()

export type Card = SDKCard

/**
 * Transform database row to SDK Card format
 */
function dbRowToCard(row: any, lang: SupportedLanguages): SDKCard {
	const attributes = row.attributes || {}

	// Construct image URL if not present in database
	const imageURL = row.image || constructImageURL(lang, row.series_id, row.set_id, row.local_id)

	// Helper function to extract language-specific value
	const extractLang = (value: any): any => {
		if (!value) return value
		if (typeof value === 'object' && !Array.isArray(value) && (value[lang] || value.en)) {
			return value[lang] || value.en
		}
		return value
	}

	return {
		id: row.id,
		localId: row.local_id,
		name: row.name[lang] || row.name.en,
		illustrator: row.illustrator,
		rarity: row.rarity,
		category: row.category,

		set: {
			id: row.set_id,
			name: row.set_name ? row.set_name[lang] || row.set_name.en : '',
			logo: row.set_logo,
			symbol: row.set_symbol,
			cardCount: row.set_card_count,
			metadata: row.set_metadata,
		},

		// Pokemon-specific attributes
		dexId: attributes.dexId,
		hp: attributes.hp,
		types: attributes.types,
		evolveFrom: extractLang(attributes.evolveFrom),
		description: extractLang(attributes.description),
		level: attributes.level,
		stage: attributes.stage,
		suffix: attributes.suffix,

		// Item cards
		item: attributes.item ? {
			name: extractLang(attributes.item.name),
			effect: extractLang(attributes.item.effect)
		} : undefined,

		// Abilities and attacks
		abilities: attributes.abilities?.map((ability: any) => ({
			type: ability.type,
			name: extractLang(ability.name),
			effect: extractLang(ability.effect)
		})),
		attacks: attributes.attacks?.map((attack: any) => ({
			cost: attack.cost,
			name: extractLang(attack.name),
			effect: extractLang(attack.effect),
			damage: attack.damage
		})),
		weaknesses: attributes.weaknesses,
		resistances: attributes.resistances,
		retreat: attributes.retreat,

		// Trainer/Energy cards
		effect: extractLang(attributes.effect),
		trainerType: attributes.trainerType,
		energyType: attributes.energyType,

		// Images - constructed from CDN pattern
		image: imageURL,

		// Regulation
		regulationMark: row.regulation_mark,
		legal: row.legal || {},

		// Variants - will be populated from variants query
		variants: undefined, // Populated by fetchCardVariants()

		// Third-party data
		thirdParty: row.third_party || {},

		// Pricing (added separately)
		pricing: undefined,
	} as unknown as SDKCard
}

/**
 * Fetch card variants from database
 */
async function fetchCardVariants(cardId: string): Promise<any> {
	try {
		const result = await pool.query(`
			SELECT variant_type
			FROM card_variants
			WHERE card_id = $1
		`, [cardId])

		// Build variants object
		const variants = {
			firstEdition: false,
			holo: false,
			normal: false,
			reverse: false,
			wPromo: false,
		}

		result.rows.forEach(row => {
			const type = row.variant_type?.toLowerCase()
			if (type === 'normal') variants.normal = true
			else if (type === 'holo') variants.holo = true
			else if (type === 'reverse') variants.reverse = true
			else if (type === 'firstEdition' || type === 'first-edition') variants.firstEdition = true
			else if (type === 'wPromo' || type === 'w-promo') variants.wPromo = true
		})

		// Return undefined if no variants found, otherwise return the object
		return result.rows.length > 0 ? variants : undefined
	} catch (error) {
		console.error(`Error fetching variants for card ${cardId}:`, error)
		return undefined
	}
}

/**
 * Load a single card by ID with caching and pricing
 */
async function loadCard(lang: SupportedLanguages, id: string): Promise<SDKCard | null> {
	const key = `${id}${lang}`.toLowerCase()
	const cached = cache.get<SDKCard>(key)

	if (cached) {
		return cached
	}

	try {
		const result = await pool.query(`
			SELECT
				c.*,
				s.name as set_name,
				s.logo as set_logo,
				s.symbol as set_symbol,
				s.card_count as set_card_count,
				s.series_id as series_id,
				s.metadata as set_metadata
			FROM cards c
			LEFT JOIN sets s ON c.set_id = s.id
			WHERE c.id = $1
		`, [id])

		if (result.rows.length === 0) {
			return null
		}

		const card = dbRowToCard(result.rows[0], lang)

		// Fetch variants and pricing data
		const [variants, cardmarket, tcgplayer] = await Promise.all([
			fetchCardVariants(id),
			getCardMarketPrice(card as any),
			getTCGPlayerPrice(card as any),
		])

		const enrichedCard = {
			...objectOmit(card as any, 'thirdParty'),
			variants: variants,
			pricing: {
				cardmarket: cardmarket,
				tcgplayer: tcgplayer
			}
		} as SDKCard

		// Cache for 1 hour
		cache.set(key, enrichedCard, 60 * 60)

		return enrichedCard
	} catch (error) {
		console.error(`Error loading card ${id}:`, error)
		return null
	}
}

/**
 * Get all cards for a language
 */
export async function getAllCards(lang: SupportedLanguages): Promise<Array<SDKCard>> {
	try {
		const result = await pool.query(`
			SELECT
				c.*,
				s.name as set_name,
				s.logo as set_logo,
				s.symbol as set_symbol,
				s.card_count as set_card_count,
				s.series_id as series_id,
				s.metadata as set_metadata
			FROM cards c
			LEFT JOIN sets s ON c.set_id = s.id
			WHERE c.game_id = 'pokemon'
			ORDER BY c.set_id, c.local_id
		`)

		// Transform all rows in parallel
		const cards = await Promise.all(
			result.rows.map(row => loadCard(lang, row.id))
		)

		return cards.filter(card => card !== null) as Array<SDKCard>
	} catch (error) {
		console.error('Error loading all cards:', error)
		return []
	}
}

/**
 * Get compiled card (for backward compatibility)
 */
export async function getCompiledCard(lang: SupportedLanguages, id: string): Promise<any> {
	try {
		const result = await pool.query(`
			SELECT
				c.*,
				s.name as set_name,
				s.logo as set_logo,
				s.symbol as set_symbol,
				s.card_count as set_card_count,
				s.series_id as series_id,
				s.metadata as set_metadata
			FROM cards c
			LEFT JOIN sets s ON c.set_id = s.id
			WHERE c.id = $1
		`, [id])

		if (result.rows.length === 0) {
			return null
		}

		const row = result.rows[0]

		// Return a simplified object with thirdParty data
		return {
			id: row.id,
			localId: row.local_id,
			name: row.name?.[lang] || row.name?.en || Object.values(row.name || {})[0],
			set: {
				id: row.set_id,
				name: row.set_name
			},
			thirdParty: row.third_party || {}
		}
	} catch (error) {
		console.error(`Error loading compiled card ${id}:`, error)
		return null
	}
}

/**
 * Get card by ID
 */
export async function getCardById(lang: SupportedLanguages, id: string): Promise<SDKCard | null> {
	return loadCard(lang, id)
}

/**
 * Find cards with filters
 */
export async function findCards(lang: SupportedLanguages, query: Query<SDKCard>): Promise<Array<SDKCard>> {
	try {
		const qb = buildCardQuery(lang, query as any)

		const baseQuery = `
			SELECT
				c.*,
				s.name as set_name,
				s.logo as set_logo,
				s.symbol as set_symbol,
				s.card_count as set_card_count,
				s.series_id as series_id,
				s.metadata as set_metadata
			FROM cards c
			LEFT JOIN sets s ON c.set_id = s.id
		`

		const { sql, params } = qb.build(baseQuery)
		console.log('=== SQL DEBUG ===')
		console.log('SQL:', sql)
		console.log('Params:', params)
		console.log('=================')
		const result = await pool.query(sql, params)

		// Transform and enrich with pricing
		const cards = await Promise.all(
			result.rows.map(row => loadCard(lang, row.id))
		)

		return cards.filter(card => card !== null) as Array<SDKCard>
	} catch (error) {
		console.error('Error finding cards:', error)
		console.error('Error details:', error instanceof Error ? error.message : String(error))
		return []
	}
}

/**
 * Find one card
 */
export async function findOneCard(lang: SupportedLanguages, query: Query<SDKCard>): Promise<SDKCard | undefined> {
	const cards = await findCards(lang, query)
	return cards.length > 0 ? cards[0] : undefined
}

/**
 * Convert card to brief format for listings
 */
export function toBrief(card: SDKCard): CardResume {
	// Priority order for price: TCGPlayer (foil/holofoil/reverse/normal) > Cardmarket avg1
	let price = null

	if (card.pricing?.tcgplayer) {
		const tcp = card.pricing.tcgplayer
		// Try different variants in priority order
		price = tcp.foil?.marketPrice
			|| tcp.holofoil?.marketPrice
			|| tcp['reverse-holofoil']?.marketPrice
			|| tcp.holo?.marketPrice
			|| tcp['1st-edition-holofoil']?.marketPrice
			|| tcp.normal?.marketPrice
			|| tcp['1st-edition-normal']?.marketPrice
			|| null
	}

	// Fallback to Cardmarket if TCGPlayer has no data
	if (price === null && card.pricing?.cardmarket?.avg1) {
		price = card.pricing.cardmarket.avg1
	}

	return {
		id: card.id,
		localId: card.localId,
		name: card.name,
		image: card.image,
		set: card.set.name,
		rarity: card.rarity,
		types: card.types,
		price: price
	}
}
