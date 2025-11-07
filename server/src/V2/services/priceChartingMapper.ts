/**
 * PriceCharting URL Mapper Service (Server Version)
 * Maps TCGdex database card data to PriceCharting URLs for scraping price data
 */

interface TCGdexCard {
  id: string;
  name: string | Record<string, string>;
  localId: string;
  set?: {
    id: string;
    name: string | Record<string, string>;
  };
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
class PriceChartingUrlMapperServer {
  private static instance: PriceChartingUrlMapperServer;
  private baseUrl = "https://www.pricecharting.com";

  private constructor() {}

  static getInstance(): PriceChartingUrlMapperServer {
    if (!this.instance) {
      this.instance = new PriceChartingUrlMapperServer();
    }
    return this.instance;
  }

  /**
   * Generate PriceCharting URL from card data
   * @param card - TCGdex card object from database
   * @returns PriceCharting URL mapping with confidence level
   */
  generateUrl(card: TCGdexCard): PriceChartingUrlMapping {
    const cardName = this.normalizeCardName(card.name);
    const setName = this.normalizeSetName(card.set?.name || "");
    const cardNumber = this.normalizeCardNumber(card.localId || "");

    // Check if set was released before 2010 (older sets don't include card number in URL)
    const releaseDate = typeof card.set?.releaseDate === 'string'
      ? card.set.releaseDate
      : card.set?.releaseDate?.en || Object.values(card.set?.releaseDate || {})[0] || '';
    const isOldSet = !releaseDate || releaseDate < '2010-01-01';

    // Build the URL slug
    // Format: /game/{set-slug}/{card-name-slug}[-{number}]
    const setSlug = this.createSetSlug(setName);
    const cardSlug = this.createCardSlug(cardName, isOldSet ? '' : cardNumber);

    // Fallback for Expedition sets
    if (setName.includes('Expedition') && !setMappings[setName]) {
      setMappings[setName] = 'pokemon-expedition';
    }

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
      matchedOn: `${cardName}${isOldSet ? '' : ` #${cardNumber}`} from ${setName}`,
    };
  }

  /**
   * Normalize card name for URL generation
   */
  private normalizeCardName(name: string | Record<string, string>): string {
    const cardName = typeof name === 'string' ? name : name.en || Object.values(name)[0] || '';

    return (
      cardName
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
  private normalizeSetName(setName: string | Record<string, string>): string {
    const name = typeof setName === 'string' ? setName : setName.en || Object.values(setName)[0] || '';

    // Map common TCGdex set names to PriceCharting set names
    const setMappings: Record<string, string> = {
      "Base Set": "pokemon-base-set",
      "Base Set 2": "pokemon-base-set-2",
      "Jungle": "pokemon-jungle",
      "Fossil": "pokemon-fossil",
      "Team Rocket": "pokemon-team-rocket",
      "Gym Heroes": "pokemon-gym-heroes",
      "Gym Challenge": "pokemon-gym-challenge",
      "Neo Genesis": "pokemon-neo-genesis",
      "Neo Discovery": "pokemon-neo-discovery",
      "Neo Revelation": "pokemon-neo-revelation",
      "Neo Destiny": "pokemon-neo-destiny",
      "Legendary Collection": "pokemon-legendary-collection",
      "Expedition": "pokemon-expedition",
      "Aquapolis": "pokemon-aquapolis",
      "Skyridge": "pokemon-skyridge",
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
      "Stormfront": "pokemon-stormfront",
      "Platinum": "pokemon-platinum",
      "Rising Rivals": "pokemon-rising-rivals",
      "Supreme Victors": "pokemon-supreme-victors",
      "Arceus": "pokemon-arceus",
      "HeartGold & SoulSilver": "pokemon-heartgold-soulsilver",
      "Unleashed": "pokemon-unleashed",
      "Undaunted": "pokemon-undaunted",
      "Triumphant": "pokemon-triumphant",
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
      "XY": "pokemon-xy",
      "Flashfire": "pokemon-flashfire",
      "Furious Fists": "pokemon-furious-fists",
      "Phantom Forces": "pokemon-phantom-forces",
      "Primal Clash": "pokemon-primal-clash",
      "Roaring Skies": "pokemon-roaring-skies",
      "Ancient Origins": "pokemon-ancient-origins",
      "BREAKthrough": "pokemon-breakthrough",
      "BREAKpoint": "pokemon-breakpoint",
      "Fates Collide": "pokemon-fates-collide",
      "Steam Siege": "pokemon-steam-siege",
      "Evolutions": "pokemon-evolutions",
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
      "Expedition Base Set": "pokemon-expedition-base-set",
    };

    // Check if we have a direct mapping
    if (setMappings[name]) {
      return setMappings[name];
    }

    // Otherwise, generate a slug from the set name
    return this.createSlug(name, "pokemon");
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
   * Validate if a URL is a valid PriceCharting product page
   */
  isValidProductUrl(url: string): boolean {
    return url.includes(this.baseUrl) && url.includes("/game/");
  }

  /**
   * Get display-friendly card information from URL
   */
  getCardInfoFromUrl(url: string): {
    displayName: string;
    setName: string;
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
        displayName: `${numberMatch[1].replace(/-/g, " ")} #${numberMatch[2]}`,
        setName: setSlug.replace("pokemon-", "").replace(/-/g, " "),
      };
    }

    return {
      displayName: cardSlug.replace(/-/g, " "),
      setName: setSlug.replace("pokemon-", "").replace(/-/g, " "),
    };
  }
}

export default PriceChartingUrlMapperServer.getInstance();
