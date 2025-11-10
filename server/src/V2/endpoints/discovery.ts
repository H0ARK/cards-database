import express, { type Request, type Response } from 'express';

const router = express.Router();

/**
 * Endpoint discovery - returns all available API endpoints
 * Useful for AI agents to understand server capabilities
 */
router.get('/endpoints', (req: Request, res: Response) => {
	const endpoints = [
		// Listing endpoints
		{
			method: 'GET',
			path: '/v2/:lang/cards',
			description: 'Get all cards with optional filtering',
			parameters: {
				lang: 'Language code (en, fr, de, etc.)',
				query: 'Advanced query parameters - examples: ?q=pikachu, ?rarity=Rare, ?stage=Stage%201, ?hp=100'
			},
			example: '/v2/en/cards',
			response: 'Array of brief card objects'
		},
		{
			method: 'GET',
			path: '/v2/:lang/sets',
			description: 'Get all sets',
			parameters: {
				lang: 'Language code',
				query: 'Filter by serie: ?serie=base'
			},
			example: '/v2/en/sets',
			response: 'Array of brief set objects'
		},
		{
			method: 'GET',
			path: '/v2/:lang/series',
			description: 'Get all series',
			parameters: { lang: 'Language code' },
			example: '/v2/en/series',
			response: 'Array of brief serie objects'
		},
		{
			method: 'GET',
			path: '/v2/:lang/sealed-products',
			description: 'Get all sealed products (also accessible as /sealed or /products)',
			parameters: { lang: 'Language code' },
			example: '/v2/en/sealed-products',
			response: 'Array of sealed product objects'
		},
		// Search endpoint
		{
			method: 'GET',
			path: '/v2/:lang/search',
			description: 'Unified search across cards, sets, series, and sealed products',
			parameters: {
				lang: 'Language code',
				q: 'Search term (required)',
				search: 'Alternative search parameter name'
			},
			example: '/v2/en/search?q=charizard',
			response: 'Object with cards, sets, series, and sealedProducts arrays with counts'
		},
		// Specific resource endpoints
		{
			method: 'GET',
			path: '/v2/:lang/cards/:cardId',
			description: 'Get a specific card by ID (format: set-localId)',
			parameters: {
				lang: 'Language code',
				cardId: 'Card ID (e.g., base1-4 for Base Set Charizard)'
			},
			example: '/v2/en/cards/base1-4',
			response: 'Full card object with all details'
		},
		{
			method: 'GET',
			path: '/v2/:lang/cards/:setId/:localId',
			description: 'Get a specific card by set and local ID',
			parameters: {
				lang: 'Language code',
				setId: 'Set ID',
				localId: 'Local card number within set'
			},
			example: '/v2/en/cards/base1/4',
			response: 'Full card object'
		},
		{
			method: 'GET',
			path: '/v2/:lang/cards/:cardId/history',
			description: 'Get price history for a card',
			parameters: {
				lang: 'Language code',
				cardId: 'Card ID',
				range: 'Time range: daily, monthly (default), yearly',
				productId: 'Optional TCGPlayer product ID',
				variant: 'Card variant: normal, holo, reverse, 1st-edition-normal, etc. (default: normal)'
			},
			example: '/v2/en/cards/base1-4/history?range=yearly',
			response: 'Object with price history array, source data, and graded market info'
		},
		{
			method: 'GET',
			path: '/v2/:lang/sets/:setId',
			description: 'Get a specific set by ID or name',
			parameters: {
				lang: 'Language code',
				setId: 'Set ID or name'
			},
			example: '/v2/en/sets/base1',
			response: 'Full set object'
		},
		{
			method: 'GET',
			path: '/v2/:lang/series/:serieId',
			description: 'Get a specific serie by ID or name',
			parameters: {
				lang: 'Language code',
				serieId: 'Serie ID or name'
			},
			example: '/v2/en/series/base',
			response: 'Full serie object'
		},
		{
			method: 'GET',
			path: '/v2/:lang/sealed-products/:productId',
			description: 'Get a specific sealed product',
			parameters: {
				lang: 'Language code',
				productId: 'Sealed product ID'
			},
			example: '/v2/en/sealed-products/booster-box-1',
			response: 'Full sealed product object'
		},
		// Category/filter endpoints
		{
			method: 'GET',
			path: '/v2/:lang/categories',
			description: 'Get all card categories',
			parameters: { lang: 'Language code' },
			example: '/v2/en/categories',
			response: 'Array of unique categories'
		},
		{
			method: 'GET',
			path: '/v2/:lang/energy-types',
			description: 'Get all energy types',
			parameters: { lang: 'Language code' },
			example: '/v2/en/energy-types',
			response: 'Array of unique energy types'
		},
		{
			method: 'GET',
			path: '/v2/:lang/hp',
			description: 'Get all HP values',
			parameters: { lang: 'Language code' },
			example: '/v2/en/hp',
			response: 'Array of unique HP values'
		},
		{
			method: 'GET',
			path: '/v2/:lang/illustrators',
			description: 'Get all card illustrators',
			parameters: { lang: 'Language code' },
			example: '/v2/en/illustrators',
			response: 'Array of unique illustrator names'
		},
		{
			method: 'GET',
			path: '/v2/:lang/rarities',
			description: 'Get all card rarities',
			parameters: { lang: 'Language code' },
			example: '/v2/en/rarities',
			response: 'Array of unique rarities'
		},
		{
			method: 'GET',
			path: '/v2/:lang/regulation-marks',
			description: 'Get all regulation marks',
			parameters: { lang: 'Language code' },
			example: '/v2/en/regulation-marks',
			response: 'Array of unique regulation marks'
		},
		{
			method: 'GET',
			path: '/v2/:lang/retreats',
			description: 'Get all retreat costs',
			parameters: { lang: 'Language code' },
			example: '/v2/en/retreats',
			response: 'Array of unique retreat costs'
		},
		{
			method: 'GET',
			path: '/v2/:lang/stages',
			description: 'Get all evolution stages',
			parameters: { lang: 'Language code' },
			example: '/v2/en/stages',
			response: 'Array of unique stages'
		},
		{
			method: 'GET',
			path: '/v2/:lang/suffixes',
			description: 'Get all card suffixes (ex, gx, v, vmax, etc.)',
			parameters: { lang: 'Language code' },
			example: '/v2/en/suffixes',
			response: 'Array of unique suffixes'
		},
		{
			method: 'GET',
			path: '/v2/:lang/trainer-types',
			description: 'Get all trainer types',
			parameters: { lang: 'Language code' },
			example: '/v2/en/trainer-types',
			response: 'Array of unique trainer types'
		},
		{
			method: 'GET',
			path: '/v2/:lang/types',
			description: 'Get all card types',
			parameters: { lang: 'Language code' },
			example: '/v2/en/types',
			response: 'Array of unique types'
		},
		{
			method: 'GET',
			path: '/v2/:lang/dex-ids',
			description: 'Get all Pokédex IDs',
			parameters: { lang: 'Language code' },
			example: '/v2/en/dex-ids',
			response: 'Array of unique Pokédex IDs'
		},
		{
			method: 'GET',
			path: '/v2/:lang/variants',
			description: 'Get all card variants',
			parameters: { lang: 'Language code' },
			example: '/v2/en/variants',
			response: 'Array of unique variant identifiers'
		},
		// Random endpoints
		{
			method: 'GET',
			path: '/v2/:lang/random/:what',
			description: 'Get a random card, set, or serie',
			parameters: {
				lang: 'Language code',
				what: 'card, set, or serie',
				query: 'Optional filters to narrow down random selection'
			},
			example: '/v2/en/random/card',
			response: 'Random card/set/serie object'
		},
		// GraphQL endpoint
		{
			method: 'POST/GET',
			path: '/v2/graphql',
			description: 'GraphQL endpoint for complex queries',
			parameters: {
				query: 'GraphQL query string',
				variables: 'GraphQL variables object'
			},
			example: '/v2/graphql',
			response: 'GraphQL response with data or errors'
		},
		// OpenAPI/Swagger documentation
		{
			method: 'GET',
			path: '/v2/openapi',
			description: 'OpenAPI/Swagger documentation endpoint',
			parameters: {},
			example: '/v2/openapi',
			response: 'OpenAPI specification'
		},
		// Cache management endpoints
		{
			method: 'GET',
			path: '/v2/cache/performance',
			description: 'Get API cache performance statistics',
			parameters: {},
			example: '/v2/cache/performance',
			response: 'Cache performance metrics'
		},
		{
			method: 'GET',
			path: '/v2/cache/index',
			description: 'Get list of cached keys and metadata',
			parameters: {},
			example: '/v2/cache/index',
			response: 'Array of cached entries with metadata'
		},
		{
			method: 'GET',
			path: '/v2/cache/clear',
			description: 'Clear all cached data (admin use)',
			parameters: {},
			example: '/v2/cache/clear',
			response: 'Success message'
		},
		// System endpoints
		{
			method: 'GET',
			path: '/ping',
			description: 'Health check endpoint',
			parameters: {},
			example: '/ping',
			response: 'HTTP 200'
		},
		{
			method: 'GET',
			path: '/status',
			description: 'Server status information',
			parameters: {},
			example: '/status',
			response: 'Status object with version and server info'
		}
	];

	res.json({
		apiVersion: '2.0',
		server: 'TCGdex API',
		description: 'Complete trading card game database API',
		baseUrl: `${req.protocol}://${req.get('host')}`,
		endpoints: endpoints,
		totalEndpoints: endpoints.length,
		documentation: {
			swagger: `${req.protocol}://${req.get('host')}/v2/openapi`,
			github: 'https://github.com/tcgdex/cards-database'
		},
		queryParameters: {
			limit: 'Limit number of results (default: varies by endpoint)',
			skip: 'Skip N results for pagination',
			sort: 'Sort field name',
			'$limit': 'Advanced: limit results',
			'$skip': 'Advanced: skip results',
			'$or': 'Advanced: OR conditions',
			'$and': 'Advanced: AND conditions'
		},
		supportedLanguages: ['en', 'fr', 'de', 'it', 'es', 'pt-BR', 'ja', 'zh-CN'],
		notes: [
			'All endpoints return JSON by default',
			'Append .json to any endpoint to explicitly request JSON format',
			'Results are cached in production for 1 day',
			'Use query parameters for filtering and searching',
			'See /v2/openapi for comprehensive API documentation'
		]
	});
});

export default router;
