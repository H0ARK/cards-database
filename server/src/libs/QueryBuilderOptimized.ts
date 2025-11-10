/**
 * Optimized Query Builder for PostgreSQL
 *
 * This version is optimized to use the new trigram indexes and reduce
 * the number of OR conditions in search queries for better performance.
 */

import type { SupportedLanguages } from '@tcgdex/sdk';

export interface QueryFilter {
  [key: string]: any;
}

export class CardQueryBuilder {
  private conditions: string[] = [];
  private params: any[] = [];
  private paramCounter = 1;
  private orderBy: string[] = [];
  private limitValue?: number;
  private offsetValue?: number;

  /**
   * Add a WHERE condition
   */
  where(field: string, operator: string, value: any): this {
    this.conditions.push(`${field} ${operator} $${this.paramCounter}`);
    this.params.push(value);
    this.paramCounter++;
    return this;
  }

  /**
   * Add a simple equality WHERE condition
   */
  whereEquals(field: string, value: any): this {
    return this.where(field, '=', value);
  }

  /**
   * Add a WHERE IN condition
   */
  whereIn(field: string, values: any[]): this {
    this.conditions.push(`${field} = ANY($${this.paramCounter})`);
    this.params.push(values);
    this.paramCounter++;
    return this;
  }

  /**
   * Add a JSONB contains condition
   * Example: whereJsonContains('name', 'en', 'Pikachu')
   */
  whereJsonContains(field: string, key: string, value: any): this {
    this.conditions.push(`${field}->>'${key}' ILIKE $${this.paramCounter}`);
    this.params.push(`%${value}%`);
    this.paramCounter++;
    return this;
  }

  /**
   * OPTIMIZED: Full-text search using priority-based approach
   * Searches the most likely fields first (primary language) for better performance
   */
  whereJsonFullTextSearch(field: string, searchTerm: any, primaryLang: string = 'en'): this {
    // Use a smarter approach: check primary language first, then others
    // This allows the query planner to use indexes more efficiently
    const otherLangs = ['fr', 'es', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ru'].filter(l => l !== primaryLang);

    const conditions: string[] = [];

    // Primary language first (most likely to match)
    const primaryParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    conditions.push(`${field}->>'${primaryLang}' ILIKE $${primaryParam}`);

    // Other languages
    otherLangs.forEach((lang) => {
      const paramNum = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      conditions.push(`${field}->>'${lang}' ILIKE $${paramNum}`);
    });

    this.conditions.push(`(${conditions.join(' OR ')})`);
    return this;
  }

  /**
   * OPTIMIZED: Smart card metadata search
   * Uses a tiered approach to avoid full table scans
   * 1. Try exact/high-probability matches first
   * 2. Only expand to full search if needed
   */
  whereCardMetadataSearchOptimized(searchTerm: string, lang: string = 'en'): this {
    const searchConditions: string[] = [];
    const searchLower = searchTerm.toLowerCase();

    // TIER 1: Most common and indexed fields (high selectivity)

    // Card name in primary language (most common search)
    const nameParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.name->>'${lang}' ILIKE $${nameParam}`);

    // Card name in English (if not already primary)
    if (lang !== 'en') {
      const nameEnParam = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      searchConditions.push(`c.name->>'en' ILIKE $${nameEnParam}`);
    }

    // Set name in primary language (common search)
    const setNameParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`s.name->>'${lang}' ILIKE $${setNameParam}`);

    // TIER 2: Exact match fields (very selective)

    // Rarity (exact match more common)
    const rarityParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.rarity ILIKE $${rarityParam}`);

    // Category (exact match more common)
    const categoryParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.category ILIKE $${categoryParam}`);

    // TIER 3: Commonly searched attributes

    // Illustrator (people often search by artist)
    const illustratorParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.illustrator ILIKE $${illustratorParam}`);

