/* ═══════════════════════════════════════════════════════
   Billing Service — rastreamento de tokens, cálculo de
   custo real (USD → BRL com margem) e débito da carteira.
   ═══════════════════════════════════════════════════════ */

import { pool } from "@workspace/db";
import { logger } from "./logger";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface TokenAccumulator {
  inputTokens: number;
  outputTokens: number;
  model: string;
  add(usage: { prompt_tokens?: number | null; completion_tokens?: number | null } | null | undefined): void;
  toTokenUsage(): TokenUsage;
}

export function createTokenAccumulator(model = "gpt-5.1"): TokenAccumulator {
  return {
    inputTokens: 0,
    outputTokens: 0,
    model,
    add(usage) {
      this.inputTokens  += usage?.prompt_tokens     ?? 0;
      this.outputTokens += usage?.completion_tokens ?? 0;
    },
    toTokenUsage() {
      return { model: this.model, inputTokens: this.inputTokens, outputTokens: this.outputTokens };
    },
  };
}

/* ── Preços fallback quando o modelo não está na tabela ── */
const FALLBACK_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o":       { input: 2.50, output: 10.00 },
  "gpt-4o-mini":  { input: 0.15, output: 0.60  },
  "gpt-5.1":      { input: 2.00, output: 8.00  },
  "gpt-4.1":      { input: 2.00, output: 8.00  },
  "gpt-4.1-mini": { input: 0.40, output: 1.60  },
};

const FALLBACK_USD_BRL     = 5.80;
const FALLBACK_MARGEM      = 2.0;   // margem 100% sobre custo
const FALLBACK_CREDITO_BRL = 0.10;  // valor padrão de 1 crédito em BRL
const WELCOME_CREDITS      = 10;    // créditos de boas-vindas para novos usuários
const FREE_DAILY_CREDITS   = 10;    // créditos renovados diariamente para plano free

/* ══════════════════════════════════════════════════════
   Interface de breakdown de custo — compartilhada
   ══════════════════════════════════════════════════════ */

export interface CreditBreakdown {
  custoUsd: number;
  custoBrl: number;          // custo pós-margem (armazenado em consultas)
  custoFinal: number;        // custo total com todos os componentes
  creditos: number;          // Math.ceil(custoFinal / creditoValor) — para carteiras de usuários
  creditosFrac: number;      // custoFinal / creditoValor — para controle fracionário (visitantes)
  cambio: number;
  margemPlataforma: number;
  subsidioFixo: number;
  creditoValor: number;
}

/**
 * Computa o breakdown de custo para uma consulta.
 *
 * Recebe uma conexão de banco ativa (pode ou não estar em transação).
 * É reutilizado por registerConsulta (usuários autenticados) e
 * registerGuestConsulta (visitantes), garantindo custo idêntico para ambos.
 *
 * @param isFree — true para usuários free e visitantes (sem subsidioFixo adicionado)
 */
