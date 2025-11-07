/**
 * Query Builder for PostgreSQL
 *
 * Provides a fluent interface for building SQL queries with proper parameterization.
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
   * Add a full-text search condition across multiple JSONB fields
   * Searches all language variants in a JSONB field
   * Example: whereJsonFullTextSearch('name', 'Pikachu')
   */
  whereJsonFullTextSearch(field: string, searchTerm: any): this {
    // Search across all common language codes
    const langs = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ru'];
    const conditions = langs.map((currentLang) => {
      const paramNum = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      return `${field}->>'${currentLang}' ILIKE $${paramNum}`;
    });
    this.conditions.push(`(${conditions.join(' OR ')})`);
    return this;
  }

  /**
   * Add a comprehensive search across card metadata
   * Searches: name, illustrator, types, abilities, attacks, effects, item names, etc.
   */
  whereCardMetadataSearch(searchTerm: string, lang: string = 'en'): this {
    const searchConditions: string[] = [];
    
    // Name search (all languages)
    const langs = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'ko', 'zh'];
    langs.forEach((currentLang) => {
      const paramNum = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      searchConditions.push(`c.name->>'${currentLang}' ILIKE $${paramNum}`);
    });

    // Illustrator search
    const illustratorParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.illustrator ILIKE $${illustratorParam}`);

    // Rarity search
    const rarityParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.rarity ILIKE $${rarityParam}`);

    // Category search
    const categoryParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.category ILIKE $${categoryParam}`);

    // Types search (JSONB array)
    const typesParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`(c.attributes->>'types')::text ILIKE $${typesParam}`);

    // Stage search
    const stageParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.attributes->>'stage' ILIKE $${stageParam}`);

    // EvolveFrom search (all languages in JSONB)
    const evolveParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.attributes->'evolveFrom'->>'${lang}' ILIKE $${evolveParam}`);

    // Description search (all languages in JSONB)
    const descParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.attributes->'description'->>'${lang}' ILIKE $${descParam}`);

    // Abilities search (names and effects)
    const abilityParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.attributes::text ILIKE $${abilityParam} AND c.attributes::text LIKE '%abilities%'`);

    // Attacks search (names, effects, and damage)
    const attackParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.attributes::text ILIKE $${attackParam} AND c.attributes::text LIKE '%attacks%'`);

    // Item search (name and effect)
    const itemParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`(c.attributes->'item')::text ILIKE $${itemParam}`);

    // Effect search (trainer/energy cards)
    const effectParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.attributes->'effect'->>'${lang}' ILIKE $${effectParam}`);

    // Trainer type search
    const trainerTypeParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.attributes->>'trainerType' ILIKE $${trainerTypeParam}`);

    // Energy type search
    const energyTypeParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.attributes->>'energyType' ILIKE $${energyTypeParam}`);

    // Regulation mark search
    const regParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`c.regulation_mark ILIKE $${regParam}`);

    // Set name search
    const setParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`s.name->>'${lang}' ILIKE $${setParam}`);

    // Combine all conditions with OR
    this.conditions.push(`(${searchConditions.join(' OR ')})`);
    return this;
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
   * Add a comprehensive search across serie metadata
   * Searches: name, ID
   */
  whereSerieMetadataSearch(searchTerm: string, lang: string = 'en'): this {
    const searchConditions: string[] = [];
    
    // Serie name search (all languages)
    const langs = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'ko', 'zh'];
    langs.forEach((currentLang) => {
      const paramNum = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      searchConditions.push(`sr.name->>'${currentLang}' ILIKE $${paramNum}`);
    });

    // Serie ID search
    const idParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`sr.id ILIKE $${idParam}`);

    // Combine all conditions with OR
    this.conditions.push(`(${searchConditions.join(' OR ')})`);
    return this;
  }

  /**
   * Add a comprehensive search across set metadata
   * Searches: name, series name
   */
  whereSetMetadataSearch(searchTerm: string, lang: string = 'en'): this {
    const searchConditions: string[] = [];
    
    // Set name search (all languages)
    const langs = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'ko', 'zh'];
    langs.forEach((currentLang) => {
      const paramNum = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      searchConditions.push(`s.name->>'${currentLang}' ILIKE $${paramNum}`);
    });

    // Series name search
    langs.forEach((currentLang) => {
      const paramNum = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      searchConditions.push(`sr.name->>'${currentLang}' ILIKE $${paramNum}`);
    });

    // Set ID search
    const idParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`s.id ILIKE $${idParam}`);

    // Combine all conditions with OR
    this.conditions.push(`(${searchConditions.join(' OR ')})`);
    return this;
  }

  /**
   * Add a comprehensive search across sealed product metadata
   * Searches: name, product type, exclusive retailer, set name
   */
  whereSealedProductMetadataSearch(searchTerm: string, lang: string = 'en'): this {
    const searchConditions: string[] = [];
    
    // Product name search (all languages)
    const langs = ['en', 'fr', 'es', 'de', 'it', 'pt', 'ja', 'ko', 'zh'];
    langs.forEach((currentLang) => {
      const paramNum = this.paramCounter++;
      this.params.push(`%${searchTerm}%`);
      searchConditions.push(`sp.name->>'${currentLang}' ILIKE $${paramNum}`);
    });

    // Product type search
    const typeParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`sp.product_type ILIKE $${typeParam}`);

    // Exclusive retailer search
    const retailerParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`sp.exclusive_retailer ILIKE $${retailerParam}`);

    // Set name search (if joined)
    const setParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`s.name->>'${lang}' ILIKE $${setParam}`);

    // Product ID search
    const idParam = this.paramCounter++;
    this.params.push(`%${searchTerm}%`);
    searchConditions.push(`sp.id ILIKE $${idParam}`);

    // Combine all conditions with OR
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

  // Handle set filter (can be set.id or set.name)
  if (filters.set) {
    qb.whereOr([
      { field: 'set_id', value: filters.set },
      { field: 's.name->>\'en\'', value: filters.set },
    ]);
  }

  // Handle $or conditions (e.g., for set.id OR set.name)
  if (filters.$or && Array.isArray(filters.$or)) {
    const orConditions = filters.$or.map((condition: any) => {
      if (condition['set.id']) {
        return { field: 'set_id', value: condition['set.id'] };
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

  // Handle rarity filter
  if (filters.rarity) {
    qb.whereEquals('c.rarity', filters.rarity);
  }

  // Handle category filter
  if (filters.category) {
    qb.whereEquals('c.category', filters.category);
  }

  // Handle types filter
  if (filters.types) {
    qb.where('c.attributes', '@>', JSON.stringify({ types: Array.isArray(filters.types) ? filters.types : [filters.types] }));
  }

  // Handle HP filter
  if (filters.hp) {
    qb.whereJsonEquals('attributes', 'hp', filters.hp);
  }

  // Handle stage filter
  if (filters.stage) {
    qb.whereJsonEquals('attributes', 'stage', filters.stage);
  }

  // Handle regulation mark filter
  if (filters.regulationMark) {
    qb.whereEquals('c.regulation_mark', filters.regulationMark);
  }

  // Handle illustrator filter
  if (filters.illustrator) {
    qb.where('c.illustrator', 'ILIKE', `%${filters.illustrator}%`);
  }

  // Handle name search - search both card names AND set names
  if (filters.name) {
    const searchTerm = typeof filters.name === 'object' && filters.name.$inc
      ? filters.name.$inc
      : typeof filters.name === 'string'
        ? filters.name
        : typeof filters.name === 'object' && filters.name.$eq
          ? filters.name.$eq
          : null;

    if (searchTerm) {
      // Use whereCardMetadataSearch which includes set name searching
      qb.whereCardMetadataSearch(searchTerm as string, lang);
    }
  }

  // Handle comprehensive search across all metadata
  if (filters.q || filters.search) {
    const searchTerm = filters.q || filters.search;
    if (typeof searchTerm === 'string') {
      qb.whereCardMetadataSearch(searchTerm, lang);
    }
  }

  // Handle dexId filter
  if (filters.dexId && filters.dexId.$in) {
    qb.where('c.attributes->\'dexId\'', '?|', filters.dexId.$in.map(String));
  }

  // Handle pagination
  if (filters.$limit) {
    qb.limit(filters.$limit);
  }

  if (filters.$page && filters.$limit) {
    const offset = (filters.$page - 1) * filters.$limit;
    qb.offset(offset);
  }

  // Handle sorting
  if (filters.$sort) {
    for (const [field, direction] of Object.entries(filters.$sort)) {
      // If sorting by name, use the language-specific name
      const sortField = field === 'name' ? `c.name->>'${lang}'` : field;
      qb.order(sortField, direction === 1 ? 'ASC' : 'DESC');
    }
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
      { field: 'series_id', value: filters.serie },
      { field: 'sr.name->>\'en\'', value: filters.serie },
    ]);
  }

  // Handle $or for serie.id OR serie.name
  if (filters.$or && Array.isArray(filters.$or)) {
    const orConditions = filters.$or.map((condition: any) => {
      if (condition['serie.id']) {
        return { field: 'series_id', value: condition['serie.id'] };
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

  // Handle product type filter
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
