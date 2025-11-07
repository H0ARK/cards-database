import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { pool } from '../../db';

interface ScrapedPriceChartingData {
  pcCode: string;
  pcUrl: string;
  cardName: string;
  eBaySales: Array<{
    ebayCode: string;
    ebayUrl: string;
    title: string;
    condition: string;
    grade?: string;
    gradingCompany?: string;
    price: number;
    currency: string;
    shipping?: number;
    soldDate?: string;
    seller?: string;
    location?: string;
  }>;
  gradedMarket: Array<{
    grade: string;
    gradingCompany: string;
    marketPrice?: number;
    lowPrice?: number;
    highPrice?: number;
    salesCount: number;
  }>;
  lastUpdated: string;
}

interface ScrapeOptions {
  url: string;
  cardId?: string;
  variantId?: string;
  forceRefresh?: boolean;
}

/**
 * Scrape PriceCharting data for a card
 */
export async function scrapePriceCharting(options: ScrapeOptions): Promise<ScrapedPriceChartingData> {
  const { url, cardId, variantId, forceRefresh = false } = options;

  // Check if we have recent data (unless force refresh)
  if (!forceRefresh && cardId) {
    const existingData = await getExistingData(cardId, variantId);
    if (existingData && isDataRecent(existingData.lastUpdated)) {
      return existingData;
    }
  }

  // Launch browser and scrape
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Set user agent to avoid bot detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // Navigate to the URL
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get the HTML content
    const content = await page.content();

    // Parse with Cheerio
    const $ = cheerio.load(content);

    // Extract data
    const scrapedData = await parsePriceChartingData($, url);

    // Store in database
    await storeScrapedData(scrapedData, cardId, variantId);

    return scrapedData;

  } finally {
    await browser.close();
  }
}

/**
 * Parse PriceCharting HTML data
 */