export async function computeCreditBreakdown(
  client: any,
  tokenUsage: TokenUsage,
  isFree: boolean
): Promise<CreditBreakdown> {
  /* 1. Preço do modelo */
  const modelRes = await client.query(
    `SELECT preco_input_por_milhao, preco_output_por_milhao
     FROM modelos_llm WHERE modelo = $1 AND ativo = true LIMIT 1`,
    [tokenUsage.model]
  );
  const fallback    = FALLBACK_PRICES[tokenUsage.model] ?? FALLBACK_PRICES["gpt-4o"];
  const precoInput  = modelRes.rows.length > 0
    ? parseFloat(modelRes.rows[0].preco_input_por_milhao)
    : fallback.input;
  const precoOutput = modelRes.rows.length > 0
    ? parseFloat(modelRes.rows[0].preco_output_por_milhao)
    : fallback.output;

  /* 2. Configurações de precificação */
  const cfgRes = await client.query(
    `SELECT chave, valor FROM configuracoes
     WHERE chave IN (
       'usd_brl', 'margem_multiplicador', 'credito_valor_brl',
       'taxa_imposto', 'taxa_processamento', 'taxa_subsidio_brl'
     )`
  );
  const cfg: Record<string, number> = {};
  for (const row of cfgRes.rows) cfg[row.chave] = parseFloat(row.valor);

  const cambio            = cfg["usd_brl"]             ?? FALLBACK_USD_BRL;
  const margemPlataforma  = cfg["margem_multiplicador"] ?? FALLBACK_MARGEM;
  const creditoValor      = cfg["credito_valor_brl"]   ?? FALLBACK_CREDITO_BRL;
  const taxaImposto       = cfg["taxa_imposto"]         ?? 1.0;
  const taxaProcessamento = cfg["taxa_processamento"]  ?? 0.03;
  // Subsídio só é cobrado de usuários PAGANTES — eles arcam com o custo dos free/visitantes
  const subsidioFixo      = isFree ? 0 : (cfg["taxa_subsidio_brl"] ?? 0);

  /* 3. Cálculo de custo em cascata */
  const custoUsd         = (tokenUsage.inputTokens  / 1_000_000 * precoInput) +
                           (tokenUsage.outputTokens / 1_000_000 * precoOutput);
  const custoBase        = custoUsd * cambio;
  const comMargem        = custoBase * margemPlataforma;          // +100% margem de plataforma
  const comImposto       = comMargem * (1 + taxaImposto);         // +100% imposto sobre total
  const comProcessamento = comImposto * (1 + taxaProcessamento);  // +3% de processamento
  const custoFinal       = comProcessamento + subsidioFixo;       // + subsídio por consulta paga

  // custoBrl = custo pós-margem, registrado para cálculo histórico do subsídio
  const custoBrl     = comMargem;
  const creditosFrac = custoFinal / creditoValor;                 // fração real (para visitantes)
  const creditos     = Math.max(1, Math.ceil(creditosFrac));      // inteiro para carteiras

  return {
    custoUsd, custoBrl, custoFinal,
    creditos, creditosFrac,
    cambio, margemPlataforma, subsidioFixo, creditoValor,
  };
}

/* ══════════════════════════════════════════════════════
   Interfaces públicas
   ══════════════════════════════════════════════════════ */

export interface BillingResult {
  creditosDebitados: number;
  custoUsd: number;
  custoBrl: number;
  saldoPosterior: number;
}

export interface CarteiraInfo {
  saldo: number;
  totalConsultas: number;
  totalGastoBrl: number;
  totalCreditosConsumidos: number;
  plano: string;
  pdfUsadosHoje: number;
  pdfLimite: number;
  ultimaRenovacao: string | null;
}

// Limites de PDF por plano por dia
export const PDF_LIMITS: Record<string, number> = {
  free: 0,
  starter: 2,
  pro: 10,
};

/* ── Busca ou cria carteira do usuário ── */
async function ensureCarteira(client: any, userId: string): Promise<number> {
  const res = await client.query(
    `SELECT saldo_creditos FROM carteira WHERE usuario_id = $1 FOR UPDATE`,
    [userId]
  );
  if (res.rows.length > 0) {
    return res.rows[0].saldo_creditos as number;
  }
  // Primeira vez — cria com créditos de boas-vindas
  await client.query(
    `INSERT INTO carteira (usuario_id, saldo_creditos, total_gasto_brl, total_consultas)
     VALUES ($1, $2, 0, 0)
     ON CONFLICT (usuario_id) DO NOTHING`,
    [userId, WELCOME_CREDITS]
  );
  // Registra bônus
  await client.query(
    `INSERT INTO transacoes (usuario_id, tipo, creditos, saldo_anterior, saldo_posterior, descricao)
     VALUES ($1, 'bonus', $2, 0, $2, 'Créditos de boas-vindas')`,
    [userId, WELCOME_CREDITS]
  );
  logger.info({ userId, credits: WELCOME_CREDITS }, "billing: welcome credits granted");
  return WELCOME_CREDITS;
}

