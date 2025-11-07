/**
 * PriceCharting URL Mapper Service
 * Maps TCGdex card data to PriceCharting URLs for scraping price data
 */

import type { TCGdexCard } from "./tcgdexApi";

export interface PriceChartingProduct {
  id: string;
  productName: string;
  consoleName: string;
  url: string;
}

export interface PriceChartingUrlMapping {
  url: string;
  productId?: string;
  confidence: "high" | "medium" | "low";
  matchedOn: string;
}

/**
 * Service to map Pokemon cards to their PriceCharting URLs
 */
class PriceChartingUrlMapper {
  private static instance: PriceChartingUrlMapper;
  private baseUrl = "https://www.pricecharting.com";

  private constructor() {}

  static getInstance(): PriceChartingUrlMapper {
    if (!this.instance) {
      this.instance = new PriceChartingUrlMapper();
    }
    return this.instance;
  }

  /**
   * Generate PriceCharting URL from card data
   * @param card - TCGdex card object
   * @returns PriceCharting URL mapping with confidence level
   */
  generateUrl(card: TCGdexCard): PriceChartingUrlMapping {
    const cardName = this.normalizeCardName(card.name);
    const setName = this.normalizeSetName(card.set?.name || "");
    const cardNumber = this.normalizeCardNumber(card.localId || "");

    // Build the URL slug
    // Format: /game/{set-slug}/{card-name-slug}-{number}
    const setSlug = this.createSetSlug(setName);
    const cardSlug = this.createCardSlug(cardName, cardNumber);

    const url = `${this.baseUrl}/game/${setSlug}/${cardSlug}`;

    // Determine confidence based on data availability
    let confidence: "high" | "medium" | "low" = "medium";
    if (cardNumber && setName && cardName) {
      confidence = "high";
    } else if (cardName && setName) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    return {
      url,
      confidence,
      matchedOn: `${cardName} #${cardNumber} from ${setName}`,
    };
  }

