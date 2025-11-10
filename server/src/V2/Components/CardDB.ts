/**
 * Card Component - PostgreSQL Version - PRODUCTS TABLE EDITION
 *
 * NOW USING THE PRODUCTS TABLE WITH WORKING IMAGES! 🚀
 *
 * This module queries the NEW TCGPlayer products table (449k products with images)
 * instead of the OLD cards table (21k cards with NULL images).
 */

import Cache from '@cachex/memory'
import { objectOmit } from '@dzeio/object-util'
import type { CardResume, Card as SDKCard } from '@tcgdex/sdk'
import { SupportedLanguages } from '@tcgdex/sdk'
import { pool } from '../../libs/db'
import { buildCardQuery } from '../../libs/QueryBuilderOptimized'
import { getCardMarketPrice } from '../../libs/providers/cardmarket'
import { getTCGPlayerPrice } from '../../libs/providers/tcgplayer'
import type { Query } from '../../libs/QueryEngine/filter'

/**
 * Construct TCGPlayer CDN image URL from product ID
 * Pattern: https://tcgplayer-cdn.tcgplayer.com/product/{id}_{size}.jpg
 *
 * ✅ THIS ACTUALLY WORKS - ALL 449K PRODUCTS HAVE IMAGES!
 */
function constructProductImageURL(productId: number, size: '200w' | '400w' | '600w' = '400w'): string {
	return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_${size}.jpg`
}

/**
 * Fallback to TCGdex CDN (for cards not in products table)
 * Pattern: https://assets.tcgdex.net/{lang}/{series_id}/{set_id}/{localId}
 */
function constructTCGdexImageURL(lang: SupportedLanguages, seriesId: string, setId: string, localId: string): string {
	return `https://assets.tcgdex.net/${lang}/${seriesId}/${setId}/${localId}`
}

const cache = new Cache()

export type Card = SDKCard

/**
 * Transform products table row to SDK Card format
 */
function productRowToCard(row: any, lang: SupportedLanguages): SDKCard {
	const cardText = row.card_text || {}

	// Parse attacks from card_text
	const attacks = []
	if (cardText.attack1) attacks.push(parseAttack(cardText.attack1))
	if (cardText.attack2) attacks.push(parseAttack(cardText.attack2))
	if (cardText.attack3) attacks.push(parseAttack(cardText.attack3))

	// Construct image URLs from product ID
	const imageURL = constructProductImageURL(row.id, '400w')
	const imageSmall = constructProductImageURL(row.id, '200w')
	const imageHigh = constructProductImageURL(row.id, '600w')

	return {
		id: row.card_id || `product-${row.id}`, // Use card_id if linked, else product-{id}
		localId: row.card_number || row.id.toString(),
		name: row.name,
		illustrator: null, // Not in products table
		rarity: row.rarity_name || 'Unknown',
		category: row.card_type_name || 'Pokemon',

		set: {
			id: row.group_abbreviation || `group-${row.group_id}`,
			name: row.group_name || 'Unknown Set',
			logo: null,
			symbol: null,
			cardCount: null,
		},

		// Pokemon-specific attributes
		dexId: undefined,
		hp: row.hp || undefined,
		types: row.card_type_name ? [row.card_type_name] : undefined,
		evolveFrom: undefined,
		description: undefined,
		level: undefined,
		stage: row.stage || undefined,
		suffix: undefined,

		// Item cards
		item: undefined,

		// Abilities and attacks
		abilities: undefined,
		attacks: attacks.length > 0 ? attacks : undefined,
		weaknesses: cardText.weakness ? parseWeakness(cardText.weakness) : undefined,
		resistances: cardText.resistance ? parseResistance(cardText.resistance) : undefined,
		retreat: row.retreat_cost || undefined,

		// Trainer/Energy cards
		effect: cardText.text || undefined,
		trainerType: undefined,
		energyType: undefined,

		// Images - NOW WORKING! ✅
		image: imageURL,
		imageSmall: imageSmall,
		imageHigh: imageHigh,

		// Regulation
		regulationMark: undefined,
		legal: {},

		// Variants (will be enriched with pricing)
		variants: undefined,

		// Third-party data
		thirdParty: {
			tcgplayer: {
				productId: row.id,
				url: row.url
			}
		},

		// Pricing (added separately)
		pricing: row.market_price ? {
			tcgplayer: {
				normal: {
					marketPrice: row.market_price / 100, // Convert cents to dollars
					lowPrice: row.low_price ? row.low_price / 100 : undefined,
					highPrice: row.high_price ? row.high_price / 100 : undefined,
					directLowPrice: row.direct_low_price ? row.direct_low_price / 100 : undefined,
				}
			}
		} : undefined,
	} as unknown as SDKCard
}

/**
 * Parse attack string from card_text
 */