/* ── Verifica se usuário tem créditos suficientes (sem lock) ── */
export async function checkSaldo(userId: string): Promise<number> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT saldo_creditos FROM carteira WHERE usuario_id = $1`,
      [userId]
    );
    if (res.rows.length === 0) return WELCOME_CREDITS; // novo usuário — receberá boas-vindas no primeiro débito
    return res.rows[0].saldo_creditos as number;
  } catch {
    return 999; // em caso de erro de DB, deixa passar (o lock no débito vai tratar)
  } finally {
    client.release();
  }
}

/* ── Busca saldo da carteira (provisiona se não existir) ── */
export async function getCarteira(userId: string): Promise<CarteiraInfo | null> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT c.saldo_creditos, c.total_consultas, c.total_gasto_brl,
              COALESCE((
                SELECT SUM(-t.creditos) FROM transacoes t
                WHERE t.usuario_id = $1 AND t.tipo = 'debito'
              ), 0) AS total_creditos_consumidos,
              COALESCE(p.plano, 'free') AS plano,
              COALESCE(c.pdf_downloads_hoje, 0) AS pdf_downloads_hoje,
              c.pdf_ultima_renovacao_pdf,
              c.ultima_renovacao_diaria
       FROM carteira c
       LEFT JOIN profiles p ON p.id::text = $1
       WHERE c.usuario_id = $1`,
      [userId]
    );
    if (res.rows.length === 0) {
      // Provisiona carteira para novos usuários
      try {
        await client.query(
          `INSERT INTO carteira (usuario_id, saldo_creditos, total_gasto_brl, total_consultas)
           VALUES ($1, $2, 0, 0) ON CONFLICT (usuario_id) DO NOTHING`,
          [userId, WELCOME_CREDITS]
        );
        await client.query(
          `INSERT INTO transacoes (usuario_id, tipo, creditos, saldo_anterior, saldo_posterior, descricao)
           VALUES ($1, 'bonus', $2, 0, $2, 'Créditos de boas-vindas')`,
          [userId, WELCOME_CREDITS]
        );
        logger.info({ userId }, "billing: carteira provisionada via getCarteira");
      } catch (provErr) {
        logger.warn({ provErr, userId }, "billing: falha ao provisionar carteira em getCarteira");
      }
      return { saldo: WELCOME_CREDITS, totalConsultas: 0, totalGastoBrl: 0, totalCreditosConsumidos: 0, plano: "free", pdfUsadosHoje: 0, pdfLimite: PDF_LIMITS["free"], ultimaRenovacao: null };
    }
    const row = res.rows[0];
    const plano: string = row.plano ?? "free";
    const hoje = new Date().toISOString().slice(0, 10);

    const pdfRenovacao = row.pdf_ultima_renovacao_pdf;
    const pdfRenovacaoStr = pdfRenovacao
      ? (pdfRenovacao instanceof Date ? pdfRenovacao.toISOString().slice(0, 10) : String(pdfRenovacao).slice(0, 10))
      : null;
    const pdfUsadosHoje = pdfRenovacaoStr === hoje ? parseInt(row.pdf_downloads_hoje ?? "0", 10) : 0;

    const ultimaRenovacaoDiaria = row.ultima_renovacao_diaria;
    const ultimaRenovacaoStr = ultimaRenovacaoDiaria
      ? (ultimaRenovacaoDiaria instanceof Date ? ultimaRenovacaoDiaria.toISOString().slice(0, 10) : String(ultimaRenovacaoDiaria).slice(0, 10))
      : null;

    return {
      saldo: row.saldo_creditos,
      totalConsultas: row.total_consultas,
      totalGastoBrl: parseFloat(row.total_gasto_brl ?? "0"),
      totalCreditosConsumidos: parseInt(row.total_creditos_consumidos ?? "0", 10),
      plano,
      pdfUsadosHoje,
      pdfLimite: PDF_LIMITS[plano] ?? 0,
      ultimaRenovacao: ultimaRenovacaoStr,
    };
  } catch (err) {
    logger.warn({ err, userId }, "billing: getCarteira failed");
    return null;
  } finally {
    client.release();
  }
}

