import fs from 'fs/promises'
import path from 'path'
import { glob } from 'glob'
import { extractFile } from './utils/ts-extract-utils'

async function countTCGPlayer() {
	try {
		console.log('🔍 Counting cards with TCGPlayer IDs...')

		// Find all card files
		const cardFiles = await glob('data/**/*.ts', {
			cwd: process.cwd(),
			ignore: ['data/**/index.ts', 'data/**/serie.ts', 'data/**/set.ts']
		})

		console.log(`📋 Found ${cardFiles.length} card files`)

		let totalCards = 0
		let cardsWithTCGPlayer = 0
		let cardsWithCardmarket = 0
		let cardsWithBoth = 0

		// Process each card file
		for (const cardFile of cardFiles) {
			try {
				const cardData = extractFile(cardFile)

				// Skip if not a card
				if (!cardData || !cardData.set) {
					continue
				}

				totalCards++

				const hasTCGPlayer = !!cardData.thirdParty?.tcgplayer
				const hasCardmarket = !!cardData.thirdParty?.cardmarket

				if (hasTCGPlayer) {
					cardsWithTCGPlayer++
				}
				if (hasCardmarket) {
					cardsWithCardmarket++
				}
				if (hasTCGPlayer && hasCardmarket) {
					cardsWithBoth++
				}

			} catch (error) {
				console.error(`❌ Error processing ${cardFile}:`, error)
				continue
			}
		}

		console.log('📊 Results:')
		console.log(`Total cards: ${totalCards}`)
		console.log(`Cards with TCGPlayer ID: ${cardsWithTCGPlayer}`)
		console.log(`Cards with Cardmarket ID: ${cardsWithCardmarket}`)
		console.log(`Cards with both IDs: ${cardsWithBoth}`)

	} catch (error) {
		console.error('💥 Fatal error:', error)
		process.exit(1)
	}
}

// Run the counter
if (import.meta.main) {
	countTCGPlayer()
}
