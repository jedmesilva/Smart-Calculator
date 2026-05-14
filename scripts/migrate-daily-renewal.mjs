/**
 * Adiciona coluna ultima_renovacao_diaria na tabela carteira
 * e atualiza margem para 2.0 (100% sobre custo).
 * Execute: node scripts/migrate-daily-renewal.mjs
 */
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    console.log("Executando migração...");

    await client.query(
      `ALTER TABLE carteira ADD COLUMN IF NOT EXISTS ultima_renovacao_diaria TIMESTAMPTZ`
    );
    console.log("✓ Coluna ultima_renovacao_diaria adicionada");

    const r = await client.query(
      `UPDATE configuracoes SET valor = '2.0' WHERE chave = 'margem_multiplicador'`
    );
    console.log(`✓ Margem atualizada para 2.0 (${r.rowCount} linha(s) afetada(s))`);

    console.log("✅ Migração concluída.");
  } catch (err) {
    console.error("Erro na migração:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
