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

  // Handle name search
  if (filters.name) {
    // Handle object with $inc operator (from query parser)
    if (typeof filters.name === 'object' && filters.name.$inc) {
      qb.whereJsonContains('c.name', lang, filters.name.$inc);
    } else if (typeof filters.name === 'string') {
      qb.whereJsonContains('c.name', lang, filters.name);
    } else if (typeof filters.name === 'object' && filters.name.$eq) {
      qb.whereJsonEquals('c.name', lang, filters.name.$eq);
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

  return qb;
}
