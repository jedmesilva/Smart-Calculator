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
}

// Preços fallback quando o modelo não está na tabela
const FALLBACK_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o":       { input: 2.50, output: 10.00 },
  "gpt-4o-mini":  { input: 0.15, output: 0.60  },
  "gpt-5.1":      { input: 2.00, output: 8.00  },
  "gpt-4.1":      { input: 2.00, output: 8.00  },
  "gpt-4.1-mini": { input: 0.40, output: 1.60  },
};

const FALLBACK_USD_BRL     = 5.80;
const FALLBACK_MARGEM      = 2.0; // margem 100% sobre custo = 2× custo
const FALLBACK_CREDITO_BRL = 0.10;
const WELCOME_CREDITS      = 100; // créditos de boas-vindas para novos usuários
const FREE_DAILY_CREDITS   = 100; // créditos renovados diariamente para plano free

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

/* ── Busca saldo da carteira ── */
export async function getCarteira(userId: string): Promise<CarteiraInfo | null> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT c.saldo_creditos, c.total_consultas, c.total_gasto_brl,
              COALESCE((
                SELECT SUM(-t.creditos) FROM transacoes t
                WHERE t.usuario_id = $1 AND t.tipo = 'debito'
              ), 0) AS total_creditos_consumidos
       FROM carteira c WHERE c.usuario_id = $1`,
      [userId]
    );
    if (res.rows.length === 0) {
      return { saldo: WELCOME_CREDITS, totalConsultas: 0, totalGastoBrl: 0, totalCreditosConsumidos: 0 };
    }
    return {
      saldo: res.rows[0].saldo_creditos,
      totalConsultas: res.rows[0].total_consultas,
      totalGastoBrl: parseFloat(res.rows[0].total_gasto_brl ?? "0"),
      totalCreditosConsumidos: parseInt(res.rows[0].total_creditos_consumidos ?? "0", 10),
    };
  } catch (err) {
    logger.warn({ err, userId }, "billing: getCarteira failed");
    return null;
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

/* ── Registra consulta e debita créditos (atômico via transaction) ── */
export async function registerConsulta(opts: {
  userId: string;
  modelo: string;
  tipo: string;
  sessionId?: string | null;
  tokenUsage: TokenUsage;
}): Promise<BillingResult | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Busca preço do modelo
    const modelRes = await client.query(
      `SELECT preco_input_por_milhao, preco_output_por_milhao
       FROM modelos_llm WHERE modelo = $1 AND ativo = true LIMIT 1`,
      [opts.modelo]
    );

    const fallback = FALLBACK_PRICES[opts.modelo] ?? FALLBACK_PRICES["gpt-4o"];
    const precoInput  = modelRes.rows.length > 0
      ? parseFloat(modelRes.rows[0].preco_input_por_milhao)
      : fallback.input;
    const precoOutput = modelRes.rows.length > 0
      ? parseFloat(modelRes.rows[0].preco_output_por_milhao)
      : fallback.output;

    // 2. Busca configurações (todas as chaves de precificação)
    const cfgRes = await client.query(
      `SELECT chave, valor FROM configuracoes
       WHERE chave IN (
         'usd_brl', 'margem_multiplicador', 'credito_valor_brl',
         'taxa_imposto', 'taxa_processamento', 'taxa_subsidio_brl'
       )`
    );
    const cfg: Record<string, number> = {};
    for (const row of cfgRes.rows) cfg[row.chave] = parseFloat(row.valor);

    const cambio           = cfg["usd_brl"]             ?? FALLBACK_USD_BRL;
    const margemPlataforma = cfg["margem_multiplicador"] ?? FALLBACK_MARGEM;
    const creditoValor     = cfg["credito_valor_brl"]   ?? FALLBACK_CREDITO_BRL;
    const taxaImposto      = cfg["taxa_imposto"]         ?? 1.0;   // 100% sobre custo pós-margem
    const taxaProcessamento= cfg["taxa_processamento"]  ?? 0.03;  // 3% de processamento
    const subsidioFixo     = cfg["taxa_subsidio_brl"]   ?? 0;     // BRL fixo por consulta para subsidiar free

    // 3. Calcula custo com todos os componentes
    const custoUsd        = (opts.tokenUsage.inputTokens  / 1_000_000 * precoInput) +
                            (opts.tokenUsage.outputTokens / 1_000_000 * precoOutput);
    const custoBase       = custoUsd * cambio;
    const comMargem       = custoBase * margemPlataforma;          // +100% margem de plataforma
    const comImposto      = comMargem * (1 + taxaImposto);         // +100% sobre total (imposto)
    const comProcessamento= comImposto * (1 + taxaProcessamento);  // +3% de processamento
    const custoFinal      = comProcessamento + subsidioFixo;       // + subsídio por consulta
    const creditos        = Math.max(1, Math.ceil(custoFinal / creditoValor));

    // custoBrl registrado = custo pós-margem (antes de imposto/processamento/subsídio)
    // para manter compatibilidade histórica da coluna custo_brl
    const custoBrl = comMargem;

    logger.debug(
      { custoUsd, custoBase, comMargem, comImposto, comProcessamento, subsidioFixo, custoFinal, creditos },
      "billing: breakdown de custo"
    );

    // 4. Garante carteira existe e faz lock
    const saldoAnterior = await ensureCarteira(client, opts.userId);

    if (saldoAnterior < creditos) {
      await client.query("ROLLBACK");
      logger.warn({ userId: opts.userId, saldo: saldoAnterior, creditos }, "billing: saldo insuficiente");
      return null;
    }

    const saldoPosterior = saldoAnterior - creditos;

    // 5. Insere consulta
    const consultaRes = await client.query(
      `INSERT INTO consultas
         (usuario_id, session_id, tipo, modelo, input_tokens, output_tokens,
          custo_usd, cambio_usado, margem_usada, custo_brl, creditos_debitados)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        margem,
        custoBrl,
        creditos,
      ]
    );
    const consultaId = consultaRes.rows[0].id;

    // 6. Atualiza carteira
    await client.query(
      `UPDATE carteira SET
         saldo_creditos  = $1,
         total_gasto_brl = total_gasto_brl + $2,
         total_consultas = total_consultas + 1,
         atualizado_em   = now()
       WHERE usuario_id = $3`,
      [saldoPosterior, custoBrl, opts.userId]
    );

    // 7. Registra transação
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
      { userId: opts.userId, creditos, saldoPosterior, custoUsd, custoBrl },
      "billing: consulta registrada"
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

