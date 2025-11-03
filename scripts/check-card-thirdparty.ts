import { Pool } from 'pg'

const pool = new Pool({
	host: process.env.DB_HOST || 'card-db-postgres',
	port: parseInt(process.env.DB_PORT || '5432'),
	database: process.env.DB_NAME || 'carddb',
	user: process.env.DB_USER || 'cardadmin',
	password: process.env.DB_PASSWORD || 'zTUriQtdN70spWI5RBfyEl76Vb5/NFHAz8E2w5bD1Ss=',
})

async function checkCardData() {
	try {
		console.log('Checking card third-party data structure...\n')

		// Check the Welcoming Lantern card mentioned in the logs
		const result = await pool.query(`
			SELECT
				c.id,
				c.local_id,
				c.name,
				c.third_party,
				s.id as set_id,
				s.name as set_name,
				s.metadata
			FROM cards c
			LEFT JOIN sets s ON c.set_id = s.id
			WHERE c.id = $1
		`, ['swsh6-230'])

		if (result.rows.length === 0) {
			console.log('Card swsh6-230 not found')
		} else {
			const card = result.rows[0]
			console.log('Card:', card.id)
			console.log('Name:', card.name)
			console.log('Set:', card.set_id, '-', card.set_name)
			console.log('\nCard third_party data:')
			console.log(JSON.stringify(card.third_party, null, 2))
			console.log('\nSet metadata:')
			console.log(JSON.stringify(card.metadata, null, 2))
		}

		// Check card variants
		console.log('\n\nChecking card variants...\n')
		const variantsResult = await pool.query(`
			SELECT variant_type, third_party
			FROM card_variants
			WHERE card_id = $1
		`, ['swsh6-230'])

		if (variantsResult.rows.length === 0) {
			console.log('No variants found for swsh6-230')
		} else {
			console.log(`Found ${variantsResult.rows.length} variants:`)
			variantsResult.rows.forEach(row => {
				console.log(`\n  Variant: ${row.variant_type}`)
				console.log(`  Third-party:`, JSON.stringify(row.third_party, null, 2))
			})
		}

		// Check a few more cards to see the data structure
		console.log('\n\nChecking sample of cards with third_party data...\n')
		const sampleResult = await pool.query(`
			SELECT id, local_id, set_id, third_party
			FROM cards
			WHERE third_party IS NOT NULL
			  AND third_party != '{}'::jsonb
			LIMIT 5
		`)

		console.log(`Found ${sampleResult.rows.length} cards with third_party data:`)
		sampleResult.rows.forEach(row => {
			console.log(`\n  Card: ${row.id} (${row.set_id}-${row.local_id})`)
			console.log(`  Third-party:`, JSON.stringify(row.third_party, null, 2))
		})

	} catch (error) {
		console.error('Error:', error)
	} finally {
		await pool.end()
	}
}

checkCardData()
