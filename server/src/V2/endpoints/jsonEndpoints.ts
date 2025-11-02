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
import { listSKUs } from "../../libs/providers/tcgplayer";
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

	// .get('/cache/performance', (req, res) => {
	// 	res.json(apicache.getPerformance())
	// })

	// // add route to display cache index
	// .get('/cache/index', (req, res) => {
	// 	res.json(apicache.getIndex())
	// })

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
				case "card":
					data = await findCards(lang, query);
					break;
				case "set":
					data = await findSets(lang, query);
					break;
				case "serie":
					data = await findSeries(lang, query);
					break;
				default:
					sendError(Errors.NOT_FOUND, res, {
						details: `You can only run random requests on "card", "set" or "serie" while you did on "${what}"`,
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
			case "cards": {
				if ("set" in query) {
					const tmp = query.set;
					delete query.set;
					query.$or = [
						{
							"set.id": tmp,
						},
						{
							"set.name": tmp,
						},
					];
				}
				result = (await findCards(lang, query)).map(toBrief);
				break;
			}

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
			case "categories":
			case "energy-types":
			case "hp":
			case "illustrators":
			case "rarities":
			case "regulation-marks":
			case "retreats":
			case "stages":
			case "suffixes":
			case "trainer-types":
				result = unique(
					(await getAllCards(lang))
						.map((c) => c[endpointToField[endpoint]] as string)
						.filter((c) => c)
				).sort(betterSorter);
				break;
			case "types":
			case "dex-ids":
				result = unique(
					(await getAllCards(lang))
						.map(
							(c) => c[endpointToField[endpoint]] as Array<string>
						)
						.filter((c) => c)
						.reduce((p, c) => [...p, ...c], [] as Array<string>)
				).sort(betterSorter);
				break;
			case "variants":
				result = unique(
					(await getAllCards(lang))
						.map(
							(c) => objectKeys(c.variants ?? {}) as Array<string>
						)
						.filter((c) => c)
						.reduce((p, c) => [...p, ...c], [] as Array<string>)
				).sort();
				break;
			default:
				sendError(Errors.NOT_FOUND, res, { endpoint });
				return;
		}

		if (!result) {
			sendError(Errors.NOT_FOUND, res);
		}
		res.json(result);
	})

	/**
	 * Card by set/localId format
	 * ex: /v2/en/cards/dp7/1 (returns card data)
	 */
	.get(
		"/:lang/cards/:setId/:localId",
		async (req: CustomRequest, res, next: NextFunction) => {
			const { lang, setId, localId } = req.params;

			if (!checkLanguage(lang)) {
				return sendError(Errors.LANGUAGE_INVALID, res, { lang });
			}

			if (localId.toLowerCase() === "history") {
				next();
				return;
			}

			// Convert set/localId to global card ID
			const cardId = `${setId}-${localId}`;
			const result = await getCardById(lang, cardId);
			if (!result) {
				return sendError(Errors.NOT_FOUND, res);
			}
			return res.json(result);
		}
	)

	/**
	 * Card history by set/localId format
	 * ex: /v2/en/cards/dp7/1/history?range=monthly (returns price history)
	 */
	.get(
		"/:lang/cards/:setId/:localId/:action",
		async (req: CustomRequest, res) => {
			const { lang, setId, localId, action } = req.params;

			if (!checkLanguage(lang)) {
				return sendError(Errors.LANGUAGE_INVALID, res, { lang });
			}

			if (action === "history") {
				const range = (req.query.range as string) || "monthly";
				const productId = req.query.productId
					? parseInt(req.query.productId as string, 10)
					: undefined;
				// Convert set/localId to global card ID
				const cardId = `${setId}-${localId}`;
				const result = await getCardPriceHistory(
					lang,
					cardId,
					range,
					productId
				);
				return res.json(result);
			}

			return sendError(Errors.NOT_FOUND, res, { action });
		}
	)

	/**
	 * Card history by global ID format
	 * ex: /v2/en/cards/lc-1/history?range=monthly
	 */
	.get("/:lang/cards/:cardId/history", async (req: CustomRequest, res) => {
		const { lang, cardId } = req.params;

		if (!checkLanguage(lang)) {
			return sendError(Errors.LANGUAGE_INVALID, res, { lang });
		}

		const range = (req.query.range as string) || "monthly";
		const productId = req.query.productId
			? parseInt(req.query.productId as string, 10)
			: undefined;
		const result = await getCardPriceHistory(
			lang,
			cardId,
			range,
			productId
		);
		return res.json(result);
	})

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
			case "cards":
				// console.time('card')
				result = await getCardById(lang, id);
				if (!result) {
					result = await findOneCard(lang, { name: id });
				}
				// console.timeEnd('card')
				break;

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
			case "dex-ids": {
				result = {
					name: parseInt(id, 10),
					cards: (
						await findCards(lang, {
							dexId: { $in: [parseInt(id, 10)] },
						})
					).map(toBrief),
				};
				break;
			}
			default:
				if (!endpointToField[endpoint]) {
					break;
				}
				result = {
					name: id,
					cards: (
						await findCards(lang, {
							[endpointToField[endpoint]]: id,
						})
					).map(toBrief),
				};
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
			case "cards":
				if (subid === "skus") {
					result = await listSKUs(getCompiledCard(lang, id));
				} else if (subid === "history") {
					// New history endpoint: /v2/en/cards/{cardId}/history?range=daily|monthly|yearly
					const range = (req.query.range as string) || "monthly";
					const productId = req.query.productId
						? parseInt(req.query.productId as string, 10)
						: undefined;
					result = await getCardPriceHistory(
						lang,
						id,
						range,
						productId
					);
				}
				break;
			case "sets":
				// allow the dev to use a non prefixed value like `10` instead of `010` for newer sets
				// @ts-expect-error normal behavior until the filtering is more fiable	 --- IGNORE ---
				result = await findOneCard(lang, {
					localId: { $or: [subid.padStart(3, "0"), subid] },
					$or: [{ "set.id": id }, { "set.name": id }],
				});
				break;
		}
		if (!result) {
			return sendError(Errors.NOT_FOUND, res);
		}
		return res.send(result);
	});

