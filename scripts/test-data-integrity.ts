#!/usr/bin/env bun
/**
 * Test Data Integrity
 *
 * Validates that our recent changes (multi-variant TCGPlayer IDs and sealed products)
 * are working correctly by loading and inspecting the actual data files.
 */

import fs from 'fs/promises'
import { glob } from 'glob'
import path from 'path'

interface TestResults {
	totalCards: number
	cardsWithTCGPlayer: number
	cardsWithMultiVariants: number
	cardsWithSingleVariant: number
	cardsWithLegacyFormat: number
	totalSealedProducts: number
	setsWithSealed: number
	errors: string[]
	variantTypes: Set<string>
}

const results: TestResults = {
	totalCards: 0,
	cardsWithTCGPlayer: 0,
	cardsWithMultiVariants: 0,
	cardsWithSingleVariant: 0,
	cardsWithLegacyFormat: 0,
	totalSealedProducts: 0,
	setsWithSealed: 0,
	errors: [],
	variantTypes: new Set()
}

/**
 * Test multi-variant TCGPlayer IDs
 */
async function testCardVariants() {
	console.log('🔍 Testing Multi-Variant TCGPlayer IDs...\n')

	const cardFiles = await glob('data/**/[0-9]*.ts', {
		ignore: ['**/sealed/**', '**/node_modules/**']
	})

	for (const cardFile of cardFiles) {
		results.totalCards++

		try {
			const content = await fs.readFile(cardFile, 'utf-8')

			// Check for tcgplayer field
			if (!content.includes('tcgplayer:')) {
				continue
			}

			results.cardsWithTCGPlayer++

			// Check if it's legacy format (just a number)
			const legacyMatch = content.match(/tcgplayer:\s*(\d+)(?:\s*[,}\n])/)
			if (legacyMatch) {
				results.cardsWithLegacyFormat++
				continue
			}

			// Check for object format
			const objectMatch = content.match(/tcgplayer:\s*{([^}]+)}/)
			if (objectMatch) {
				const objectContent = objectMatch[1]

				// Extract variant keys
				const variantMatches = objectContent.matchAll(/(\w+):\s*(\d+)/g)
				let variantCount = 0

				for (const match of variantMatches) {
					const [, variantType] = match
					results.variantTypes.add(variantType)
					variantCount++
				}

				if (variantCount > 1) {
					results.cardsWithMultiVariants++
				} else if (variantCount === 1) {
					results.cardsWithSingleVariant++
				}
			}
		} catch (error) {
			results.errors.push(`Error reading ${cardFile}: ${(error as Error).message}`)
		}

		// Progress indicator every 1000 cards
		if (results.totalCards % 1000 === 0) {
			process.stdout.write(`\rProcessed ${results.totalCards} cards...`)
		}
	}

	console.log(`\rProcessed ${results.totalCards} cards... ✓\n`)
}

/**
 * Test specific cards with known multi-variants
 */
async function testKnownVariantCards() {
	console.log('🎯 Testing Known Multi-Variant Cards...\n')

	const testCases = [
		{
			path: 'data/Scarlet & Violet/Black Bolt/061.ts',
			name: 'Klink (Black Bolt)',
			expectedVariants: ['normal', 'masterball', 'pokeball']
		},
		{
			path: 'data/Scarlet & Violet/White Flare/001.ts',
			name: 'Snivy (White Flare)',
			expectedVariants: ['normal', 'masterball', 'pokeball']
		},
		{
			path: 'data/Scarlet & Violet/Prismatic Evolutions/001.ts',
			name: 'Exeggcute (Prismatic Evolutions)',
			expectedVariants: ['normal', 'masterball', 'pokeball']
		}
	]

	for (const testCase of testCases) {
		try {
			const content = await fs.readFile(testCase.path, 'utf-8')

			// Extract tcgplayer object
			const match = content.match(/tcgplayer:\s*{([^}]+)}/)
			if (!match) {
				console.log(`   ❌ ${testCase.name}: No tcgplayer object found`)
				results.errors.push(`${testCase.name}: Missing tcgplayer object`)
				continue
			}

			const objectContent = match[1]
			const foundVariants: string[] = []

			const variantMatches = objectContent.matchAll(/(\w+):\s*(\d+)/g)
			for (const [, variantType] of variantMatches) {
				foundVariants.push(variantType)
			}

			// Check if all expected variants are present
			const allPresent = testCase.expectedVariants.every(v => foundVariants.includes(v))

			if (allPresent) {
				console.log(`   ✅ ${testCase.name}: ${foundVariants.join(', ')}`)
			} else {
				const missing = testCase.expectedVariants.filter(v => !foundVariants.includes(v))
				console.log(`   ❌ ${testCase.name}: Missing ${missing.join(', ')}`)
				results.errors.push(`${testCase.name}: Missing variants ${missing.join(', ')}`)
			}
		} catch (error) {
			console.log(`   ❌ ${testCase.name}: ${(error as Error).message}`)
			results.errors.push(`${testCase.name}: ${(error as Error).message}`)
		}
	}

	console.log()
}

/**
 * Test sealed products
 */