    // Regulation mark (format searches)
    const regParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.regulation_mark ILIKE $${regParam}`);

    // TIER 4: JSONB attributes (indexed but slower)

    // Stage (Pokemon evolution)
    const stageParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.attributes->>'stage' ILIKE $${stageParam}`);

    // Trainer type
    const trainerTypeParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.attributes->>'trainerType' ILIKE $${trainerTypeParam}`);

    // Energy type
    const energyTypeParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.attributes->>'energyType' ILIKE $${energyTypeParam}`);

    // TIER 5: Only add deep JSONB searches for longer terms (more specific)
    // This prevents expensive operations on short, common searches
    if (searchTerm.length >= 4) {
      // EvolveFrom (in primary language only)
      const evolveParam = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      searchConditions.push(`c.attributes->'evolveFrom'->>'${lang}' ILIKE $${evolveParam}`);

      // Description (in primary language only)
      const descParam = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      searchConditions.push(`c.attributes->'description'->>'${lang}' ILIKE $${descParam}`);

      // Effect (for trainer/energy cards)
      const effectParam = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      searchConditions.push(`c.attributes->'effect'->>'${lang}' ILIKE $${effectParam}`);
    }

    // TIER 6: Only search abilities/attacks for longer, specific terms
    // These are expensive as they search nested arrays
    if (searchTerm.length >= 5) {
      // Check if attributes JSONB contains the term in abilities
      const abilityParam = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      searchConditions.push(`(c.attributes->'abilities')::text ILIKE $${abilityParam}`);

      // Check if attributes JSONB contains the term in attacks
      const attackParam = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      searchConditions.push(`(c.attributes->'attacks')::text ILIKE $${attackParam}`);

      // Item name/effect
      const itemParam = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      searchConditions.push(`(c.attributes->'item')::text ILIKE $${itemParam}`);
    }

    // Combine all conditions with OR
    this.conditions.push(`(${searchConditions.join(' OR ')})`);
    return this;
  }

  /**
   * LEGACY: Keep original method for backward compatibility
   * But mark as deprecated in favor of optimized version
   */
  whereCardMetadataSearch(searchTerm: string, lang: string = 'en'): this {
    return this.whereCardMetadataSearchOptimized(searchTerm, lang);
  }

  /**
   * Add a raw WHERE condition (use with caution)
   */
  whereRaw(condition: string, ...params: any[]): this {
    this.conditions.push(condition);
    this.params.push(...params);
    this.paramCounter += params.length;
    return this;
  }

  /**
   * OPTIMIZED: Serie metadata search
   */
  whereSerieMetadataSearch(searchTerm: string, lang: string = 'en'): this {
    const searchConditions: string[] = [];

    // Serie name in primary language
    const nameParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`sr.name->>'${lang}' ILIKE $${nameParam}`);

    // Serie name in English (if different)
    if (lang !== 'en') {
      const nameEnParam = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      searchConditions.push(`sr.name->>'en' ILIKE $${nameEnParam}`);
    }

    // Serie ID search
    const idParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`sr.id ILIKE $${idParam}`);

    this.conditions.push(`(${searchConditions.join(' OR ')})`);
    return this;
  }

  /**
   * OPTIMIZED: Set metadata search
   */
  whereSetMetadataSearch(searchTerm: string, lang: string = 'en'): this {
    const searchConditions: string[] = [];

    // Set name in primary language (most important)
    const setNameParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`s.name->>'${lang}' ILIKE $${setNameParam}`);

    // Set name in English (if different)
    if (lang !== 'en') {
      const setNameEnParam = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      searchConditions.push(`s.name->>'en' ILIKE $${setNameEnParam}`);
    }

    // Set ID search
    const setIdParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`s.id ILIKE $${setIdParam}`);

    // Series name in primary language
    const seriesNameParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`sr.name->>'${lang}' ILIKE $${seriesNameParam}`);

    this.conditions.push(`(${searchConditions.join(' OR ')})`);
    return this;
  }

  /**
   * OPTIMIZED: Sealed product metadata search
   */
  whereSealedProductMetadataSearch(searchTerm: string, lang: string = 'en'): this {
    const searchConditions: string[] = [];

    // Product name in primary language
    const nameParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`sp.name->>'${lang}' ILIKE $${nameParam}`);

    // Product name in English (if different)
    if (lang !== 'en') {
      const nameEnParam = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      searchConditions.push(`sp.name->>'en' ILIKE $${nameEnParam}`);
    }

    // Product type
    const typeParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`sp.product_type ILIKE $${typeParam}`);

    // Exclusive retailer
    const retailerParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`sp.exclusive_retailer ILIKE $${retailerParam}`);

    // Set name (if joined)
    const setParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`s.name->>'${lang}' ILIKE $${setParam}`);

    // Product ID
    const idParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`sp.id ILIKE $${idParam}`);

    this.conditions.push(`(${searchConditions.join(' OR ')})`);
    return this;
  }

  /**
   * Add a JSONB exact match condition
   */
  whereJsonEquals(field: string, key: string, value: any): this {
    this.conditions.push(`${field}->>'${key}' = $${this.paramCounter}`);
    this.params.push(value);
    this.paramCounter++;
    return this;
  }

  /**
   * Add OR conditions
   */
  whereOr(conditions: Array<{ field: string; value: any }>): this {
    const orConditions = conditions.map((cond) => {
      const paramNum = this.paramCounter++;
      this.params.push(cond.value);
      return `${cond.field} = $${paramNum}`;
    });
    this.conditions.push(`(${orConditions.join(' OR ')})`);
    return this;
  }

  /**
   * Add ORDER BY
   */
  order(field: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderBy.push(`${field} ${direction}`);
    return this;
  }

  /**
   * Set LIMIT
   */
  limit(limit: number): this {
    this.limitValue = limit;
    return this;
  }

  /**
   * Set OFFSET
   */
  offset(offset: number): this {
    this.offsetValue = offset;
    return this;
  }

  /**
   * Build the WHERE clause
   */
  buildWhere(): string {
    return this.conditions.length > 0
      ? `WHERE ${this.conditions.join(' AND ')}`
      : '';
  }

  /**
   * Build the ORDER BY clause
   */
  buildOrderBy(): string {
    return this.orderBy.length > 0 ? `ORDER BY ${this.orderBy.join(', ')}` : '';
  }

  /**
   * Build the LIMIT clause
   */
  buildLimit(): string {
    return this.limitValue !== undefined ? `LIMIT ${this.limitValue}` : '';
  }

  /**
   * Build the OFFSET clause
   */
  buildOffset(): string {
    return this.offsetValue !== undefined ? `OFFSET ${this.offsetValue}` : '';
  }

  /**
   * Build the complete query
   */
  build(baseQuery: string): { sql: string; params: any[] } {
    const parts = [
      baseQuery,
      this.buildWhere(),
      this.buildOrderBy(),
      this.buildLimit(),
      this.buildOffset(),
    ].filter((part) => part.length > 0);

    return {
      sql: parts.join(' '),
      params: this.params,
    };
  }

  /**
   * Get query parameters
   */
  getParams(): any[] {
    return this.params;
  }
}