  /**
   * Normalize card name for URL generation
   */
  private normalizeCardName(name: string): string {
    return (
      name
        // Remove special characters
        .replace(/['']/g, "")
        .replace(/[éèê]/g, "e")
        .replace(/[âàä]/g, "a")
        .replace(/[îï]/g, "i")
        .replace(/[ôö]/g, "o")
        .replace(/[ûü]/g, "u")
        // Remove parentheses content (variants)
        .replace(/\([^)]*\)/g, "")
        .trim()
    );
  }

  /**
   * Normalize set name for URL generation
   */
  private normalizeSetName(setName: string): string {
    // Map common TCGdex set names to PriceCharting set names
    const setMappings: Record<string, string> = {
      "Base Set": "pokemon-base-set",
      "Base Set 2": "pokemon-base-set-2",
      Jungle: "pokemon-jungle",
      Fossil: "pokemon-fossil",
      "Team Rocket": "pokemon-team-rocket",
      "Gym Heroes": "pokemon-gym-heroes",
      "Gym Challenge": "pokemon-gym-challenge",
      "Neo Genesis": "pokemon-neo-genesis",
      "Neo Discovery": "pokemon-neo-discovery",
      "Neo Revelation": "pokemon-neo-revelation",
      "Neo Destiny": "pokemon-neo-destiny",
      "Legendary Collection": "pokemon-legendary-collection",
      Expedition: "pokemon-expedition",
      Aquapolis: "pokemon-aquapolis",
      Skyridge: "pokemon-skyridge",
      "EX Ruby & Sapphire": "pokemon-ex-ruby-sapphire",
      "EX Sandstorm": "pokemon-ex-sandstorm",
      "EX Dragon": "pokemon-ex-dragon",
      "EX Team Magma vs Team Aqua": "pokemon-ex-team-magma-vs-team-aqua",
      "EX Hidden Legends": "pokemon-ex-hidden-legends",
      "EX FireRed & LeafGreen": "pokemon-ex-firered-leafgreen",
      "EX Team Rocket Returns": "pokemon-ex-team-rocket-returns",
      "EX Deoxys": "pokemon-ex-deoxys",
      "EX Emerald": "pokemon-ex-emerald",
      "EX Unseen Forces": "pokemon-ex-unseen-forces",
      "EX Delta Species": "pokemon-ex-delta-species",
      "EX Legend Maker": "pokemon-ex-legend-maker",
      "EX Holon Phantoms": "pokemon-ex-holon-phantoms",
      "EX Crystal Guardians": "pokemon-ex-crystal-guardians",
      "EX Dragon Frontiers": "pokemon-ex-dragon-frontiers",
      "EX Power Keepers": "pokemon-ex-power-keepers",
      "Diamond & Pearl": "pokemon-diamond-pearl",
      "Mysterious Treasures": "pokemon-mysterious-treasures",
      "Secret Wonders": "pokemon-secret-wonders",
      "Great Encounters": "pokemon-great-encounters",
      "Majestic Dawn": "pokemon-majestic-dawn",
      "Legends Awakened": "pokemon-legends-awakened",
      Stormfront: "pokemon-stormfront",
      Platinum: "pokemon-platinum",
      "Rising Rivals": "pokemon-rising-rivals",
      "Supreme Victors": "pokemon-supreme-victors",
      Arceus: "pokemon-arceus",
      "HeartGold & SoulSilver": "pokemon-heartgold-soulsilver",
      Unleashed: "pokemon-unleashed",
      Undaunted: "pokemon-undaunted",
      Triumphant: "pokemon-triumphant",
      "Call of Legends": "pokemon-call-of-legends",
      "Black & White": "pokemon-black-white",
      "Emerging Powers": "pokemon-emerging-powers",
      "Noble Victories": "pokemon-noble-victories",
      "Next Destinies": "pokemon-next-destinies",
      "Dark Explorers": "pokemon-dark-explorers",
      "Dragons Exalted": "pokemon-dragons-exalted",
      "Boundaries Crossed": "pokemon-boundaries-crossed",
      "Plasma Storm": "pokemon-plasma-storm",
      "Plasma Freeze": "pokemon-plasma-freeze",
      "Plasma Blast": "pokemon-plasma-blast",
      "Legendary Treasures": "pokemon-legendary-treasures",
      XY: "pokemon-xy",
      Flashfire: "pokemon-flashfire",
      "Furious Fists": "pokemon-furious-fists",
      "Phantom Forces": "pokemon-phantom-forces",
      "Primal Clash": "pokemon-primal-clash",
      "Roaring Skies": "pokemon-roaring-skies",
      "Ancient Origins": "pokemon-ancient-origins",
      BREAKthrough: "pokemon-breakthrough",
      BREAKpoint: "pokemon-breakpoint",
      "Fates Collide": "pokemon-fates-collide",
      "Steam Siege": "pokemon-steam-siege",
      Evolutions: "pokemon-evolutions",
      "Sun & Moon": "pokemon-sun-moon",
      "Guardians Rising": "pokemon-guardians-rising",
      "Burning Shadows": "pokemon-burning-shadows",
      "Crimson Invasion": "pokemon-crimson-invasion",
      "Ultra Prism": "pokemon-ultra-prism",
      "Forbidden Light": "pokemon-forbidden-light",
      "Celestial Storm": "pokemon-celestial-storm",
      "Lost Thunder": "pokemon-lost-thunder",
      "Team Up": "pokemon-team-up",
      "Unbroken Bonds": "pokemon-unbroken-bonds",
      "Unified Minds": "pokemon-unified-minds",
      "Cosmic Eclipse": "pokemon-cosmic-eclipse",
      "Sword & Shield": "pokemon-sword-shield",
      "Rebel Clash": "pokemon-rebel-clash",
      "Darkness Ablaze": "pokemon-darkness-ablaze",
      "Vivid Voltage": "pokemon-vivid-voltage",
      "Shining Fates": "pokemon-shining-fates",
      "Battle Styles": "pokemon-battle-styles",
      "Chilling Reign": "pokemon-chilling-reign",
      "Evolving Skies": "pokemon-evolving-skies",
      "Fusion Strike": "pokemon-fusion-strike",
      "Brilliant Stars": "pokemon-brilliant-stars",
      "Astral Radiance": "pokemon-astral-radiance",
      "Lost Origin": "pokemon-lost-origin",
      "Silver Tempest": "pokemon-silver-tempest",
      "Crown Zenith": "pokemon-crown-zenith",
      "Scarlet & Violet": "pokemon-scarlet-violet",
      "Paldea Evolved": "pokemon-paldea-evolved",
      "Obsidian Flames": "pokemon-obsidian-flames",
      "151": "pokemon-151",
      "Paradox Rift": "pokemon-paradox-rift",
      "Paldean Fates": "pokemon-paldean-fates",
      "Temporal Forces": "pokemon-temporal-forces",
      "Twilight Masquerade": "pokemon-twilight-masquerade",
      "Shrouded Fable": "pokemon-shrouded-fable",
      "Stellar Crown": "pokemon-stellar-crown",
      "Surging Sparks": "pokemon-surging-sparks",
    };

    // Check if we have a direct mapping
    if (setMappings[setName]) {
      return setMappings[setName];
    }

    // Otherwise, generate a slug from the set name
    return this.createSlug(setName, "pokemon");
  }

  /**
   * Normalize card number for URL generation
   */
  private normalizeCardNumber(number: string): string {
    // Remove leading zeros and special characters
    return number.replace(/^0+/, "").replace(/[^0-9a-zA-Z]/g, "");
  }

  /**
   * Create a URL slug for the set
   */
  private createSetSlug(setName: string, prefix: string = "pokemon"): string {
    const slug = this.createSlug(setName);
    return slug.startsWith(prefix) ? slug : `${prefix}-${slug}`;
  }

  /**
   * Create a URL slug for the card
   */
  private createCardSlug(cardName: string, cardNumber: string): string {
    const nameSlug = this.createSlug(cardName);
    const number = this.normalizeCardNumber(cardNumber);

    if (number) {
      return `${nameSlug}-${number}`;
    }
    return nameSlug;
  }

  /**
   * Create a URL-friendly slug from text
   */
  private createSlug(text: string, prefix?: string): string {
    let slug = text
      .toLowerCase()
      .trim()
      // Replace spaces and special chars with hyphens
      .replace(/[\s_]+/g, "-")
      .replace(/[^\w-]+/g, "")
      // Remove consecutive hyphens
      .replace(/--+/g, "-")
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, "");

    if (prefix && !slug.startsWith(prefix)) {
      slug = `${prefix}-${slug}`;
    }

    return slug;
  }

  /**
   * Generate search URL for finding a card on PriceCharting
   */
  generateSearchUrl(cardName: string, setName?: string): string {
    const query = setName ? `${cardName} ${setName}` : cardName;
    const encodedQuery = encodeURIComponent(query);
    return `${this.baseUrl}/search-products?q=${encodedQuery}&type=prices&category=pokemon-cards`;
  }

  /**
   * Parse PriceCharting URL to extract product information
   */
  parseUrl(url: string): {
    setSlug: string;
    cardSlug: string;
    cardName: string;
    cardNumber: string;
  } | null {
    // Match pattern: /game/{set-slug}/{card-name-slug}-{number}
    const match = url.match(/\/game\/([^/]+)\/(.+)/);
    if (!match) return null;

    const setSlug = match[1];
    const cardSlug = match[2];

    // Try to extract card number from the end
    const numberMatch = cardSlug.match(/^(.+)-(\d+[a-zA-Z]?)$/);
    if (numberMatch) {
      return {
        setSlug,
        cardSlug,
        cardName: numberMatch[1].replace(/-/g, " "),
        cardNumber: numberMatch[2],
      };
    }

    return {
      setSlug,
      cardSlug,
      cardName: cardSlug.replace(/-/g, " "),
      cardNumber: "",
    };
  }

  /**
   * Validate if a URL is a valid PriceCharting product page
   */
  isValidProductUrl(url: string): boolean {
    return url.includes(this.baseUrl) && url.includes("/game/");
  }

  /**
   * Get autocomplete data file path
   */
  getAutocompleteDataPath(): string {
    return "/data/pricecharting-autocomplete.json";
  }

  /**
   * Search autocomplete data for matching cards
   * This would load the pricecharting-autocomplete.json file
   */
  async searchAutocomplete(
    cardName: string,
    setName?: string,
  ): Promise<PriceChartingProduct[]> {
    try {
      const response = await fetch(this.getAutocompleteDataPath());
      if (!response.ok) {
        console.warn("Autocomplete data not available");
        return [];
      }

      const data: PriceChartingProduct[] = await response.json();

      // Filter and rank results
      const searchTerm = `${cardName} ${setName || ""}`.toLowerCase();
      const results = data
        .filter((product) => {
          const productName = product.productName.toLowerCase();
          const consoleName = product.consoleName.toLowerCase();

          // Must be a Pokemon card
          if (!consoleName.includes("pokemon")) return false;

          // Check if card name matches
          return productName.includes(cardName.toLowerCase());
        })
        .map((product) => {
          // Calculate relevance score
          const productName = product.productName.toLowerCase();
          let score = 0;

          // Exact name match
          if (productName.includes(cardName.toLowerCase())) score += 10;

          // Set name match
          if (setName && productName.includes(setName.toLowerCase()))
            score += 5;

          // Starts with card name
          if (productName.startsWith(cardName.toLowerCase())) score += 5;

          return { ...product, score };
        })
        .sort((a, b) => (b as any).score - (a as any).score)
        .slice(0, 10);

      return results;
    } catch (error) {
      console.error("Failed to search autocomplete data:", error);
      return [];
    }
  }

  /**
   * Build complete PriceCharting URL for a specific card
   */
  buildProductUrl(productId: string, slug: string): string {
    return `${this.baseUrl}/game/${slug}?id=${productId}`;
  }

  /**
   * Get display-friendly card information from URL
   */
  getCardInfoFromUrl(url: string): {
    displayName: string;
    setName: string;
  } | null {
    const parsed = this.parseUrl(url);
    if (!parsed) return null;

    return {
      displayName: `${parsed.cardName}${parsed.cardNumber ? ` #${parsed.cardNumber}` : ""}`,
      setName: parsed.setSlug.replace("pokemon-", "").replace(/-/g, " "),
    };
  }
}

export default PriceChartingUrlMapper.getInstance();
