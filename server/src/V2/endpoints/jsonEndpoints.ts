import { objectKeys } from "@dzeio/object-util";
import type { Card as SDKCard } from "@tcgdex/sdk";
import apicache from "apicache";
import express, {
	type Request,
	type NextFunction,
	type Response,
} from "express";
import { Errors, sendError } from "../../libs/Errors";
import type { Query } from "../../libs/QueryEngine/filter";
import { recordToQuery } from "../../libs/QueryEngine/parsers";
import { betterSorter, checkLanguage, unique } from "../../util";
import {
	getAllCards,
	findOneCard,
	findCards,
	toBrief,
	getCardById,
	getCompiledCard,
} from "../Components/Card";
import { findOneSet, findSets, setToBrief } from "../Components/Set";
import { findOneSerie, findSeries, serieToBrief } from "../Components/Serie";
import {
	findSealedProducts,
	findOneSealedProduct,
	getSealedProductById,
	sealedProductToBrief,
	type SealedProduct,
} from "../Components/SealedProduct";
import { listSKUs } from "../../libs/providers/tcgplayer";
import { getRecentEBaySales } from "../../libs/providers/pricecharting";
import fs from "fs/promises";
import path from "path";

type CustomRequest = Request & {
	/**
	 * disable caching
	 */
	DO_NOT_CACHE?: boolean;
	advQuery?: Query;
};

const server = express.Router();

const endpointToField: Record<string, keyof SDKCard> = {
	categories: "category",
	"energy-types": "energyType",
	hp: "hp",
	illustrators: "illustrator",
	rarities: "rarity",
	"regulation-marks": "regulationMark",
	retreats: "retreat",
	stages: "stage",
	suffixes: "suffix",
	"trainer-types": "trainerType",

	// fields that need special care
	"dex-ids": "dexId",
	sets: "set",
	types: "types",
	variants: "variants",
};

