import { pool } from './server/src/libs/db';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigration() {
  const migrationFile = process.argv[2];
  if (!migrationFile) {
    console.error('Usage: bun run-migration.ts <migration-file>');
    process.exit(1);
  }

  try {
    const migrationPath = join(process.cwd(), 'migrations', migrationFile);
    const sql = readFileSync(migrationPath, 'utf8');

    console.log(`Running migration: ${migrationFile}`);
    await pool.query(sql);
    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
