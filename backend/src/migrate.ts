import fs from 'fs';
import path from 'path';
import { pool } from './config/database';

/**
 * Run the schema.sql migration file against the database.
 * Usage: npm run migrate
 */
async function migrate() {
  console.log('Running GridWatch database migration...\n');

  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  try {
    await pool.query(sql);
    console.log('✓ Migration completed successfully');
  } catch (err: any) {
    console.error('✗ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