server
	// Midleware that handle caching only in production and on GET requests
	.use(
		apicache.middleware(
			"1 day",
			(req: CustomRequest, res: Response) =>
				!req.DO_NOT_CACHE &&
				res.statusCode < 400 &&
				process.env.NODE_ENV === "production" &&
				req.method === "GET",
			{}
		)
	)

	.get('/cache/performance', (req, res) => {
		res.json(apicache.getPerformance())
	})

	// add route to display cache index
	.get('/cache/index', (req, res) => {
		res.json(apicache.getIndex())
	})

	// add route to clear cache
	.get('/cache/clear', (req, res) => {
		apicache.clear()
		res.json({ message: 'Cache cleared successfully' })
	})

	// Midleware that handle url transformation
	.use((req: CustomRequest, _, next) => {
		// this is ugly BUT it fix the problem with + not becoming spaces
		req.url = req.url.replace(/\+/g, " ");
		next();
	})

	// handle Query builder
	.use((req: CustomRequest, _, next) => {
		// handle no query
		if (!req.query) {
			next();
			return;
		}

		req.advQuery = recordToQuery(
			req.query as Record<string, string | Array<string>>
		);

		next();
	})

	/**
	 * Allows the user to fetch a random card/set/serie from the database
	 */
	.get(
		"/:lang/random/:what",
		async (req: CustomRequest, res): Promise<void> => {
			const { lang, what } = req.params;

			if (!checkLanguage(lang)) {
				sendError(Errors.LANGUAGE_INVALID, res, { lang });
				return;
			}

			// biome-ignore lint/style/noNonNullAssertion: <explanation>
			const query: Query = req.advQuery!;

			let data: Array<SDKCard | any> = [];
			switch (what.toLowerCase()) {
				// case "card":
				// 	data = await findCards(lang, query);
				// 	break;
				case "set":
					data = await findSets(lang, query);
					break;
				case "serie":
					data = await findSeries(lang, query);
					break;
				default:
					sendError(Errors.NOT_FOUND, res, {
						details: `You can only run random requests on "set" or "serie" while you did on "${what}"`,
					});
					return;
			}
			const item = Math.min(
				data.length - 1,
				Math.max(0, Math.round(Math.random() * data.length))
			);
			req.DO_NOT_CACHE = true;
			res.json(data[item]);
		}
	)

	/**
	 * Unified Search Endpoint
	 * ex: /v2/en/search?q=pikachu
	 * Searches across cards, sets, series, and sealed products
	 */
	.get("/:lang/search", async (req: CustomRequest, res): Promise<void> => {
		const { lang } = req.params;

		if (!checkLanguage(lang)) {
			sendError(Errors.LANGUAGE_INVALID, res, { lang });
			return;
		}

		const searchTerm = (req.query.q || req.query.search) as string;

		if (!searchTerm || typeof searchTerm !== 'string') {
			sendError(Errors.GENERAL, res, {
				message: "Search term required. Use ?q=<search_term> or ?search=<search_term>",
			});
			return;
		}

		try {
			// Search all categories in parallel (cards disabled - use /v2/products instead)
			const [sets, series, sealedProducts] = await Promise.all([
				findSets(lang, { q: searchTerm }),
				findSeries(lang, { q: searchTerm }),
				findSealedProducts(lang, { q: searchTerm }),
			]);

			const results = {
				query: searchTerm,
				results: {
					// cards: cards.map(toBrief),
					sets: sets.map(setToBrief),
					series: series.map(serieToBrief),
					sealedProducts: sealedProducts.map(sealedProductToBrief),
				},
				counts: {
					// cards: cards.length,
					sets: sets.length,
					series: series.length,
					sealedProducts: sealedProducts.length,
					total: sets.length + series.length + sealedProducts.length,
				},
			};

			res.json(results);
		} catch (error) {
			console.error("Search error:", error);
			sendError(Errors.GENERAL, res, {
				message: "Search failed",
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	})

	/**
	 * Listing Endpoint
	 * ex: /v2/en/cards
	 */
	.get("/:lang/:endpoint", async (req: CustomRequest, res): Promise<void> => {
		let { lang, endpoint } = req.params;

		const query: Query = req.advQuery ?? {};

		if (endpoint.endsWith(".json")) {
			endpoint = endpoint.replace(".json", "");
		}

		if (!checkLanguage(lang)) {
			sendError(Errors.LANGUAGE_INVALID, res, { lang });
			return;
		}

		let result: unknown;

		switch (endpoint) {
			// case "cards": {
			// 	if ("set" in query) {
			// 		const tmp = query.set;
			// 		delete query.set;
			// 		query.$or = [
			// 			{
			// 				"set.id": tmp,
			// 			},
			// 			{
			// 				"set.name": tmp,
			// 			},
			// 		];
			// 	}
			// 	result = (await findCards(lang, query)).map(toBrief);
			// 	break;
			// }

			case "sets": {
				if ("serie" in query) {
					const tmp = query.serie;
					delete query.serie;
					query.$or = [
						{
							"serie.id": tmp,
						},
						{
							"serie.name": tmp,
						},
					];
				}
				result = (await findSets(lang, query)).map(setToBrief);
				break;
			}
			case "series":
				result = (await findSeries(lang, query)).map(serieToBrief);
				break;
			case "sealed-products":
			case "sealed":
			case "products":
				result = (await findSealedProducts(lang, query)).map(sealedProductToBrief);
				break;
			// case "categories":
			// case "energy-types":
			// case "hp":
			// case "illustrators":
			// case "rarities":
			// case "regulation-marks":
			// case "retreats":
			// case "stages":
			// case "suffixes":
			// case "trainer-types":
			// 	// DISABLED - Uses old cards database
			// 	result = unique(
			// 		(await getAllCards(lang))
			// 			.map((c) => c[endpointToField[endpoint]] as string)
			// 			.filter((c) => c)
			// 	).sort(betterSorter);
			// 	break;
			// case "types":
			// case "dex-ids":
			// 	// DISABLED - Uses old cards database
			// 	result = unique(
			// 		(await getAllCards(lang))
			// 			.map(
			// 				(c) => c[endpointToField[endpoint]] as Array<string>
			// 			)
			// 			.filter((c) => c)
			// 			.reduce((p, c) => [...p, ...c], [] as Array<string>)
			// 	).sort(betterSorter);
			// 	break;
			// case "variants":
			// 	// DISABLED - Uses old cards database
			// 	result = unique(
			// 		(await getAllCards(lang))
			// 			.map(
			// 				(c) => objectKeys(c.variants ?? {}) as Array<string>
			// 			)
			// 			.filter((c) => c)
			// 			.reduce((p, c) => [...p, ...c], [] as Array<string>)
			// 	).sort();
			// 	break;
			default:
				sendError(Errors.NOT_FOUND, res, { endpoint });
				return;
		}

		if (!result) {
			sendError(Errors.NOT_FOUND, res);
		}
		res.json(result);
	})

	// /**
	//  * Card by set/localId format
	//  * ex: /v2/en/cards/dp7/1 (returns card data)
	//  * DISABLED - Use /v2/products instead
	//  */
	// .get(
	// 	"/:lang/cards/:setId/:localId",
	// 	async (req: CustomRequest, res, next: NextFunction) => {
	// 		const { lang, setId, localId } = req.params;

	// 		if (!checkLanguage(lang)) {
	// 			return sendError(Errors.LANGUAGE_INVALID, res, { lang });
	// 		}

	// 		if (localId.toLowerCase() === "history") {
	// 			next();
	// 			return;
	// 		}

	// 		// Convert set/localId to global card ID
	// 		const cardId = `${setId}-${localId}`;
	// 		const result = await getCardById(lang, cardId);
	// 		if (!result) {
	// 			return sendError(Errors.NOT_FOUND, res);
	// 		}
	// 		return res.json(result);
	// 	}
	// )

	// /**
	//  * Card history by set/localId format
	//  * ex: /v2/en/cards/dp7/1/history?range=monthly (returns price history)
	//  * DISABLED - Use /v2/products instead
	//  */
	// .get(
	// 	"/:lang/cards/:setId/:localId/:action",
	// 	async (req: CustomRequest, res) => {
	// 		const { lang, setId, localId, action } = req.params;

	// 		if (!checkLanguage(lang)) {
	// 			return sendError(Errors.LANGUAGE_INVALID, res, { lang });
	// 		}

	// 		if (action === "history") {
	// 			const range = (req.query.range as string) || "yearly";
	// 			const variant = (req.query.variant as string) || "normal";
	// 			const productId = req.query.productId
	// 				? parseInt(req.query.productId as string, 10)
	// 				: undefined;
	// 			// Convert set/localId to global card ID
	// 			const cardId = `${setId}-${localId}`;
	// 			const result = await getCardPriceHistory(
	// 				lang,
	// 				cardId,
	// 				range,
	// 				productId,
	// 				variant
	// 			);
	// 			return res.json(result);
	// 		}

	// 		return sendError(Errors.NOT_FOUND, res, { action });
	// 	}
	// )

	// /**
	//  * Card history by global ID format
	//  * ex: /v2/en/cards/lc-1/history?range=monthly
	//  * DISABLED - Use /v2/products instead
	//  */
	// .get("/:lang/cards/:cardId/history", async (req: CustomRequest, res) => {
	// 	const { lang, cardId } = req.params;

	// 	if (!checkLanguage(lang)) {
	// 		return sendError(Errors.LANGUAGE_INVALID, res, { lang });
	// 	}

	// 	const range = (req.query.range as string) || "yearly";
	// 	const variant = (req.query.variant as string) || "normal";
	// 	const productId = req.query.productId
	// 		? parseInt(req.query.productId as string, 10)
	// 		: undefined;
	// 	const result = await getCardPriceHistory(
	// 		lang,
	// 		cardId,
	// 		range,
	// 		productId,
	// 		variant
	// 	);
	// 	return res.json(result);
	// })

	/**
	 * Listing Endpoint
	 * ex: /v2/en/cards/base1-1
	 */
	.get("/:lang/:endpoint/:id", async (req: CustomRequest, res) => {
		// console.time('request')
		let { id, lang, endpoint } = req.params;

		if (id.endsWith(".json")) {
			id = id.replace(".json", "");
		}

		id = id.toLowerCase();

		if (!checkLanguage(lang)) {
			return sendError(Errors.LANGUAGE_INVALID, res, { lang });
		}

		let result: unknown;
		switch (endpoint) {
			// case "cards":
			// 	// DISABLED - Use /v2/products instead
			// 	// console.time('card')
			// 	result = await getCardById(lang, id);
			// 	if (!result) {
			// 		result = await findOneCard(lang, { name: id });
			// 	}
			// 	// console.timeEnd('card')
			// 	break;

			case "sets":
				result = await findOneSet(lang, { id });
				if (!result) {
					result = await findOneSet(lang, { name: id });
				}
				break;

			case "series":
				result = await findOneSerie(lang, { id });
				if (!result) {
					result = await findOneSerie(lang, { name: id });
				}
				break;
			// case "dex-ids": {
			// 	// DISABLED - Uses old cards database
			// 	result = {
			// 		name: parseInt(id, 10),
			// 		cards: (
			// 			await findCards(lang, {
			// 				dexId: { $in: [parseInt(id, 10)] },
			// 			})
			// 		).map(toBrief),
			// 	};
			// 	break;
			// }
			case "sealed-products":
			case "sealed":
			case "products": {
				result = await getSealedProductById(lang, id);
				if (!result) {
					result = await findOneSealedProduct(lang, { id });
				}
				break;
			}
			default:
				// DISABLED - Uses old cards database
				// if (!endpointToField[endpoint]) {
				// 	break;
				// }
				// result = {
				// 	name: id,
				// 	cards: (
				// 		await findCards(lang, {
				// 			[endpointToField[endpoint]]: id,
				// 		})
				// 	).map(toBrief),
				// };
				break;
		}

		// console.timeEnd('request')
		if (!result) {
			sendError(Errors.NOT_FOUND, res);
			return;
		}
		return res.send(result);
	})

	/**
	 * sub id Endpoint (for the set endpoint only currently)
	 * ex: /v2/en/sets/base1/1
	 */
	.get("/:lang/:endpoint/:id/:subid", async (req: CustomRequest, res) => {
		let { id, lang, endpoint, subid } = req.params;

		if (subid.endsWith(".json")) {
			subid = subid.replace(".json", "");
		}

		id = id.toLowerCase();
		subid = subid.toLowerCase();

		if (!checkLanguage(lang)) {
			return sendError(Errors.LANGUAGE_INVALID, res, { lang });
		}

		let result: unknown;
		switch (endpoint) {
			// case "cards":
			// 	// DISABLED - Use /v2/products instead
			// 	if (subid === "skus") {
			// 		result = await listSKUs(getCompiledCard(lang, id));
			// 	} else if (subid === "history") {
			// 		// New history endpoint: /v2/en/cards/{cardId}/history?range=daily|monthly|yearly
			// 		const range = (req.query.range as string) || "yearly";
			// 		const productId = req.query.productId
			// 			? parseInt(req.query.productId as string, 10)
			// 			: undefined;
			// 		result = await getCardPriceHistory(
			// 			lang,
			// 			id,
			// 			range,
			// 			productId
			// 		);
			// 	}
			// 	break;
			// case "sets":
			// 	// DISABLED - Uses old cards database
			// 	// allow the dev to use a non prefixed value like `10` instead of `010` for newer sets
			// 	// @ts-expect-error normal behavior until the filtering is more fiable	 --- IGNORE ---
			// 	result = await findOneCard(lang, {
			// 		localId: { $or: [subid.padStart(3, "0"), subid] },
			// 		$or: [{ "set.id": id }, { "set.name": id }],
			// 	});
			// 	break;
		}
		if (!result) {
			return sendError(Errors.NOT_FOUND, res);
		}
		return res.send(result);
	})

	/**
	 * PriceCharting scraping endpoint
	 * Scrapes live eBay sales data from PriceCharting
	 */
	.get("/api/pricing/pricecharting/scrape", async (req: CustomRequest, res) => {
		try {
			const url = req.query.url as string;
			const cardId = req.query.cardId as string;
			const variantId = req.query.variantId as string;
			const forceRefresh = req.query.forceRefresh === 'true';

			if (!url) {
				return sendError(Errors.GENERAL, res, {
					message: "URL parameter is required",
					example: "/api/pricing/pricecharting/scrape?url=https://www.pricecharting.com/game/pokemon-base-set/charizard-holographic-rare"
				});
			}

			// Validate URL is from PriceCharting
			if (!url.includes('pricecharting.com')) {
				return sendError(Errors.GENERAL, res, {
					message: "URL must be from pricecharting.com",
					provided: url
				});
			}

			req.DO_NOT_CACHE = true; // Don't cache scraping results

			const result = await scrapePriceCharting({
				url,
				cardId,
				variantId,
				forceRefresh
			});

			res.json({
				success: true,
				data: result,
				scrapedAt: new Date().toISOString()
			});

		} catch (error) {
			console.error('PriceCharting scraping error:', error);
			sendError(Errors.GENERAL, res, {
				message: "Failed to scrape PriceCharting data",
				error: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	})

	/**
	 * Get recent eBay sales from PriceCharting data
	 */
	.get("/api/pricing/pricecharting/recent-sales", async (req: CustomRequest, res) => {
		try {
			const limit = parseInt(req.query.limit as string) || 50;

			const sales = await getRecentEBaySales(limit);

			res.json({
				success: true,
				data: sales,
				count: sales.length,
				limit
			});

		} catch (error) {
			console.error('Error fetching recent eBay sales:', error);
			sendError(Errors.GENERAL, res, {
				message: "Failed to fetch recent eBay sales",
				error: error instanceof Error ? error.message : 'Unknown error'
			});
		}
	});

/**
 * Get price history for a card from stored historical data
 */
const productLocationCache = new Map<
	number,
	{ category: string; setDir: string }
>();

/**
 * Map variant parameter to tcgcsv subTypeName format
 */
function variantToSubTypeName(variant: string): string {
	const mapping: Record<string, string> = {
		'normal': 'Normal',
		'holo': 'Holofoil',
		'holofoil': 'Holofoil',
		'reverse': 'Reverse Holofoil',
		'reverse-holofoil': 'Reverse Holofoil',
		'1st-edition-normal': '1st Edition Normal',
		'1st-edition-holofoil': '1st Edition Holofoil',
		'pokeball': 'Pokeball',
		'masterball': 'Master Ball',
	}

	return mapping[variant.toLowerCase()] || variant
}

async function getCardPriceHistory(
	lang: string,
	cardId: string,
	range: string = "yearly",
	productId?: number,
	variant: string = "normal"
) {
	try {
		const validRanges = ["daily", "monthly", "yearly"];
		if (!validRanges.includes(range)) {
			range = "yearly";
		}

		const daysBack = range === "daily" ? 30 : range === "yearly" ? 365 : 90;

		let card = await getCardById(lang, cardId);
		if (!card) {
			const parts = cardId.split("-");
			const setId = (parts[0] || "unknown").toLowerCase();
			const localId = parts[1] || "";
			card = {
				id: cardId,
				localId,
				name: cardId,
				set: { id: setId, name: setId },
			} as any;
		}

		// Automatically scrape PriceCharting data for this card
		let priceChartingData = null;
		try {
			const { default: urlMapper } = await import("../services/priceChartingMapper");

			// Generate PriceCharting URL for this card
			const urlMapping = urlMapper.generateUrl(card);

			if (urlMapping.confidence !== "low") {
				console.log(`🔍 Fetching PriceCharting HTML for ${cardId} (${urlMapping.confidence} confidence)`);
				const res = await fetch(urlMapping.url, {
					headers: { "User-Agent": "Mozilla/5.0 (compatible; TCGdex/1.0)" }
				});
				if (res.ok) {
					const html = await res.text();
					const cheerio = await import("cheerio");
					const $ = cheerio.load(html);

					// Parse eBay recent sold listings (best-effort)
					const eBaySales: Array<any> = [];
					$('tr, .recent-sale, .ebay-sale').each((_, el) => {
						const $el = $(el);
						const title = $el.find('.title, .item-title').text().trim();
						const priceText = $el.find('.price, .sale-price, .market, .value').first().text().trim();
						const dateText = $el.find('.date, .sold-date').text().trim();
						const ebayUrl = $el.find('a').attr('href') || '';

						if (title && priceText) {
							const priceMatch = priceText.replace(/[$,]/g, '').match(/(\d+\.?\d*)/);
							const price = priceMatch ? parseFloat(priceMatch[1]) : undefined;

							if (price) {
								const gradeMatch = `${title}`.match(/\b(PSA|BGS|CGC)\s*(\d+(?:\.\d)?)\b/i);
								const grade = gradeMatch ? gradeMatch[2] : undefined;
								const gradingCompany = gradeMatch ? gradeMatch[1].toUpperCase() : undefined;

								eBaySales.push({
									ebayCode: Buffer.from(`${ebayUrl}${dateText}${price}`).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16),
									ebayUrl,
									title,
									condition: '',
									grade,
									gradingCompany,
									price,
									currency: 'USD',
									soldDate: (() => {
										const d = new Date(dateText);
										return isNaN(d.getTime()) ? undefined : d.toISOString();
									})(),
								});
							}
						}
					});

					// Parse graded market table (best-effort)
					const gradedMarket: Array<any> = [];
					$('.graded-market tr, .psa-prices tr').each((_, row) => {
						const $row = $(row);
						const grade = $row.find('.grade').text().trim();
						const gradingCompany = $row.find('.company').text().trim() || 'PSA';
						const priceText = $row.find('.market, .price, .value').first().text().trim();
						const priceMatch = priceText.replace(/[$,]/g, '').match(/(\d+\.?\d*)/);
						const marketPrice = priceMatch ? parseFloat(priceMatch[1]) : undefined;

						if (grade) {
							gradedMarket.push({
								grade,
								gradingCompany,
								marketPrice,
								lowPrice: undefined,
								highPrice: undefined,
								salesCount: 0,
							});
						}
					});

					priceChartingData = {
						pcCode: urlMapping.url.split('/').pop() || '',
						pcUrl: urlMapping.url,
						cardName: typeof card.name === 'string' ? card.name : (card.name['en'] || Object.values(card.name)[0] || 'Unknown Card'),
						eBaySales,
						gradedMarket,
						lastUpdated: new Date().toISOString(),
					};
				}
			}
		} catch (error) {
			console.warn(`⚠️ Failed to scrape PriceCharting for ${cardId}:`, error);
			// Continue with TCGPlayer data only
		}

		if (!productId) {
			const compiledCard = await getCompiledCard(lang, cardId);
			if (compiledCard?.thirdParty?.tcgplayer) {
				const tcgplayerData = compiledCard.thirdParty.tcgplayer;

				// Handle new structure: object with variant keys
				if (typeof tcgplayerData === 'object' && !Array.isArray(tcgplayerData)) {
					// Try the requested variant first, then fall back to normal, then any available
					productId = tcgplayerData[variant] || tcgplayerData.normal || Object.values(tcgplayerData)[0];
				}
				// Handle old structure: single number
				else if (typeof tcgplayerData === 'number') {
					productId = tcgplayerData;
				}
			}

			if (!productId) {
				return {
					error: "Product ID required. Pass ?productId=<id> or ensure card has TCGPlayer mapping",
					cardId,
					range,
					availableVariants: compiledCard?.thirdParty?.tcgplayer && typeof compiledCard.thirdParty.tcgplayer === 'object'
						? Object.keys(compiledCard.thirdParty.tcgplayer)
						: undefined
				};
			}
		}

		const resolvedProductId = productId as number;

		const tcgcsvBasePath = process.env.TCGCSV_PATH || path.resolve(process.cwd(), "../tcgcsv");
		const priceHistoryPath = path.join(tcgcsvBasePath, "price-history");
		const dateFolders = (await fs.readdir(priceHistoryPath))
			.filter((folder) => /^\d{4}-\d{2}-\d{2}$/.test(folder))
			.sort()
			.reverse();

		if (dateFolders.length === 0) {
			return {
				error: "Historical data not available",
				cardId,
				productId: resolvedProductId,
				range,
			};
		}

		const location = await findProductLocation(
			resolvedProductId,
			dateFolders,
			priceHistoryPath
		);

		if (!location) {
			return {
				error: "Product not found in historical database",
				cardId,
				productId: resolvedProductId,
				range,
			};
		}

		const history: Array<{
			date: string;
			price: number;
			low: number;
			high: number;
			market: number;
			currency: string;
		}> = [];

		const datesToLoad = dateFolders.slice(0, daysBack);

		for (const dateFolder of datesToLoad) {
			const pricesFile = path.join(
				priceHistoryPath,
				dateFolder,
				location.category,
				location.setDir,
				"prices"
			);

			try {
				const fileContent = await fs.readFile(pricesFile, "utf8");
				const data = JSON.parse(fileContent);
				if (data?.results && Array.isArray(data.results)) {
					// For old structure cards, the same product ID can have multiple entries
					// with different subTypeName values (Normal, Reverse Holofoil, etc.)
					// So we need to filter by both productId AND subTypeName
					const expectedSubTypeName = variantToSubTypeName(variant);

					// First try to find exact match by productId and subTypeName
					let productEntry = data.results.find(
						(entry: any) =>
							entry.productId === resolvedProductId &&
							entry.subTypeName === expectedSubTypeName
					);

					// Fallback: if no exact match, try just productId (for new structure or single variant cards)
					if (!productEntry) {
						productEntry = data.results.find(
							(entry: any) => entry.productId === resolvedProductId
						);
					}

					if (productEntry) {
						const price =
							productEntry.marketPrice ||
							productEntry.midPrice ||
							0;
						if (price > 0) {
							history.push({
								date: dateFolder,
								price,
								low: productEntry.lowPrice || price,
								high: productEntry.highPrice || price,
								market: productEntry.marketPrice || price,
								currency: "USD",
							});
						}
					}
				}
			} catch (err) {
				// ignore missing files for some dates
			}
		}

		if (history.length === 0) {
			// Try to use PriceCharting eBay sales as history fallback
			if (priceChartingData && priceChartingData.eBaySales.length > 0) {
				const ebayHistory = priceChartingData.eBaySales
					.filter(sale => sale.soldDate)
					.map(sale => ({
						date: sale.soldDate.split('T')[0], // YYYY-MM-DD
						price: sale.price,
						low: sale.price,
						high: sale.price,
						market: sale.price,
						currency: sale.currency,
					}))
					.sort((a, b) => a.date.localeCompare(b.date));

				if (ebayHistory.length > 0) {
					return {
						cardId,
						productId: resolvedProductId,
						range,
						dataPoints: ebayHistory.length,
						lastUpdated: new Date().toISOString(),
						history: ebayHistory,
						source: "pricecharting",
						set: {
							id: card.set.id,
							name: typeof card.set.name === 'string' ? card.set.name : (card.set.name[lang] || card.set.name.en || Object.values(card.set.name)[0] || 'Unknown'),
						},
						priceCharting: {
							url: priceChartingData.pcUrl,
							lastScraped: priceChartingData.lastUpdated,
							gradedMarket: priceChartingData.gradedMarket,
							recentSales: priceChartingData.eBaySales.slice(0, 10),
						},
						sold_listings: (() => {
							const out: Record<string, any[]> = { ungraded: [] };
							if (priceChartingData && Array.isArray(priceChartingData.eBaySales)) {
								for (const sale of priceChartingData.eBaySales) {
									if (sale?.grade && sale?.gradingCompany) {
										const key = `${String(sale.gradingCompany).toLowerCase()} ${String(sale.grade)}`;
										(out[key] ||= []).push(sale);
									} else {
										out.ungraded.push(sale);
									}
								}
							}
							return out;
						})(),
					};
				}
			}

			try {
				const realTimeData = await fetchRealTimeHistory(
					resolvedProductId,
					range
				);
				if (
					realTimeData &&
					realTimeData.history &&
					realTimeData.history.length > 0
				) {
					return {
						cardId,
						productId: resolvedProductId,
						range,
						dataPoints: realTimeData.history.length,
						lastUpdated: new Date().toISOString(),
						history: realTimeData.history,
						source: "realtime",
						set: {
							id: card.set.id,
							name: typeof card.set.name === 'string' ? card.set.name : (card.set.name[lang] || card.set.name.en || Object.values(card.set.name)[0] || 'Unknown'),
						},
					};
				}
			} catch (error) {
				console.error(
					`Real-time history fallback failed for product ${resolvedProductId}:`,
					error
				);
			}

			return {
				error: "Historical price data not available",
				cardId,
				productId: resolvedProductId,
				range,
			};
		}

		const result: any = {
			cardId,
			productId: resolvedProductId,
			range,
			dataPoints: history.length,
			lastUpdated: new Date().toISOString(),
			history: history.sort((a, b) => a.date.localeCompare(b.date)),
			source: "tcgcsv",
			set: {
				id: card.set.id,
				name: typeof card.set.name === 'string' ? card.set.name : (card.set.name[lang] || card.set.name.en || Object.values(card.set.name)[0] || 'Unknown'),
			},
			sold_listings: (() => {
				const out: Record<string, any[]> = { ungraded: [] };
				if (priceChartingData && Array.isArray(priceChartingData.eBaySales)) {
					for (const sale of priceChartingData.eBaySales) {
						if (sale?.grade && sale?.gradingCompany) {
							const key = `${String(sale.gradingCompany).toLowerCase()} ${String(sale.grade)}`;
							(out[key] ||= []).push(sale);
						} else {
							out.ungraded.push(sale);
						}
					}
				}
				return out;
			})(),
		};

		// Include PriceCharting data if available
		if (priceChartingData) {
			result.priceCharting = {
				url: priceChartingData.pcUrl,
				lastScraped: priceChartingData.lastUpdated,
				gradedMarket: priceChartingData.gradedMarket,
				recentSales: priceChartingData.eBaySales.slice(0, 10), // Include last 10 sales
			};
		}

		return result;
	} catch (error) {
		console.error(`Error getting price history for ${cardId}:`, error);
		return {
			error: "Internal server error",
			cardId,
			range,
		};
	}
}

/**
 * Fetch real-time price history from TCGPlayer (fallback)
 */
async function fetchRealTimeHistory(productId: number, range: string) {
	const days = range === "daily" ? 30 : range === "yearly" ? 365 : 90;
	const apiRange = days <= 30 ? "week" : days <= 90 ? "month" : "quarter";

	try {
		const response = await fetch(
			`https://infinite-api.tcgplayer.com/price/history/${productId}/detailed?range=${apiRange}`,
			{
				headers: {
					"User-Agent": "TCGdex-Server/1.0",
					Accept: "application/json",
				},
			}
		);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data = (await response.json()) as Array<any>;

		// Transform to our format
		const history = data
			.map((point: any) => ({
				date: point.date,
				price: point.avgPrice || point.marketPrice || 0,
				low: point.loPrice,
				high: point.hiPrice,
				market: point.marketPrice,
				currency: "USD",
			}))
			.filter((point: any) => point.price > 0);

		return { history };
	} catch (error) {
		console.error(
			`Error fetching real-time history for product ${productId}:`,
			error
		);
		throw error;
	}
}

async function findProductLocation(
	productId: number,
	dateFolders: Array<string>,
	basePath: string
) {
	if (productLocationCache.has(productId)) {
		return productLocationCache.get(productId)!;
	}

	const maxDatesToScan = 10;
	const foldersToScan = dateFolders.slice(0, maxDatesToScan);

	for (const dateFolder of foldersToScan) {
		const datePath = path.join(basePath, dateFolder);
		let categoryDirs: Array<string> = [];
		try {
			categoryDirs = await fs.readdir(datePath);
		} catch {
			continue;
		}

		for (const category of categoryDirs) {
			const categoryPath = path.join(datePath, category);
			let setDirs: Array<string> = [];
			try {
				setDirs = await fs.readdir(categoryPath);
			} catch {
				continue;
			}

			for (const setDir of setDirs) {
				const pricesFile = path.join(categoryPath, setDir, "prices");
				let fileContent: string;
				try {
					fileContent = await fs.readFile(pricesFile, "utf8");
				} catch {
					continue;
				}

				try {
					const data = JSON.parse(fileContent);
					if (data?.results && Array.isArray(data.results)) {
						if (
							data.results.some(
								(entry: any) => entry.productId === productId
							)
						) {
							const location = { category, setDir };
							productLocationCache.set(productId, location);
							return location;
						}
					}
				} catch {
					continue;
				}
			}
		}
	}

	return null;
}


export default server;
