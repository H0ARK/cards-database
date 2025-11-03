/**
 * PostgreSQL Database Connection Pool
 *
 * This module provides a shared connection pool for the entire application.
 * All database queries should use this pool to ensure efficient connection management.
 */

import { Pool, PoolConfig } from 'pg';

// Database configuration from environment variables
const config: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'carddb',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',

  // Connection pool settings
  max: 20, // Maximum number of connections in the pool
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // Timeout when acquiring a connection

  // Application name for debugging
  application_name: 'tcgdex-api',
};

// Create the pool
export const pool = new Pool(config);

// Error handler for unexpected pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Graceful shutdown handler
const shutdown = async () => {
  console.log('Closing database connection pool...');
  await pool.end();
  console.log('Database connection pool closed');
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/**
 * Test the database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful at', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

/**
 * Get database statistics
 */
export async function getStats() {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM cards) as total_cards,
      (SELECT COUNT(*) FROM sets) as total_sets,
      (SELECT COUNT(*) FROM series) as total_series,
      (SELECT COUNT(*) FROM card_variants) as total_variants,
      (SELECT COUNT(*) FROM sealed_products) as total_sealed_products
  `);
  return result.rows[0];
}

export default pool;