/* ── Auto-migração: garante colunas de cota de PDF na carteira ── */
export async function ensurePdfQuotaColumns(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE carteira
        ADD COLUMN IF NOT EXISTS pdf_downloads_hoje INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS pdf_ultima_renovacao_pdf DATE
    `);
    logger.info("billing: colunas pdf_quota garantidas");
  } catch (err) {
    logger.warn({ err }, "billing: erro ao garantir colunas pdf_quota");
  } finally {
    client.release();
  }
}

/* ── Verifica e incrementa cota diária de PDF ── */
export async function checkAndIncrementPdfQuota(userId: string): Promise<{
  allowed: boolean;
  plano: string;
  limite: number;
  usados: number;
}> {
  const client = await pool.connect();
  try {
    const planoRes = await client.query(
      `SELECT COALESCE(plano, 'free') AS plano FROM profiles WHERE id::text = $1 LIMIT 1`,
      [userId]
    );
    const plano: string = planoRes.rows[0]?.plano ?? "free";
    const limite = PDF_LIMITS[plano] ?? 0;

    if (limite === 0) {
      return { allowed: false, plano, limite: 0, usados: 0 };
    }

    await client.query("BEGIN");

    const cartRes = await client.query(
      `SELECT COALESCE(pdf_downloads_hoje, 0) AS pdf_downloads_hoje, pdf_ultima_renovacao_pdf
       FROM carteira WHERE usuario_id = $1 FOR UPDATE`,
      [userId]
    );

    const hoje = new Date().toISOString().slice(0, 10);
    const ultimaRenovacao = cartRes.rows[0]?.pdf_ultima_renovacao_pdf;
    const ultimaRenovacaoStr = ultimaRenovacao
      ? (ultimaRenovacao instanceof Date ? ultimaRenovacao.toISOString().slice(0, 10) : String(ultimaRenovacao).slice(0, 10))
      : null;

    let usados = ultimaRenovacaoStr === hoje ? parseInt(cartRes.rows[0]?.pdf_downloads_hoje ?? "0", 10) : 0;

    if (usados >= limite) {
      await client.query("ROLLBACK");
      return { allowed: false, plano, limite, usados };
    }

    await client.query(
      `UPDATE carteira SET
         pdf_downloads_hoje = $1,
         pdf_ultima_renovacao_pdf = $2::date,
         atualizado_em = now()
       WHERE usuario_id = $3`,
      [usados + 1, hoje, userId]
    );

    await client.query("COMMIT");
    return { allowed: true, plano, limite, usados: usados + 1 };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.warn({ err, userId }, "billing: checkAndIncrementPdfQuota falhou");
    return { allowed: true, plano: "unknown", limite: 99, usados: 0 };
  } finally {
    client.release();
  }
}

/* ── Busca histórico de transações ── */
export async function getTransacoes(userId: string, limit = 20): Promise<any[]> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT tipo, creditos, saldo_anterior, saldo_posterior, descricao, criado_em
       FROM transacoes WHERE usuario_id = $1
       ORDER BY criado_em DESC LIMIT $2`,
      [userId, limit]
    );
    return res.rows;
  } catch (err) {
    logger.warn({ err }, "billing: getTransacoes failed");
    return [];
  } finally {
    client.release();
  }
}

/* ══════════════════════════════════════════════════════
   Registro de consulta e débito de créditos (atômico)
   ══════════════════════════════════════════════════════ */

