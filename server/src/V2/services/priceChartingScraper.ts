/**
 * PriceCharting Scraper Service
 * Scrapes sold listings data from PriceCharting's internal endpoints
 */

export interface PriceChartingSoldListing {
  price: number;
  condition: string;
  date: string;
  seller?: string;
  listingUrl?: string;
}

export interface PriceChartingProductMatch {
  id: string;
  name: string;
  consoleName: string;
  url: string;
  slug: string;
}

class PriceChartingScraperService {
  private readonly BASE_URL = "https://www.pricecharting.com";
  private cache: Map<string, any> = new Map();
  private readonly CACHE_TTL = 1000 * 60 * 5; // 5 minutes

  /**
   * Generate product slug from card name and set
   * Example: "Charizard #4" + "Base Set" -> "charizard-4"
   */
  private generateSlug(cardName: string, setName?: string): string {
    let slug = cardName
      .toLowerCase()
      .replace(/['']/g, "") // Remove apostrophes
      .replace(/[^a-z0-9\s-]/g, "") // Remove special chars except spaces and hyphens
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Replace multiple hyphens with single
      .trim();

    return slug;
  }

  /**
   * Generate PriceCharting URL for a card
   */
  private generateProductUrl(cardName: string, setName?: string): string {
    const setSlug = setName
      ? setName
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
      : "base-set";

    const cardSlug = this.generateSlug(cardName);

    return `${this.BASE_URL}/game/pokemon-${setSlug}/${cardSlug}`;
  }

  /**
   * Search for a card using autocomplete data
   */
  async searchCard(
    cardName: string,
    setName?: string,
  ): Promise<PriceChartingProductMatch | null> {
    try {
      // Load autocomplete data
      const response = await fetch("/data/pricecharting-autocomplete.json");
      if (!response.ok) {
        console.warn("Could not load PriceCharting autocomplete data");
        return null;
      }

      const autocompleteData = await response.json();

      // Search for matching entry
      const searchTerm = cardName.toLowerCase();
      const matches = autocompleteData.filter((term: string) =>
        term.toLowerCase().includes(searchTerm),
      );

      if (matches.length === 0) {
        console.log(`No PriceCharting matches found for: ${cardName}`);
        return null;
      }

      // Use first match to generate URL
      const bestMatch = matches[0];
      const url = this.generateProductUrl(cardName, setName);
      const slug = this.generateSlug(cardName);

      return {
        id: slug,
        name: cardName,
        consoleName: setName || "Pokemon",
        url,
        slug,
      };
    } catch (error) {
      console.error("Error searching PriceCharting:", error);
      return null;
    }
  }

  /**
   * Scrape sold listings from PriceCharting product page
   * This attempts to fetch data from their internal API endpoints
   */
  async getSoldListings(
    cardName: string,
    setName?: string,
    limit: number = 20,
  ): Promise<PriceChartingSoldListing[]> {
    const cacheKey = `sold_${cardName}_${setName}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`📦 Cache hit for PriceCharting sold listings: ${cardName}`);
      return cached.data;
    }

    try {
      const product = await this.searchCard(cardName, setName);
      if (!product) {
        return [];
      }

      console.log(`🔍 Fetching sold listings for: ${cardName}`);

      // Try to fetch offers data from PriceCharting's internal endpoint
      // PriceCharting loads sold listings via their /offers endpoint
      const slug = product.slug;
      const offersUrl = `${this.BASE_URL}/offers?product=${slug}&status=sold&limit=${limit}`;

      // Note: This will likely be blocked by CORS
      // In production, you'd need to proxy this through your backend
      const response = await fetch(offersUrl, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        console.warn(`PriceCharting returned ${response.status}`);
        return [];
      }

      const data = await response.json();
      const listings = this.parseOffersResponse(data);

      // Cache the results
      this.cache.set(cacheKey, {
        timestamp: Date.now(),
        data: listings,
      });

      return listings;
    } catch (error) {
      console.warn("Could not fetch PriceCharting sold listings:", error);
      return [];
    }
  }

  /**
   * Parse offers response from PriceCharting
   */
  private parseOffersResponse(data: any): PriceChartingSoldListing[] {
    if (!data || !data.offers) {
      return [];
    }

    return data.offers.map((offer: any) => ({
      price: parseFloat(offer.price) || 0,
      condition: offer.condition || "Unknown",
      date: offer.date_sold || offer.date_listed || new Date().toISOString(),
      seller: offer.seller_name,
      listingUrl: offer.url,
    }));
  }

  /**
   * Get historical price data from PriceCharting
   */
  async getPriceHistory(
    cardName: string,
    setName?: string,
    days: number = 90,
  ): Promise<Array<{ date: string; price: number }>> {
    try {
      const product = await this.searchCard(cardName, setName);
      if (!product) {
        return [];
      }

      // PriceCharting loads chart data from their chart endpoint
      const chartUrl = `${this.BASE_URL}/chart-data?product=${product.slug}&days=${days}`;

      const response = await fetch(chartUrl, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        console.warn(`Chart data returned ${response.status}`);
        return [];
      }

      const data = await response.json();

      if (data && Array.isArray(data.chart_data)) {
        return data.chart_data.map((point: any) => ({
          date: point.date,
          price: parseFloat(point.price) || 0,
        }));
      }

      return [];
    } catch (error) {
      console.warn("Could not fetch price history:", error);
      return [];
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

const priceChartingScraperService = new PriceChartingScraperService();
export default priceChartingScraperService;