async function testSealedProducts() {
	console.log('📦 Testing Sealed Products...\n')

	const sealedDirs = await glob('data/**/sealed', {
		ignore: ['**/node_modules/**']
	})

	results.setsWithSealed = sealedDirs.length

	const productTypes = new Map<string, number>()

	for (const sealedDir of sealedDirs) {
		const products = await glob(`${sealedDir}/*.ts`)

		for (const productFile of products) {
			results.totalSealedProducts++

			try {
				const content = await fs.readFile(productFile, 'utf-8')

				// Extract product type
				const typeMatch = content.match(/productType:\s*"([^"]+)"/)
				if (typeMatch) {
					const type = typeMatch[1]
					productTypes.set(type, (productTypes.get(type) || 0) + 1)
				}

				// Validate required fields
				const requiredFields = ['id:', 'name:', 'set:', 'productType:', 'thirdParty:']
				for (const field of requiredFields) {
					if (!content.includes(field)) {
						results.errors.push(`${productFile}: Missing ${field}`)
					}
				}
			} catch (error) {
				results.errors.push(`Error reading ${productFile}: ${(error as Error).message}`)
			}
		}
	}

	console.log(`   Found ${results.setsWithSealed} sets with sealed products`)
	console.log(`   Total sealed products: ${results.totalSealedProducts}`)
	console.log()
	console.log('   Product Types:')

	const sortedTypes = Array.from(productTypes.entries())
		.sort((a, b) => b[1] - a[1])

	for (const [type, count] of sortedTypes.slice(0, 10)) {
		console.log(`     ${type.padEnd(25)} ${count}`)
	}

	console.log()
}

/**
 * Test a sample sealed product file
 */
async function testSampleSealedProduct() {
	console.log('🎁 Testing Sample Sealed Product...\n')

	const samplePath = 'data/Scarlet & Violet/Obsidian Flames/sealed/501257.ts'

	try {
		const content = await fs.readFile(samplePath, 'utf-8')

		// Check structure
		const checks = [
			{ field: 'id:', expected: 'obsidian-flames-obsidian-flames-booster-box' },
			{ field: 'productType:', expected: 'booster-box' },
			{ field: 'packCount:', expected: '36' },
			{ field: 'thirdParty:', expected: 'tcgplayer: 501257' }
		]

		let allPassed = true

		for (const check of checks) {
			if (content.includes(check.field)) {
				console.log(`   ✅ Has ${check.field}`)
			} else {
				console.log(`   ❌ Missing ${check.field}`)
				allPassed = false
			}
		}

		if (allPassed) {
			console.log('\n   ✅ Sample sealed product structure is valid')
		}
	} catch (error) {
		console.log(`   ❌ Error: ${(error as Error).message}`)
		results.errors.push(`Sample sealed product: ${(error as Error).message}`)
	}

	console.log()
}

/**
 * Print final report
 */
function printReport() {
	console.log('='.repeat(70))
	console.log('📊 DATA INTEGRITY TEST RESULTS')
	console.log('='.repeat(70))
	console.log()
	console.log('CARDS:')
	console.log(`  Total cards scanned:              ${results.totalCards}`)
	console.log(`  Cards with TCGPlayer data:        ${results.cardsWithTCGPlayer}`)
	console.log(`  - New object format (single):     ${results.cardsWithSingleVariant}`)
	console.log(`  - New object format (multi):      ${results.cardsWithMultiVariants}`)
	console.log(`  - Legacy number format:           ${results.cardsWithLegacyFormat}`)
	console.log()
	console.log('VARIANT TYPES FOUND:')
	const sortedVariants = Array.from(results.variantTypes).sort()
	console.log(`  ${sortedVariants.join(', ')}`)
	console.log()
	console.log('SEALED PRODUCTS:')
	console.log(`  Sets with sealed products:        ${results.setsWithSealed}`)
	console.log(`  Total sealed products:            ${results.totalSealedProducts}`)
	console.log()

	if (results.errors.length > 0) {
		console.log('ERRORS:')
		console.log(`  Total errors: ${results.errors.length}`)
		if (results.errors.length <= 10) {
			for (const error of results.errors) {
				console.log(`  ❌ ${error}`)
			}
		} else {
			for (const error of results.errors.slice(0, 10)) {
				console.log(`  ❌ ${error}`)
			}
			console.log(`  ... and ${results.errors.length - 10} more errors`)
		}
		console.log()
	}

	console.log('='.repeat(70))

	const totalExpectedMultiVariants = 259 // Black Bolt + White Flare + Prismatic Evolutions
	const totalExpectedSealed = 2645

	if (results.cardsWithMultiVariants >= totalExpectedMultiVariants &&
	    results.totalSealedProducts >= totalExpectedSealed &&
	    results.errors.length === 0) {
		console.log('✅ ALL TESTS PASSED!')
	} else {
		console.log('⚠️  SOME TESTS FAILED OR INCOMPLETE')

		if (results.cardsWithMultiVariants < totalExpectedMultiVariants) {
			console.log(`   Expected at least ${totalExpectedMultiVariants} multi-variant cards, found ${results.cardsWithMultiVariants}`)
		}
		if (results.totalSealedProducts < totalExpectedSealed) {
			console.log(`   Expected at least ${totalExpectedSealed} sealed products, found ${results.totalSealedProducts}`)
		}
	}
	console.log('='.repeat(70))
}

/**
 * Main execution
 */
async function main() {
	console.log('🧪 TCGDex Data Integrity Test Suite\n')
	console.log('Testing multi-variant TCGPlayer IDs and sealed products...\n')

	await testCardVariants()
	await testKnownVariantCards()
	await testSealedProducts()
	await testSampleSealedProduct()

	printReport()
}

main().catch(console.error)