export async function registerConsulta(opts: {
  userId: string;
  modelo: string;
  tipo: string;
  sessionId?: string | null;
  tokenUsage: TokenUsage;
}): Promise<BillingResult | null> {
  const client = await pool.connect();
  try {
    // 0. Determina plano do usuário ANTES da transação (leitura simples)
    const planoRes = await client.query(
      `SELECT COALESCE(plano, 'free') AS plano FROM profiles WHERE id::text = $1 LIMIT 1`,
      [opts.userId]
    );
    const planoUsuario: string = planoRes.rows[0]?.plano ?? "free";
    const isFree = planoUsuario === "free";

    await client.query("BEGIN");

    // 1. Computa custo real usando a função compartilhada
    const breakdown = await computeCreditBreakdown(client, opts.tokenUsage, isFree);
    const { custoUsd, custoBrl, creditos, cambio, margemPlataforma, subsidioFixo } = breakdown;

    logger.debug(
      { planoUsuario, isFree, ...breakdown },
      "billing: breakdown de custo"
    );

    // 2. Garante carteira existe e faz lock
    const saldoAnterior = await ensureCarteira(client, opts.userId);

    if (saldoAnterior < creditos) {
      await client.query("ROLLBACK");
      logger.warn({ userId: opts.userId, saldo: saldoAnterior, creditos }, "billing: saldo insuficiente");
      return null;
    }

    const saldoPosterior = saldoAnterior - creditos;

    // 3. Insere consulta com flag de subsídio
    //    subsidiado = true  → cálculo gratuito (recebe subsídio dos pagantes)
    //    subsidiado = false → cálculo pago (arca com o custo dos free + visitantes)
    const consultaRes = await client.query(
      `INSERT INTO consultas
         (usuario_id, session_id, tipo, modelo, input_tokens, output_tokens,
          custo_usd, cambio_usado, margem_usada, custo_brl, creditos_debitados, subsidiado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        opts.userId,
        opts.sessionId ?? null,
        opts.tipo,
        opts.modelo,
        opts.tokenUsage.inputTokens,
        opts.tokenUsage.outputTokens,
        custoUsd,
        cambio,
        margemPlataforma,
        custoBrl,
        creditos,
        isFree,  // subsidiado
      ]
    );
    const consultaId = consultaRes.rows[0].id;

    // 4. Atualiza carteira
    await client.query(
      `UPDATE carteira SET
         saldo_creditos  = $1,
         total_gasto_brl = total_gasto_brl + $2,
         total_consultas = total_consultas + 1,
         atualizado_em   = now()
       WHERE usuario_id = $3`,
      [saldoPosterior, custoBrl, opts.userId]
    );

    // 5. Registra transação
    await client.query(
      `INSERT INTO transacoes
         (usuario_id, tipo, creditos, saldo_anterior, saldo_posterior, consulta_id, descricao)
       VALUES ($1, 'debito', $2, $3, $4, $5, $6)`,
      [
        opts.userId,
        -creditos,
        saldoAnterior,
        saldoPosterior,
        consultaId,
        `Consulta Phormula — ${opts.modelo}`,
      ]
    );

    await client.query("COMMIT");

    logger.info(
      { userId: opts.userId, planoUsuario, isFree, creditos, saldoPosterior, custoUsd, custoBrl, subsidioFixo },
      "billing: consulta registrada"
    );

    // 6. Recomputa subsídio e valor do crédito em tempo real (fire-and-forget)
    //    Ambas as funções incluem guest_consultas no cálculo
    recomputeSubsidio().catch((err) =>
      logger.warn({ err }, "billing: recomputeSubsidio pós-calc falhou")
    );
    recomputeCreditoValor().catch((err) =>
      logger.warn({ err }, "billing: recomputeCreditoValor pós-calc falhou")
    );

    return { creditosDebitados: creditos, custoUsd, custoBrl, saldoPosterior };
  } catch (err: any) {
    await client.query("ROLLBACK").catch(() => {});
    logger.warn({ err: err?.message, userId: opts.userId }, "billing: registerConsulta failed");
    return null;
  } finally {
    client.release();
  }
}

/* ══════════════════════════════════════════════════════
   Recomputação do subsídio — inclui visitantes
   ══════════════════════════════════════════════════════

   Fórmula: subsidio_por_calc_pago = Σcusto_brl(free + visitantes, mês) / COUNT(calcs_pagas, mês)
   Limitado a 5× o custo médio dos calcs gratuitos.
   Inclui guest_consultas via UNION ALL (com try-catch se tabela não existir ainda).
*/
export async function recomputeSubsidio(): Promise<void> {
  const client = await pool.connect();
  try {
    let statsRes: any;
    try {
      // Query combinada: consultas + guest_consultas
      statsRes = await client.query(`
        SELECT
          COALESCE(SUM(custo_brl) FILTER (WHERE subsidiado = true),  0) AS custo_free_total,
          COALESCE(COUNT(*)       FILTER (WHERE subsidiado = true),  0) AS calcs_free,
          COALESCE(COUNT(*)       FILTER (WHERE subsidiado = false), 0) AS calcs_pagas
        FROM (
          SELECT custo_brl, subsidiado
          FROM consultas
          WHERE criado_em >= date_trunc('month', now())
          UNION ALL
          SELECT custo_brl, true AS subsidiado
          FROM guest_consultas
          WHERE criado_em >= date_trunc('month', now())
        ) combined
      `);
    } catch {
      // guest_consultas ainda não existe — usa só consultas
      statsRes = await client.query(`
        SELECT
          COALESCE(SUM(custo_brl) FILTER (WHERE subsidiado = true),  0) AS custo_free_total,
          COALESCE(COUNT(*)       FILTER (WHERE subsidiado = true),  0) AS calcs_free,
          COALESCE(COUNT(*)       FILTER (WHERE subsidiado = false), 0) AS calcs_pagas
        FROM consultas
        WHERE criado_em >= date_trunc('month', now())
      `);
    }

    const row          = statsRes.rows[0];
    const custoFreeTotal = parseFloat(row?.custo_free_total ?? "0");
    const calcsFree      = parseInt(row?.calcs_free         ?? "0", 10);
    const calcsPagas     = parseInt(row?.calcs_pagas        ?? "0", 10);

    const custoMedioFree = calcsFree > 0 ? custoFreeTotal / calcsFree : 0;

    let subsidio = 0;
    if (calcsFree > 0 && calcsPagas > 0 && custoFreeTotal > 0) {
      const raw = custoFreeTotal / calcsPagas;
      // Cap: nunca mais que 5× o custo médio de um cálculo gratuito por cálculo pago
      subsidio = Math.min(raw, custoMedioFree * 5);
    }

    await client.query(
      `UPDATE configuracoes SET valor = $1, atualizado_em = now() WHERE chave = 'taxa_subsidio_brl'`,
      [subsidio.toFixed(6)]
    );

    logger.info(
      {
        calcsFree,
        calcsPagas,
        custoFreeTotal: custoFreeTotal.toFixed(4),
        custoMedioFree: custoMedioFree.toFixed(4),
        subsidio: subsidio.toFixed(6),
      },
      "billing: subsídio recomputado"
    );
  } catch (err) {
    logger.warn({ err }, "billing: falha ao recomputar subsídio");
  } finally {
    client.release();
  }
}

/* ══════════════════════════════════════════════════════
   Recomputação dinâmica do valor do crédito
   ══════════════════════════════════════════════════════

   Fórmula:
     subsidioRatio    = MIN(0.95, subsidioColetado / custo_free_total)
     creditoValor     = CLAMP(avgCustoFree / (1 − subsidioRatio),
                              piso_dinamico, cap_dinamico)

   Onde:
     avgCustoFree     = custo_brl médio dos cálculos gratuitos este mês
                        (consultas subsidiadas + guest_consultas)
     subsidioColetado = calcs_pagas × taxa_subsidio_brl
                        (quanto os pagantes contribuíram para cobrir os free)
     subsidioRatio    = fração do custo gratuito coberta pelos pagantes (máx 0.95)
     piso_dinâmico    = MAX(0.05, avgCustoFree × 0.5)
     cap_dinâmico     = avgCustoFree × 20

   Comportamento:
     - Sem pagantes (ratio=0):  creditoValor ≈ avgCustoFree       (baixo)
       → mais créditos por cálculo → mais caro para o usuário free
     - Com subsídio pleno (ratio→0.95): creditoValor ≈ 20× avgCustoFree (alto)
       → menos créditos por cálculo → mais barato para todos
     - Visitante com cota 3 créditos:
       · Sem subsídio → ~1 cálculo (3 créditos / 3 por calc)
       · Com subsídio pleno → ~3 cálculos (3 créditos / 1 por calc)
*/
export async function recomputeCreditoValor(): Promise<void> {
  const client = await pool.connect();
  try {
    /* Lê taxa de subsídio atual */
    const cfgRes = await client.query(
      `SELECT valor FROM configuracoes WHERE chave = 'taxa_subsidio_brl' LIMIT 1`
    );
    const taxaSubsidio = parseFloat(cfgRes.rows[0]?.valor ?? "0");

    /* Estatísticas do mês — inclui visitantes via UNION ALL */
    let statsRes: any;
    try {
      statsRes = await client.query(`
        SELECT
          COALESCE(AVG(custo_brl) FILTER (WHERE subsidiado = true),  0) AS avg_custo_free,
          COALESCE(SUM(custo_brl) FILTER (WHERE subsidiado = true),  0) AS custo_free_total,
          COALESCE(COUNT(*)       FILTER (WHERE subsidiado = true),  0) AS calcs_free,
          COALESCE(COUNT(*)       FILTER (WHERE subsidiado = false), 0) AS calcs_pagas
        FROM (
          SELECT custo_brl, subsidiado
          FROM consultas
          WHERE criado_em >= date_trunc('month', now())
          UNION ALL
          SELECT custo_brl, true AS subsidiado
          FROM guest_consultas
          WHERE criado_em >= date_trunc('month', now())
        ) combined
      `);
    } catch {
      statsRes = await client.query(`
        SELECT
          COALESCE(AVG(custo_brl) FILTER (WHERE subsidiado = true),  0) AS avg_custo_free,
          COALESCE(SUM(custo_brl) FILTER (WHERE subsidiado = true),  0) AS custo_free_total,
          COALESCE(COUNT(*)       FILTER (WHERE subsidiado = true),  0) AS calcs_free,
          COALESCE(COUNT(*)       FILTER (WHERE subsidiado = false), 0) AS calcs_pagas
        FROM consultas
        WHERE criado_em >= date_trunc('month', now())
      `);
    }

    const row          = statsRes.rows[0];
    const avgCustoFree   = parseFloat(row?.avg_custo_free   ?? "0");
    const custoFreeTotal = parseFloat(row?.custo_free_total ?? "0");
    const calcsFree      = parseInt(row?.calcs_free         ?? "0", 10);
    const calcsPagas     = parseInt(row?.calcs_pagas        ?? "0", 10);

    if (calcsFree === 0 || avgCustoFree === 0) {
      return; // sem dados — mantém valor atual
    }

    /* Fração do custo gratuito coberta pelos pagantes (cap 0.95 → evita divisão por zero) */
    const subsidioColetado = calcsPagas * taxaSubsidio;
    const subsidioRatio    = Math.min(0.95, subsidioColetado / Math.max(0.001, custoFreeTotal));

    /*
     * creditoValor = avgCustoFree / (1 - subsidioRatio)
     *
     * Sem subsídio (ratio=0):       creditoValor = avgCustoFree       (base)
     * Subsídio pleno (ratio=0.95):  creditoValor = avgCustoFree / 0.05 = 20× base
     *
     * Mais pagantes → creditoValor SOBE → credits_per_calc DIMINUI → mais barato para free/visitantes.
     */
    const raw       = avgCustoFree / Math.max(0.01, 1 - subsidioRatio);
    const piso      = Math.max(0.05, avgCustoFree * 0.5);
    const cap       = avgCustoFree * 20;
    const creditoValor = Math.max(piso, Math.min(cap, raw));

    await client.query(
      `UPDATE configuracoes SET valor = $1, atualizado_em = now() WHERE chave = 'credito_valor_brl'`,
      [creditoValor.toFixed(6)]
    );

    logger.info(
      {
        calcsFree,
        calcsPagas,
        avgCustoFree:     avgCustoFree.toFixed(4),
        subsidioColetado: subsidioColetado.toFixed(4),
        subsidioRatio:    subsidioRatio.toFixed(4),
        creditoValor:     creditoValor.toFixed(6),
      },
      "billing: creditoValor recomputado"
    );
  } catch (err) {
    logger.warn({ err }, "billing: falha ao recomputar creditoValor");
  } finally {
    client.release();
  }
}

/* ── Renovação diária de créditos para usuários free ── */
export async function renovarCreditosDiarios(): Promise<void> {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT c.usuario_id
      FROM carteira c
      JOIN profiles p ON p.id::text = c.usuario_id::text
      WHERE COALESCE(p.plano, 'free') = 'free'
        AND (
          c.ultima_renovacao_diaria IS NULL
          OR c.ultima_renovacao_diaria::date < now()::date
        )
    `);

    if (res.rows.length === 0) return;

    logger.info({ count: res.rows.length }, "billing: renovando créditos diários");

    for (const row of res.rows) {
      const userId = row.usuario_id;
      try {
        await client.query("BEGIN");

        const balRes = await client.query(
          `SELECT saldo_creditos FROM carteira WHERE usuario_id = $1 FOR UPDATE`,
          [userId]
        );
        const saldoAnterior  = balRes.rows[0]?.saldo_creditos ?? 0;
        const saldoPosterior = FREE_DAILY_CREDITS; // reseta para 10 (não acumula)

        await client.query(
          `UPDATE carteira SET
             saldo_creditos = $1,
             ultima_renovacao_diaria = now(),
             atualizado_em = now()
           WHERE usuario_id = $2`,
          [saldoPosterior, userId]
        );

        await client.query(
          `INSERT INTO transacoes (usuario_id, tipo, creditos, saldo_anterior, saldo_posterior, descricao)
           VALUES ($1, 'renovacao_diaria', $2, $3, $4, 'Renovação diária de créditos gratuitos')`,
          [userId, FREE_DAILY_CREDITS, saldoAnterior, saldoPosterior]
        );

        await client.query("COMMIT");
        logger.info({ userId, saldoPosterior }, "billing: créditos diários renovados");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        logger.warn({ err, userId }, "billing: erro ao renovar créditos diários");
      }
    }
  } catch (err) {
    logger.warn({ err }, "billing: renovarCreditosDiarios falhou");
  } finally {
    client.release();
  }
}

/* ── Atualiza câmbio via AwesomeAPI ── */
export async function atualizarCambio(): Promise<void> {
  try {
    const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL");
    if (!res.ok) throw new Error(`AwesomeAPI status ${res.status}`);
    const data = await res.json() as any;
    const taxa = parseFloat(data?.USDBRL?.bid ?? "0");
    if (isNaN(taxa) || taxa <= 0) throw new Error("taxa inválida");

    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE configuracoes SET valor = $1, atualizado_em = now() WHERE chave = 'usd_brl'`,
        [taxa]
      );
      await client.query(
        `INSERT INTO cambio_historico (usd_brl, fonte) VALUES ($1, 'awesomeapi')`,
        [taxa]
      );
      logger.info({ taxa }, "billing: câmbio atualizado");
    } finally {
      client.release();
    }
  } catch (err) {
    logger.warn({ err }, "billing: falha ao atualizar câmbio");
  }
}