/* ── Recomputa subsídio do plano gratuito ── */
export async function recomputeSubsidio(): Promise<void> {
  const client = await pool.connect();
  try {
    // Busca janela configurada (padrão 30 dias)
    const cfgRes = await client.query(
      `SELECT valor FROM configuracoes WHERE chave = 'subsidio_janela_dias'`
    );
    const janela = parseInt(cfgRes.rows[0]?.valor ?? "30", 10);

    // Calcula consultas free vs pagas na janela, e custo médio real por consulta
    const statsRes = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(p.plano, 'free') = 'free')  AS free_calcs,
        COUNT(*) FILTER (WHERE COALESCE(p.plano, 'free') != 'free') AS paid_calcs,
        AVG(c.custo_brl) FILTER (WHERE c.custo_usd > 0)             AS avg_custo_brl
      FROM consultas c
      LEFT JOIN profiles p ON p.id::text = c.usuario_id
      WHERE c.criado_em >= now() - ($1 || ' days')::interval
    `, [janela]);

    const row = statsRes.rows[0];
    const freeCalcs  = parseInt(row?.free_calcs  ?? "0", 10);
    const paidCalcs  = parseInt(row?.paid_calcs  ?? "0", 10);
    const avgCustoBrl= parseFloat(row?.avg_custo_brl ?? "0");

    // subsidio_brl = (consultas_free × custo_médio) / consultas_pagas
    // Só existe subsídio se houver consultas pagas — caso contrário é 0.
    // Limitado a 5× o custo médio para evitar distorções extremas.
    let subsidio = 0;
    if (freeCalcs > 0 && paidCalcs > 0 && avgCustoBrl > 0) {
      const raw = (freeCalcs * avgCustoBrl) / paidCalcs;
      subsidio = Math.min(raw, avgCustoBrl * 5);
    }

    await client.query(
      `UPDATE configuracoes SET valor = $1, atualizado_em = now() WHERE chave = 'taxa_subsidio_brl'`,
      [subsidio.toFixed(6)]
    );

    logger.info(
      { freeCalcs, paidCalcs, avgCustoBrl: avgCustoBrl.toFixed(4), subsidio: subsidio.toFixed(6), janela },
      "billing: subsídio recomputado"
    );
  } catch (err) {
    logger.warn({ err }, "billing: falha ao recomputar subsídio");
  } finally {
    client.release();
  }
}

/* ── Renovação diária de créditos para usuários free ── */
export async function renovarCreditosDiarios(): Promise<void> {
  const client = await pool.connect();
  try {
    // Busca usuários free que ainda não renovaram hoje
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
        const saldoAnterior = balRes.rows[0]?.saldo_creditos ?? 0;
        const saldoPosterior = FREE_DAILY_CREDITS; // reseta para 100 (não acumula)

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