function parseAttack(attackStr: string): any {
	// Simple parser for attack strings like "[PPP] Confuse Ray (30)"
	const match = attackStr.match(/\[(.*?)\]\s*(.*?)\s*\((\d+)\)/)
	if (match) {
		return {
			cost: match[1].split(''),
			name: match[2].trim(),
			damage: match[3],
			effect: attackStr.split('\n').slice(1).join('\n').trim()
		}
	}
	return {
		name: attackStr,
		cost: [],
		damage: undefined,
		effect: undefined
	}
}

/**
 * Parse weakness string
 */
function parseWeakness(weaknessStr: string): any {
	return [{ type: weaknessStr }]
}

/**
 * Parse resistance string
 */
function parseResistance(resistanceStr: string): any {
	return [{ type: resistanceStr }]
}

/**
 * Transform legacy cards table row to SDK Card format (FALLBACK ONLY)
 */
function dbRowToCard(row: any, lang: SupportedLanguages): SDKCard {
	const attributes = row.attributes || {}

	// Try to get product ID from third_party data
	const productId = row.third_party?.tcgplayer?.normal

	// Use product image if available, otherwise fallback to TCGdex
	let imageURL, imageSmall, imageHigh
	if (productId) {
		imageURL = constructProductImageURL(productId, '400w')
		imageSmall = constructProductImageURL(productId, '200w')
		imageHigh = constructProductImageURL(productId, '600w')
	} else {
		imageURL = row.image || constructTCGdexImageURL(lang, row.series_id, row.set_id, row.local_id)
		imageSmall = imageURL
		imageHigh = imageURL
	}

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

		// Images - NOW WITH PRODUCT IMAGES! ✅
		image: imageURL,
		imageSmall: imageSmall,
		imageHigh: imageHigh,

		// Regulation
		regulationMark: row.regulation_mark,
		legal: row.legal || {},

		// Variants (will be enriched with pricing)
		variants: undefined,

		// Third-party data
		thirdParty: row.third_party || {},

		// Pricing (added separately)
		pricing: undefined,
	} as unknown as SDKCard
}

/**
 * Load a single card by ID with caching and pricing
 *
 * STRATEGY:
 * 1. Check if ID is numeric (product ID) or text (card ID)
 * 2. If numeric, query products table directly
 * 3. If text, try cards table with product enrichment
 */
async function loadCard(lang: SupportedLanguages, id: string): Promise<SDKCard | null> {
	const key = `${id}${lang}`.toLowerCase()
	const cached = cache.get<SDKCard>(key)

	if (cached) {
		return cached
	}

	try {
		// Check if ID is numeric (product ID) or text (card ID)
		const isProductId = /^\d+$/.test(id)

		if (isProductId) {
			// Query products table directly
			const result = await pool.query(`
				SELECT
					p.id,
					p.name,
					p.card_number,
					p.hp,
					p.stage,
					p.retreat_cost,
					p.url,
					p.card_text,
					r.name as rarity_name,
					ct.name as card_type_name,
					g.id as group_id,
					g.name as group_name,
					g.abbreviation as group_abbreviation,
					cp.market_price,
					cp.low_price,
					cp.high_price,
					cp.direct_low_price,
					NULL as card_id
				FROM products p
				LEFT JOIN rarities r ON p.rarity_id = r.id
				LEFT JOIN card_types ct ON p.card_type_id = ct.id
				LEFT JOIN groups g ON p.group_id = g.id
				LEFT JOIN current_prices cp ON p.id = cp.product_id AND cp.variant_id = 1
				WHERE p.id = $1 AND p.category_id = 3
			`, [parseInt(id)])

			if (result.rows.length === 0) {
				return null
			}

			const card = productRowToCard(result.rows[0], lang)

			// Cache for 1 hour
			cache.set(key, card, 60 * 60)

			return card
		} else {
			// Query cards table with product enrichment
			const result = await pool.query(`
				SELECT
					c.*,
					s.name as set_name,
					s.logo as set_logo,
					s.symbol as set_symbol,
					s.card_count as set_card_count,
					s.series_id as series_id,
					p.id as product_id,
					p.url as product_url,
					cp.market_price,
					cp.low_price,
					cp.high_price
				FROM cards c
				LEFT JOIN sets s ON c.set_id = s.id
				LEFT JOIN products p ON p.id = (c.third_party->'tcgplayer'->>'normal')::int
				LEFT JOIN current_prices cp ON p.id = cp.product_id AND cp.variant_id = 1
				WHERE c.id = $1
			`, [id])

			if (result.rows.length === 0) {
				return null
			}

			const card = dbRowToCard(result.rows[0], lang)

			// Add pricing from products table if available
			if (result.rows[0].market_price) {
				card.pricing = {
					tcgplayer: {
						normal: {
							marketPrice: result.rows[0].market_price / 100,
							lowPrice: result.rows[0].low_price ? result.rows[0].low_price / 100 : undefined,
							highPrice: result.rows[0].high_price ? result.rows[0].high_price / 100 : undefined,
						}
					}
				}
			}

			// Cache for 1 hour
			cache.set(key, card, 60 * 60)

			return card
		}
	} catch (error) {
		console.error(`Error loading card ${id}:`, error)
		return null
	}
}