async function parsePriceChartingData($: cheerio.CheerioAPI, url: string): Promise<ScrapedPriceChartingData> {
  // Extract PC code from URL
  const pcCode = extractPcCode(url);

  // Extract card name
  const cardName = $('h1').first().text().trim() || 'Unknown Card';

  // Extract eBay sales data
  const eBaySales = extractEBaySales($);

  // Extract graded market data
  const gradedMarket = extractGradedMarket($);

  return {
    pcCode,
    pcUrl: url,
    cardName,
    eBaySales,
    gradedMarket,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Extract PC code from URL
 */
function extractPcCode(url: string): string {
  // PriceCharting URLs typically end with the PC code
  const match = url.match(/\/(\d+)$/);
  return match ? match[1] : url.split('/').pop() || 'unknown';
}

/**
 * Extract eBay sales data from the page
 */
function extractEBaySales($: cheerio.CheerioAPI): ScrapedPriceChartingData['eBaySales'] {
  const sales: ScrapedPriceChartingData['eBaySales'] = [];

  // PriceCharting typically has eBay sales in tables or specific sections
  // This is a simplified extraction - may need adjustment based on actual HTML structure

  $('.ebay-sale, .recent-sale, tr').each((_, element) => {
    const $el = $(element);

    // Extract sale data - adjust selectors based on actual HTML
    const title = $el.find('.title, .item-title').text().trim();
    const priceText = $el.find('.price, .sale-price').text().trim();
    const condition = $el.find('.condition, .card-condition').text().trim();
    const soldDate = $el.find('.date, .sold-date').text().trim();
    const seller = $el.find('.seller').text().trim();
    const location = $el.find('.location').text().trim();
    const ebayUrl = $el.find('a').attr('href') || '';

    // Extract grade information
    const gradeMatch = condition.match(/(PSA|BGS|CGC)\s*(\d+\.?\d*)/i);
    const grade = gradeMatch ? gradeMatch[2] : undefined;
    const gradingCompany = gradeMatch ? gradeMatch[1].toUpperCase() : undefined;

    // Parse price
    const price = parsePrice(priceText);

    if (price && title) {
      // Generate unique eBay code
      const ebayCode = generateEBayCode(ebayUrl, soldDate, price);

      sales.push({
        ebayCode,
        ebayUrl,
        title,
        condition,
        grade,
        gradingCompany,
        price,
        currency: 'USD',
        soldDate: parseSoldDate(soldDate),
        seller: seller || undefined,
        location: location || undefined
      });
    }
  });

  return sales;
}

/**
 * Extract graded market data
 */
function extractGradedMarket($: cheerio.CheerioAPI): ScrapedPriceChartingData['gradedMarket'] {
  const graded: ScrapedPriceChartingData['gradedMarket'] = [];

  // Look for graded market sections
  $('.graded-market, .psa-prices, .grading-section').each((_, element) => {
    const $el = $(element);

    $el.find('tr, .grade-row').each((_, row) => {
      const $row = $(row);

      const grade = $row.find('.grade').text().trim();
      const gradingCompany = $row.find('.company').text().trim() || 'PSA'; // Default to PSA
      const marketPrice = parsePrice($row.find('.market, .price').text().trim());
      const lowPrice = parsePrice($row.find('.low').text().trim());
      const highPrice = parsePrice($row.find('.high').text().trim());
      const salesCountText = $row.find('.sales, .count').text().trim();
      const salesCount = parseInt(salesCountText.replace(/\D/g, '')) || 0;

      if (grade) {
        graded.push({
          grade,
          gradingCompany,
          marketPrice,
          lowPrice,
          highPrice,
          salesCount
        });
      }
    });
  });

  return graded;
}

/**
 * Parse price string to number
 */
function parsePrice(priceText: string): number | undefined {
  if (!priceText) return undefined;

  // Remove currency symbols and extra text
  const cleaned = priceText.replace(/[$,]/g, '').trim();
  const match = cleaned.match(/(\d+\.?\d*)/);

  return match ? parseFloat(match[1]) : undefined;
}

/**
 * Parse sold date string
 */
function parseSoldDate(dateText: string): string | undefined {
  if (!dateText) return undefined;

  // Try to parse various date formats
  // This is simplified - may need more robust parsing
  try {
    const date = new Date(dateText);
    return isNaN(date.getTime()) ? undefined : date.toISOString();
  } catch {
    return undefined;
  }
}

/**
 * Generate unique eBay code for a sale
 */
function generateEBayCode(ebayUrl: string, soldDate: string, price: number): string {
  // Create a unique code based on URL, date, and price
  const hash = Buffer.from(`${ebayUrl}${soldDate}${price}`).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  return `ebay_${hash}`;
}

/**
 * Check if existing data is recent (within last hour)
 */
function isDataRecent(lastScraped: string): boolean {
  const scrapedDate = new Date(lastScraped);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return scrapedDate > oneHourAgo;
}

/**
 * Get existing scraped data from database
 */
async function getExistingData(cardId?: string, variantId?: string): Promise<ScrapedPriceChartingData | null> {
  if (!cardId && !variantId) return null;

  try {
    const query = `
      SELECT
        pcd.*,
        COALESCE(
          json_agg(
            json_build_object(
              'ebayCode', pes.ebay_code,
              'ebayUrl', pes.ebay_url,
              'title', pes.title,
              'condition', pes.condition,
              'grade', pes.grade,
              'gradingCompany', pes.grading_company,
              'price', pes.price,
              'currency', pes.currency,
              'shipping', pes.shipping,
              'soldDate', pes.sold_date,
              'seller', pes.seller,
              'location', pes.location
            )
          ) FILTER (WHERE pes.id IS NOT NULL),
          '[]'::json
        ) as ebay_sales,
        COALESCE(
          json_agg(
            json_build_object(
              'grade', pgm.grade,
              'gradingCompany', pgm.grading_company,
              'marketPrice', pgm.market_price,
              'lowPrice', pgm.low_price,
              'highPrice', pgm.high_price,
              'salesCount', pgm.sales_count
            )
          ) FILTER (WHERE pgm.id IS NOT NULL),
          '[]'::json
        ) as graded_market
      FROM pricecharting_data pcd
      LEFT JOIN pricecharting_ebay_sales pes ON pcd.id = pes.pc_data_id
      LEFT JOIN pricecharting_graded_market pgm ON pcd.id = pgm.pc_data_id
      WHERE ${cardId ? 'pcd.card_id = $1' : 'pcd.variant_id = $1'}
      GROUP BY pcd.id
      ORDER BY pcd.last_scraped DESC
      LIMIT 1
    `;

    const result = await pool.query(query, [cardId || variantId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      pcCode: row.pc_code,
      pcUrl: row.pc_url,
      cardName: row.scraped_data?.cardName || 'Unknown Card',
      eBaySales: row.ebay_sales || [],
      gradedMarket: row.graded_market || [],
      lastUpdated: row.last_scraped
    };

  } catch (error) {
    console.error('Error fetching existing PriceCharting data:', error);
    return null;
  }
}

/**
 * Store scraped data in database
 */
async function storeScrapedData(
  data: ScrapedPriceChartingData,
  cardId?: string,
  variantId?: string
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Insert or update main PriceCharting data
    const pcDataQuery = `
      INSERT INTO pricecharting_data (card_id, variant_id, pc_code, pc_url, scraped_data, last_scraped)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (pc_code)
      DO UPDATE SET
        scraped_data = EXCLUDED.scraped_data,
        last_scraped = NOW()
      RETURNING id
    `;

    const pcDataResult = await client.query(pcDataQuery, [
      cardId || null,
      variantId || null,
      data.pcCode,
      data.pcUrl,
      JSON.stringify(data)
    ]);

    const pcDataId = pcDataResult.rows[0].id;

    // Clear existing eBay sales for this PC data
    await client.query('DELETE FROM pricecharting_ebay_sales WHERE pc_data_id = $1', [pcDataId]);

    // Insert eBay sales
    for (const sale of data.eBaySales) {
      await client.query(`
        INSERT INTO pricecharting_ebay_sales (
          pc_data_id, ebay_code, ebay_url, title, condition, grade, grading_company,
          price, currency, shipping, sold_date, seller, location
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        pcDataId,
        sale.ebayCode,
        sale.ebayUrl,
        sale.title,
        sale.condition,
        sale.grade,
        sale.gradingCompany,
        sale.price,
        sale.currency,
        sale.shipping,
        sale.soldDate,
        sale.seller,
        sale.location
      ]);
    }

    // Clear existing graded market data
    await client.query('DELETE FROM pricecharting_graded_market WHERE pc_data_id = $1', [pcDataId]);

    // Insert graded market data
    for (const graded of data.gradedMarket) {
      await client.query(`
        INSERT INTO pricecharting_graded_market (
          pc_data_id, grade, grading_company, market_price, low_price, high_price, sales_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        pcDataId,
        graded.grade,
        graded.gradingCompany,
        graded.marketPrice,
        graded.lowPrice,
        graded.highPrice,
        graded.salesCount
      ]);
    }

    await client.query('COMMIT');

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get PriceCharting data by PC code
 */
export async function getPriceChartingData(pcCode: string): Promise<ScrapedPriceChartingData | null> {
  return getExistingData(pcCode);
}

/**
 * Get all recent eBay sales
 */
export async function getRecentEBaySales(limit: number = 50): Promise<any[]> {
  try {
    const query = `
      SELECT * FROM ebay_sales_recent
      ORDER BY sold_date DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);
    return result.rows;
  } catch (error) {
    console.error('Error fetching recent eBay sales:', error);
    return [];
  }
}

export default {
  scrapePriceCharting,
  getPriceChartingData,
  getRecentEBaySales
};