/**
 * Get price history for a card from stored historical data
 */
const productLocationCache = new Map<
	number,
	{ category: string; setDir: string }
>();

async function getCardPriceHistory(
	lang: string,
	cardId: string,
	range: string = "monthly",
	productId?: number
) {
	try {
		const validRanges = ["daily", "monthly", "yearly"];
		if (!validRanges.includes(range)) {
			range = "monthly";
		}

		const daysBack = range === "daily" ? 30 : range === "yearly" ? 365 : 90;

		const card = await getCardById(lang, cardId);
		if (!card) {
			return {
				error: "Card not found",
				cardId,
				range,
			};
		}

		if (!productId) {
			const compiledCard = getCompiledCard(lang, cardId);
			if (compiledCard?.thirdParty?.tcgplayer) {
				productId = compiledCard.thirdParty.tcgplayer;
			} else {
				return {
					error: "Product ID required. Pass ?productId=<id> or ensure card has TCGPlayer mapping",
					cardId,
					range,
				};
			}
		}

		const resolvedProductId = productId as number;

		const tcgcsvPath = path.resolve(process.cwd(), "../tcgcsv");
		const dateFolders = (await fs.readdir(tcgcsvPath))
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
			tcgcsvPath
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
				tcgcsvPath,
				dateFolder,
				location.category,
				location.setDir,
				"prices"
			);

			try {
				const fileContent = await fs.readFile(pricesFile, "utf8");
				const data = JSON.parse(fileContent);
				if (data?.results && Array.isArray(data.results)) {
					const productEntry = data.results.find(
						(entry: any) => entry.productId === resolvedProductId
					);
					if (productEntry) {
						history.push({
							date: dateFolder,
							price:
								productEntry.marketPrice ||
								productEntry.midPrice ||
								0,
							low: productEntry.lowPrice || 0,
							high: productEntry.highPrice || 0,
							market: productEntry.marketPrice || 0,
							currency: "USD",
						});
					}
				}
			} catch (err) {
				// ignore missing files for some dates
			}
		}

		if (history.length === 0) {
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

		return {
			cardId,
			productId: resolvedProductId,
			range,
			dataPoints: history.length,
			lastUpdated: new Date().toISOString(),
			history: history.sort((a, b) => a.date.localeCompare(b.date)),
			source: "tcgcsv",
		};
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
	const days = range === "daily" ? 30 : range === "monthly" ? 90 : 365;
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
