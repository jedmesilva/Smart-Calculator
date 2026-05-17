/* ═══════════════════════════════════════════════════════
   Guest Billing — custo real de cálculos para visitantes.
   Usa a mesma infraestrutura de preço que usuários autenticados:
   mesma fórmula de custo, mesmos tokens, mesmo câmbio.

   Diferença: em vez de debitar uma carteira de créditos inteiros,
   acumula o custo fracionário em creditos_gastos e bloqueia
   quando ultrapassa creditos_quota (padrão: 3 créditos).

   Calcs de visitantes entram no recomputeSubsidio e
   recomputeCreditoValor via tabela guest_consultas (UNION ALL).
   ═══════════════════════════════════════════════════════ */

import { pool } from "@workspace/db";
import { logger } from "./logger";
import {
  computeCreditBreakdown,
  recomputeSubsidio,
  recomputeCreditoValor,
} from "./billingService";
import type { TokenUsage } from "./billingService";

export const GUEST_QUOTA_CREDITS = 3.0;
const CREDIT_FLOOR = 0.001; // tolerância mínima para considerar esgotado

/* ══════════════════════════════════════════════════════
   Garantia de tabelas (idempotente — chamada no boot)
   ══════════════════════════════════════════════════════ */

export async function ensureGuestTables(): Promise<void> {
  const client = await pool.connect();
  try {
    /* Tabela de sessões de visitantes */
    await client.query(`
      CREATE TABLE IF NOT EXISTS guest_sessions (
        id              UUID        PRIMARY KEY,
        guest_name      TEXT,
        creditos_gastos DECIMAL(10,4) NOT NULL DEFAULT 0,
        creditos_quota  DECIMAL(10,4) NOT NULL DEFAULT ${GUEST_QUOTA_CREDITS},
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    /* Migração: adiciona colunas novas se a tabela existia com schema antigo */
    await client.query(`
      ALTER TABLE guest_sessions
        ADD COLUMN IF NOT EXISTS creditos_gastos DECIMAL(10,4) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS creditos_quota  DECIMAL(10,4) NOT NULL DEFAULT ${GUEST_QUOTA_CREDITS}
    `).catch(() => { /* colunas já existem — ok */ });

    /* Tabela de consultas de visitantes
       Separada de 'consultas' para evitar FK sobre profiles/carteira.
       Incluída no recomputeSubsidio e recomputeCreditoValor via UNION ALL. */
    await client.query(`
      CREATE TABLE IF NOT EXISTS guest_consultas (
        id                 BIGSERIAL    PRIMARY KEY,
        guest_id           UUID         NOT NULL REFERENCES guest_sessions(id) ON DELETE CASCADE,
        tipo               TEXT         NOT NULL,
        modelo             TEXT         NOT NULL,
        input_tokens       INTEGER      NOT NULL DEFAULT 0,
        output_tokens      INTEGER      NOT NULL DEFAULT 0,
        custo_usd          DECIMAL(14,8) NOT NULL DEFAULT 0,
        cambio_usado       DECIMAL(10,4) NOT NULL DEFAULT 0,
        margem_usada       DECIMAL(10,4) NOT NULL DEFAULT 0,
        custo_brl          DECIMAL(12,6) NOT NULL DEFAULT 0,
        creditos_debitados DECIMAL(10,4) NOT NULL DEFAULT 0,
        subsidiado         BOOLEAN      NOT NULL DEFAULT TRUE,
        criado_em          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    logger.info("guestBilling: tabelas garantidas");
  } catch (err) {
    logger.warn({ err }, "guestBilling: falha ao garantir tabelas");
  } finally {
    client.release();
  }
}

/* ══════════════════════════════════════════════════════
   Verificação de saldo (sem lock — apenas leitura)
   ══════════════════════════════════════════════════════ */

/**
 * Retorna os créditos restantes do visitante (quota − gastos).
 * Se a sessão não existir ainda, retorna a quota padrão.
 */
export async function checkGuestSaldo(guestId: string): Promise<number> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT creditos_gastos, creditos_quota FROM guest_sessions WHERE id = $1`,
      [guestId]
    );
    if (res.rows.length === 0) return GUEST_QUOTA_CREDITS;
    const gastos = parseFloat(res.rows[0].creditos_gastos ?? "0");
    const quota  = parseFloat(res.rows[0].creditos_quota  ?? String(GUEST_QUOTA_CREDITS));
    return Math.max(0, quota - gastos);
  } catch {
    return GUEST_QUOTA_CREDITS; // em caso de erro, deixa passar (o lock no débito vai tratar)
  } finally {
    client.release();
  }
}

/* ══════════════════════════════════════════════════════
   Registro de consulta de visitante (atômico)
   ══════════════════════════════════════════════════════ */

export interface GuestBillingResult {
  creditsLeft: number;
  creditosDebitados: number;
  custoUsd: number;
  custoBrl: number;
}

/**
 * Registra uma consulta de visitante com custo real.
 *
 * - Usa exatamente a mesma fórmula de custo que registerConsulta
 *   (via computeCreditBreakdown com isFree = true)
 * - Debita creditosFrac (valor real sem arredondamento) da cota da sessão
 * - Insere em guest_consultas para que recomputeSubsidio e
 *   recomputeCreditoValor incluam o custo deste cálculo
 * - Lança erro com code "saldo_insuficiente" se cota esgotada
 */
export async function registerGuestConsulta(opts: {
  guestId: string;
  modelo: string;
  tipo: string;
  tokenUsage: TokenUsage;
}): Promise<GuestBillingResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    /* Lock na sessão — evita race condition com múltiplas requisições simultâneas */
    const sessRes = await client.query(
      `SELECT creditos_gastos, creditos_quota
       FROM guest_sessions WHERE id = $1 FOR UPDATE`,
      [opts.guestId]
    );

    if (sessRes.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new Error("Guest session not found");
    }

    const gastos = parseFloat(sessRes.rows[0].creditos_gastos ?? "0");
    const quota  = parseFloat(sessRes.rows[0].creditos_quota  ?? String(GUEST_QUOTA_CREDITS));
    const creditsAvailable = Math.max(0, quota - gastos);

    /* Verifica cota antes de processar */
    if (creditsAvailable <= CREDIT_FLOOR) {
      await client.query("ROLLBACK");
      const err: any = new Error("saldo_insuficiente");
      err.code = "saldo_insuficiente";
      throw err;
    }

    /* Computa custo real — mesmo pipeline dos usuários autenticados (isFree = true) */
    const breakdown = await computeCreditBreakdown(client, opts.tokenUsage, true);
    const { custoUsd, custoBrl, creditosFrac, cambio, margemPlataforma } = breakdown;

    /* Usa fração real (não arredondada) para não prejudicar visitantes */
    const creditosDebitados = Math.min(creditosFrac, creditsAvailable);
    const novosGastos       = Math.min(quota, gastos + creditosDebitados);

    /* Registra em guest_consultas (subsidiado = true — recebe subsídio dos pagantes) */
    await client.query(
      `INSERT INTO guest_consultas
         (guest_id, tipo, modelo, input_tokens, output_tokens,
          custo_usd, cambio_usado, margem_usada, custo_brl, creditos_debitados, subsidiado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)`,
      [
        opts.guestId,
        opts.tipo,
        opts.modelo,
        opts.tokenUsage.inputTokens,
        opts.tokenUsage.outputTokens,
        custoUsd,
        cambio,
        margemPlataforma,
        custoBrl,
        creditosDebitados,
      ]
    );

    /* Atualiza gastos acumulados da sessão */
    await client.query(
      `UPDATE guest_sessions SET creditos_gastos = $1 WHERE id = $2`,
      [novosGastos.toFixed(4), opts.guestId]
    );

    await client.query("COMMIT");

    const creditsLeft = Math.max(0, quota - novosGastos);

    logger.info(
      {
        guestId: opts.guestId,
        custoUsd: custoUsd.toFixed(8),
        custoBrl: custoBrl.toFixed(6),
        creditosDebitados: creditosDebitados.toFixed(4),
        creditsLeft: creditsLeft.toFixed(4),
      },
      "guestBilling: consulta registrada"
    );

    /* Recomputa subsídio e valor do crédito incluindo este cálculo (fire-and-forget) */
    recomputeSubsidio().catch((err) =>
      logger.warn({ err }, "guestBilling: recomputeSubsidio falhou silenciosamente")
    );
    recomputeCreditoValor().catch((err) =>
      logger.warn({ err }, "guestBilling: recomputeCreditoValor falhou silenciosamente")
    );

    return { creditsLeft, creditosDebitados, custoUsd, custoBrl };
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
