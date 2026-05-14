/**
 * Adiciona colunas Stripe na tabela profiles do Supabase.
 * Execute: node scripts/migrate-stripe.mjs
 */

import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SQL = `
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS plano                  TEXT NOT NULL DEFAULT 'free';

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer
  ON profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
`;

async function main() {
  const client = await pool.connect();
  try {
    console.log("Executando migração Stripe em profiles...");
    await client.query(SQL);
    console.log("Migração concluída com sucesso.");
  } catch (err) {
    console.error("Erro na migração:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