/**
 * Helper to build card queries from legacy filter format
 */
export function buildCardQuery(lang: SupportedLanguages, filters: QueryFilter = {}): CardQueryBuilder {
  const qb = new CardQueryBuilder();

  // OPTIMIZATION: Apply most selective filters first
  // This helps PostgreSQL's query planner choose better indexes

  // Handle set filter (can be set.id or set.name)
  if (filters.set) {
    qb.whereOr([
      { field: 'c.set_id', value: filters.set },
      { field: 's.name->>\'en\'', value: filters.set },
    ]);
  }

  // Handle $or conditions (e.g., for set.id OR set.name)
  if (filters.$or && Array.isArray(filters.$or)) {
    const orConditions = filters.$or.map((condition: any) => {
      if (condition['set.id']) {
        return { field: 'c.set_id', value: condition['set.id'] };
      }
      if (condition['set.name']) {
        return { field: 's.name->>\'en\'', value: condition['set.name'] };
      }
      return null;
    }).filter(Boolean);

    if (orConditions.length > 0) {
      qb.whereOr(orConditions);
    }
  }

  // Handle category filter (highly selective)
  if (filters.category) {
    qb.whereEquals('c.category', filters.category);
  }

  // Handle rarity filter (selective)
  if (filters.rarity) {
    qb.whereEquals('c.rarity', filters.rarity);
  }

  // Handle regulation mark filter
  if (filters.regulationMark) {
    qb.whereEquals('c.regulation_mark', filters.regulationMark);
  }

  // Handle types filter (uses JSONB containment)
  if (filters.types) {
    qb.where('c.attributes->>\'types\'', '@>', JSON.stringify(Array.isArray(filters.types) ? filters.types : [filters.types]));
  }

  // Handle HP filter (exact match)
  if (filters.hp) {
    qb.whereJsonEquals('c.attributes', 'hp', filters.hp);
  }

  // Handle stage filter (exact match)
  if (filters.stage) {
    qb.whereJsonEquals('c.attributes', 'stage', filters.stage);
  }

  // Handle illustrator filter (uses trigram index)
  if (filters.illustrator) {
    qb.where('c.illustrator', 'ILIKE', `%${filters.illustrator}%`);
  }

  // Handle dexId filter (uses JSONB index)
  if (filters.dexId && filters.dexId.$in) {
    qb.where('c.attributes->\'dexId\'', '?|', filters.dexId.$in.map(String));
  }

  // Handle name search - use optimized metadata search
  if (filters.name) {
    const searchTerm = typeof filters.name === 'object' && filters.name.$inc
      ? filters.name.$inc
      : typeof filters.name === 'string'
        ? filters.name
        : typeof filters.name === 'object' && filters.name.$eq
          ? filters.name.$eq
          : null;

    if (searchTerm) {
      qb.whereCardMetadataSearchOptimized(searchTerm as string, lang);
    }
  }

  // Handle comprehensive search across all metadata (uses optimized search)
  if (filters.q || filters.search) {
    const searchTerm = filters.q || filters.search;
    if (typeof searchTerm === 'string') {
      qb.whereCardMetadataSearchOptimized(searchTerm, lang);
    }
  }

  // Handle sorting (before pagination)
  if (filters.$sort) {
    for (const [field, direction] of Object.entries(filters.$sort)) {
      // If sorting by name, use the language-specific name
      const sortField = field === 'name' ? `c.name->>'${lang}'` : field;
      qb.order(sortField, direction === 1 ? 'ASC' : 'DESC');
    }
  } else {
    // Default sort for consistent pagination
    qb.order('c.set_id', 'ASC').order('c.local_id', 'ASC');
  }

  // Handle pagination (always last)
  if (filters.$limit) {
    qb.limit(filters.$limit);
  }

  if (filters.$page && filters.$limit) {
    const offset = (filters.$page - 1) * filters.$limit;
    qb.offset(offset);
  }

  return qb;
}

