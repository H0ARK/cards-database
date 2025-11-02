/**
 * TCGPlayer Variant Types
 *
 * This module defines types for handling multiple TCGPlayer product variants
 * for the same card (e.g., Pokéball Pattern, Master Ball Pattern, etc.)
 */

/**
 * Known TCGPlayer product variant types
 */
export type TCGPlayerVariant =
	| 'normal'           // Standard/default version
	| 'reverse'          // Reverse holofoil
	| 'holo'             // Holofoil
	| 'pokeball'         // Poké Ball pattern variant
	| 'masterball'       // Master Ball pattern variant
	| 'etched'           // Etched foil
	| 'galaxy'           // Galaxy holofoil
	| 'cosmos'           // Cosmos holofoil
	| string             // Allow other variants for future-proofing

/**
 * TCGPlayer product ID configuration
 * Can be either:
 * - A single number (legacy/simple cards with one variant)
 * - An object mapping variant types to product IDs
 */
export type TCGPlayerConfig = number | Partial<Record<TCGPlayerVariant, number>>

/**
 * Extended third-party configuration with multi-variant support
 */
export interface ThirdPartyConfig {
	cardmarket?: number
	tcgplayer?: TCGPlayerConfig
}

/**
 * Product variant information extracted from TCGPlayer product data
 */
export interface ProductVariantInfo {
	productId: number
	variant: TCGPlayerVariant
	cardNumber: string
	name: string
}

/**
 * Helper to normalize TCGPlayer config to always return an object
 */
export function normalizeTCGPlayerConfig(config: TCGPlayerConfig | undefined): Record<string, number> {
	if (typeof config === 'number') {
		return { normal: config }
	}
	return config || {}
}

/**
 * Helper to get a specific variant product ID
 */
export function getVariantProductId(
	config: TCGPlayerConfig | undefined,
	variant: TCGPlayerVariant = 'normal'
): number | undefined {
	if (typeof config === 'number') {
		return variant === 'normal' ? config : undefined
	}
	return config?.[variant]
}

/**
 * Helper to get all product IDs from a config
 */
export function getAllProductIds(config: TCGPlayerConfig | undefined): number[] {
	if (typeof config === 'number') {
		return [config]
	}
	return Object.values(config || {})
}

/**
 * Detect variant type from product name
 */
export function detectVariantFromName(productName: string): TCGPlayerVariant {
	const lowerName = productName.toLowerCase()

	if (lowerName.includes('master ball pattern')) return 'masterball'
	if (lowerName.includes('poke ball pattern') || lowerName.includes('pokéball pattern')) return 'pokeball'
	if (lowerName.includes('reverse holo')) return 'reverse'
	if (lowerName.includes('holofoil') || lowerName.includes(' holo')) return 'holo'
	if (lowerName.includes('etched')) return 'etched'
	if (lowerName.includes('galaxy')) return 'galaxy'
	if (lowerName.includes('cosmos')) return 'cosmos'

	return 'normal'
}

/**
 * Format variant name for display
 */
export function formatVariantName(variant: TCGPlayerVariant): string {
	const variants: Record<string, string> = {
		normal: 'Normal',
		reverse: 'Reverse Holofoil',
		holo: 'Holofoil',
		pokeball: 'Poké Ball Pattern',
		masterball: 'Master Ball Pattern',
		etched: 'Etched Foil',
		galaxy: 'Galaxy Holofoil',
		cosmos: 'Cosmos Holofoil'
	}
	return variants[variant] || variant.charAt(0).toUpperCase() + variant.slice(1)
}