/**
 * Get all cards for a language
 * NOW QUERIES PRODUCTS TABLE! 🚀
 */
export async function getAllCards(lang: SupportedLanguages): Promise<Array<SDKCard>> {
	try {
		const result = await pool.query(`
			SELECT
				p.id,
				p.name,
				p.card_number,
				p.hp,
				p.stage,
				p.retreat_cost,
				p.url,
				p.card_text,
				r.name as rarity_name,
				ct.name as card_type_name,
				g.id as group_id,
				g.name as group_name,
				g.abbreviation as group_abbreviation,
				cp.market_price,
				cp.low_price,
				cp.high_price,
				cp.direct_low_price,
				c.id as card_id
			FROM products p
			LEFT JOIN rarities r ON p.rarity_id = r.id
			LEFT JOIN card_types ct ON p.card_type_id = ct.id
			LEFT JOIN groups g ON p.group_id = g.id
			LEFT JOIN current_prices cp ON p.id = cp.product_id AND cp.variant_id = 1
			LEFT JOIN cards c ON (c.third_party->'tcgplayer'->>'normal')::int = p.id
			WHERE p.category_id = 3
			ORDER BY p.group_id, p.card_number
			LIMIT 10000
		`)

		return result.rows.map(row => productRowToCard(row, lang))
	} catch (error) {
		console.error('Error loading all cards:', error)
		return []
	}
}

/**
 * Get compiled card (for backward compatibility)
 */
export function getCompiledCard(lang: SupportedLanguages, id: string): any {
	// This is a synchronous function in the old API, but we need async DB access
	// For now, return null and let loadCard handle it
	return null
}

/**
 * Get card by ID
 */
export async function getCardById(lang: SupportedLanguages, id: string): Promise<SDKCard | null> {
	return loadCard(lang, id)
}

/**
 * Find cards with filters
 * NOW SEARCHES PRODUCTS TABLE! 🚀
 */
export async function findCards(lang: SupportedLanguages, query: Query<SDKCard>): Promise<Array<SDKCard>> {
	try {
		// Build WHERE conditions from query
		const conditions: string[] = ['p.category_id = 3'] // Pokemon only
		const params: any[] = []
		let paramCounter = 1

		// Extract common query parameters
		const q = query as any

		// Name search
		if (q.name) {
			conditions.push(`(p.name ILIKE $${paramCounter} OR p.clean_name ILIKE $${paramCounter})`)
			params.push(`%${q.name}%`)
			paramCounter++
		}

		// Rarity filter
		if (q.rarity) {
			conditions.push(`r.name ILIKE $${paramCounter}`)
			params.push(`%${q.rarity}%`)
			paramCounter++
		}

		// HP filter
		if (q.hp) {
			conditions.push(`p.hp = $${paramCounter}`)
			params.push(q.hp)
			paramCounter++
		}

		// Stage filter
		if (q.stage) {
			conditions.push(`p.stage ILIKE $${paramCounter}`)
			params.push(`%${q.stage}%`)
			paramCounter++
		}

		// Set/Group filter
		if (q.set || q['set.id']) {
			const setId = q.set || q['set.id']
			conditions.push(`(g.abbreviation = $${paramCounter} OR g.id = $${paramCounter})`)
			params.push(setId)
			paramCounter++
		}

		// Limit and offset
		const limit = q.$limit || 100
		const offset = q.$offset || 0

		const whereClause = conditions.join(' AND ')

		const sql = `
			SELECT
				p.id,
				p.name,
				p.card_number,
				p.hp,
				p.stage,
				p.retreat_cost,
				p.url,
				p.card_text,
				r.name as rarity_name,
				ct.name as card_type_name,
				g.id as group_id,
				g.name as group_name,
				g.abbreviation as group_abbreviation,
				cp.market_price,
				cp.low_price,
				cp.high_price,
				cp.direct_low_price,
				c.id as card_id
			FROM products p
			LEFT JOIN rarities r ON p.rarity_id = r.id
			LEFT JOIN card_types ct ON p.card_type_id = ct.id
			LEFT JOIN groups g ON p.group_id = g.id
			LEFT JOIN current_prices cp ON p.id = cp.product_id AND cp.variant_id = 1
			LEFT JOIN cards c ON (c.third_party->'tcgplayer'->>'normal')::int = p.id
			WHERE ${whereClause}
			ORDER BY p.group_id, p.card_number
			LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
		`

		params.push(limit, offset)

		const result = await pool.query(sql, params)

		return result.rows.map(row => productRowToCard(row, lang))
	} catch (error) {
		console.error('Error finding cards:', error)
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
	// Priority order for price: TCGPlayer pricing from products table
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
		image: card.image, // NOW HAS ACTUAL IMAGES! ✅
		set: card.set.name,
		rarity: card.rarity,
		types: card.types,
		price: price
	}
}
