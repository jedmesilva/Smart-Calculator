import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SQL = `
-- ─── MODELOS LLM ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modelos_llm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  modelo text NOT NULL UNIQUE,
  preco_input_por_milhao numeric NOT NULL,
  preco_output_por_milhao numeric NOT NULL,
  ativo boolean DEFAULT true,
  atualizado_em timestamptz DEFAULT now()
);

-- ─── CONFIGURACOES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS configuracoes (
  chave text PRIMARY KEY,
  valor numeric NOT NULL,
  atualizado_em timestamptz DEFAULT now()
);

-- ─── CONSULTAS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consultas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id text NOT NULL,
  session_id uuid REFERENCES sessions ON DELETE SET NULL,
  tipo text NOT NULL,
  modelo text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  custo_usd numeric NOT NULL DEFAULT 0,
  cambio_usado numeric NOT NULL DEFAULT 0,
  margem_usada numeric NOT NULL DEFAULT 0,
  custo_brl numeric NOT NULL DEFAULT 0,
  creditos_debitados integer NOT NULL DEFAULT 0,
  criado_em timestamptz DEFAULT now()
);

-- ─── CARTEIRA ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carteira (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id text UNIQUE NOT NULL,
  saldo_creditos integer NOT NULL DEFAULT 0,
  total_gasto_brl numeric NOT NULL DEFAULT 0,
  total_consultas integer NOT NULL DEFAULT 0,
  atualizado_em timestamptz DEFAULT now()
);

-- ─── TRANSACOES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id text NOT NULL,
  tipo text NOT NULL,
  creditos integer NOT NULL,
  saldo_anterior integer NOT NULL,
  saldo_posterior integer NOT NULL,
  consulta_id uuid REFERENCES consultas ON DELETE SET NULL,
  descricao text,
  criado_em timestamptz DEFAULT now()
);

-- ─── CAMBIO HISTORICO ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cambio_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usd_brl numeric NOT NULL,
  fonte text DEFAULT 'awesomeapi',
  criado_em timestamptz DEFAULT now()
);

-- ─── SEEDS — MODELOS ───────────────────────────────────────────
INSERT INTO modelos_llm (provider, modelo, preco_input_por_milhao, preco_output_por_milhao) VALUES
  ('openai', 'gpt-4o',       2.50, 10.00),
  ('openai', 'gpt-4o-mini',  0.15,  0.60),
  ('openai', 'gpt-5.1',      2.00,  8.00),
  ('openai', 'gpt-4.1',      2.00,  8.00),
  ('openai', 'gpt-4.1-mini', 0.40,  1.60),
  ('openai', 'gpt-5-mini',   0.40,  1.60)
ON CONFLICT (modelo) DO NOTHING;

-- ─── SEEDS — CONFIGURACOES ─────────────────────────────────────
INSERT INTO configuracoes (chave, valor) VALUES
  ('usd_brl',               5.80),
  ('margem_multiplicador',  3.0),
  ('credito_valor_brl',     0.10)
ON CONFLICT (chave) DO NOTHING;

-- ─── VIEW: custo por modelo ────────────────────────────────────
CREATE OR REPLACE VIEW custo_por_modelo AS
SELECT
  modelo,
  count(*)                    AS total_consultas,
  sum(input_tokens)           AS total_input,
  sum(output_tokens)          AS total_output,
  sum(custo_usd)              AS custo_total_usd,
  sum(custo_brl)              AS custo_total_brl,
  sum(creditos_debitados)     AS creditos_gerados,
  avg(creditos_debitados)     AS media_creditos_consulta
FROM consultas
GROUP BY modelo;

-- ─── VIEW: receita vs custo ────────────────────────────────────
CREATE OR REPLACE VIEW receita_vs_custo AS
SELECT
  date_trunc('day', criado_em)                               AS dia,
  sum(custo_usd)                                             AS custo_real_usd,
  sum(custo_brl)                                             AS custo_real_brl,
  sum(creditos_debitados * 0.10)                             AS receita_brl,
  sum(creditos_debitados * 0.10) - sum(custo_brl)           AS lucro_brl
FROM consultas
GROUP BY dia
ORDER BY dia DESC;
`;

async function main() {
  const client = await pool.connect();
  try {
    console.log("Running billing migration…");
    await client.query(SQL);
    console.log("Migration complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
