/* eslint-disable max-statements */
import { existsSync, promises as fs } from 'fs'
import { SupportedLanguages } from '../../interfaces'
import { FileFunction } from './compilerInterfaces'
import { fetchRemoteFile, loadLastEdits } from './utils/util'

const LANGS: Array<SupportedLanguages> = [
	'en', 'fr', 'es', 'es-mx', 'it', 'pt', 'pt-br', 'pt-pt', 'de', 'nl', 'pl', 'ru',
	'ja', 'ko', 'zh-tw', 'id', 'th', 'zh-cn'
]

const DIST_FOLDER = './generated'

// Sets to skip due to known compilation issues
const SKIP_SETS = [
	'tk-bw-e',     // BW trainer Kit (Excadrill)
	'tk-bw-z',     // BW trainer Kit (Zoroark)
	'sv10',        // Destined Rivals - has numbering issues
]

// Track statistics
const stats = {
	setsSkipped: 0,
	setsProcessed: 0,
	errors: [] as string[],
}

;(async () => {
	const paths = (await fs.readdir('./compiler/endpoints')).filter((p) => p.endsWith('.ts'))

	// Prefetch the pictures at the start as it can bug because of bad connection
	console.log('1. Loading remote sources')
	try {
		await fetchRemoteFile('https://assets.tcgdex.net/datas.json')
	} catch (err) {
		console.warn('⚠️  Could not fetch remote data, continuing anyway...')
	}

	// Create dist folder if it doesn't exist
	try {
		await fs.mkdir(DIST_FOLDER, { recursive: true })
	} catch {
		// Folder exists
	}

	console.log('\n2. Loading informations from GIT')
	try {
		await loadLastEdits()
	} catch (err) {
		console.warn('⚠️  Could not load git info, continuing anyway...')
	}

	console.log('\n3. Compiling Files (Safe Mode)')
	console.log(`   Skipping known problematic sets: ${SKIP_SETS.join(', ')}`)

	// Process each languages
	let progressIndex = 0
	for await (const lang of LANGS) {
		// loop through """endpoints"""
		for await (const file of paths) {

			// final folder path
			const folder = `${DIST_FOLDER}/${lang}`

			// Make the folder
			try {
				await fs.mkdir(folder, { recursive: true })
			} catch {
				// Folder exists
			}

			const filename = file.replace('.ts', '')
			console.log(`       Compiling ${lang} ${filename}.ts`)

			// Dynamic import and run
			try {
				const module: {default: FileFunction} = await import(`./endpoints/${filename}.ts`)
				const compiled = await module.default(lang, SKIP_SETS)

				// Write result
				const outputPath = `${folder}/${filename}.json`
				await fs.writeFile(
					outputPath,
					JSON.stringify(compiled, null, '\t'),
					'utf-8'
				)

				stats.setsProcessed++
			} catch (err) {
				const errorMsg = `Failed to compile ${lang}/${filename}: ${(err as Error).message}`
				console.error(`       ❌ ${errorMsg}`)
				stats.errors.push(errorMsg)

				// Create empty file to prevent import errors
				const outputPath = `${folder}/${filename}.json`
				try {
					await fs.writeFile(outputPath, '[]', 'utf-8')
				} catch {
					// Ignore
				}
			}

			progressIndex++
		}
	}

	console.log('\n' + '='.repeat(70))
	console.log('COMPILATION SUMMARY (Safe Mode)')
	console.log('='.repeat(70))
	console.log(`Sets processed: ${stats.setsProcessed}`)
	console.log(`Sets skipped:   ${SKIP_SETS.length}`)
	console.log(`Errors:         ${stats.errors.length}`)

	if (stats.errors.length > 0) {
		console.log('\nErrors encountered:')
		stats.errors.forEach(err => console.log(`  - ${err}`))
	}

	console.log('='.repeat(70))

	if (stats.errors.length === 0) {
		console.log('\n✅ Compilation completed successfully!')
	} else {
		console.log('\n⚠️  Compilation completed with errors (check above)')
	}
})()
