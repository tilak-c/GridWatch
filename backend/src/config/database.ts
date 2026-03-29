import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                    // Connection pool size
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

// Test connection on startup
export async function testConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW()');
    console.log('✓ PostgreSQL connected:', result.rows[0].now);
  } finally {
    client.release();
  }
}