/**
 * Helper to build set queries
 */
export function buildSetQuery(lang: SupportedLanguages, filters: QueryFilter = {}): CardQueryBuilder {
  const qb = new CardQueryBuilder();

  // Handle serie filter
  if (filters.serie) {
    qb.whereOr([
      { field: 's.series_id', value: filters.serie },
      { field: 'sr.name->>\'en\'', value: filters.serie },
    ]);
  }

  // Handle $or for serie.id OR serie.name
  if (filters.$or && Array.isArray(filters.$or)) {
    const orConditions = filters.$or.map((condition: any) => {
      if (condition['serie.id']) {
        return { field: 's.series_id', value: condition['serie.id'] };
      }
      if (condition['serie.name']) {
        return { field: 'sr.name->>\'en\'', value: condition['serie.name'] };
      }
      return null;
    }).filter(Boolean);

    if (orConditions.length > 0) {
      qb.whereOr(orConditions);
    }
  }

  // Handle comprehensive search across set metadata
  if (filters.q || filters.search) {
    const searchTerm = filters.q || filters.search;
    if (typeof searchTerm === 'string') {
      qb.whereSetMetadataSearch(searchTerm, lang);
    }
  }

  // Default sorting
  qb.order('s.release_date', 'DESC');

  return qb;
}

/**
 * Helper to build serie queries
 */
export function buildSerieQuery(lang: SupportedLanguages, filters: QueryFilter = {}): CardQueryBuilder {
  const qb = new CardQueryBuilder();

  // Handle ID filter
  if (filters.id) {
    qb.whereEquals('sr.id', filters.id);
  }

  // Handle comprehensive search across serie metadata
  if (filters.q || filters.search) {
    const searchTerm = filters.q || filters.search;
    if (typeof searchTerm === 'string') {
      qb.whereSerieMetadataSearch(searchTerm, lang);
    }
  }

  return qb;
}

/**
 * Helper to build sealed product queries
 */
export function buildSealedProductQuery(lang: SupportedLanguages, filters: QueryFilter = {}): CardQueryBuilder {
  const qb = new CardQueryBuilder();

  // Handle set filter
  if (filters.set) {
    qb.whereOr([
      { field: 'sp.set_id', value: filters.set },
    ]);
  }

  // Handle product type filter (selective)
  if (filters.productType || filters.product_type) {
    const type = filters.productType || filters.product_type;
    qb.whereEquals('sp.product_type', type);
  }

  // Handle comprehensive search
  if (filters.q || filters.search) {
    const searchTerm = filters.q || filters.search;
    if (typeof searchTerm === 'string') {
      qb.whereSealedProductMetadataSearch(searchTerm, lang);
    }
  }

  // Handle pagination
  if (filters.$limit) {
    qb.limit(filters.$limit);
  }

  if (filters.$page && filters.$limit) {
    const offset = (filters.$page - 1) * filters.$limit;
    qb.offset(offset);
  }

  return qb;
}
