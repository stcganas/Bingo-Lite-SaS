import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const client = new Client({
  host: process.env.SQL_HOST,
  user: process.env.SQL_ADMIN_USER,
  password: process.env.SQL_ADMIN_PASSWORD,
  database: process.env.SQL_DB_NAME,
  port: 5432,
  ssl: false
});

async function run() {
  console.log('Connecting to Postgres as Admin:', process.env.SQL_ADMIN_USER);
  try {
    await client.connect();
    console.log('Connected successfully!');

    // 1. Add card_count to players
    console.log('Adding card_count to players...');
    await client.query(`
      ALTER TABLE public.players 
      ADD COLUMN IF NOT EXISTS card_count INTEGER DEFAULT 0;
    `);
    console.log('✅ card_count column checked/added.');

    // 2. Add other potential missing columns to players table based on supabase_schema.sql
    console.log('Checking for other players columns...');
    await client.query(`
      ALTER TABLE public.players 
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS state TEXT,
      ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS seller_code TEXT;
    `);
    console.log('✅ Other players columns checked/added.');

    // 3. Make sure the schema cache for PostgREST is reloaded
    console.log('Reloading PostgREST schema cache...');
    await client.query(`NOTIFY pgrst, 'reload schema';`);
    console.log('✅ PostgREST schema reload signal sent!');

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Error running Postgres query:', err);
  } finally {
    await client.end();
  }
}

run();
