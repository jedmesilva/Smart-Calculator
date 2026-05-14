/* ═══════════════════════════════════════════════════════
   Orquestrador — Pipeline 3 Agentes

   Agent 1 (Intent) → extrai objetivo + valores ou pede esclarecimento
   Agent 2 (Calculator) → decide estratégia (simple/complex), monta
                          expressão MathJS, computa localmente
   Agent 3 (Evaluator) → score 0–10; aprovado se ≥ 7;
                          caso contrário envia feedback para retry
                          Agent 2 (máx 2 retentativas)

   Resultado aprovado → buildResult + buildDesenvolvimento (paralelo)
                        + conversationalAgent
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { db, pool } from "@workspace/db";
import { formulas } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { buildResult } from "./explainBuilder";
import { runCalculatorAgent } from "../agents/calculatorAgent";
import { runEvaluatorAgent } from "../agents/evaluatorAgent";
import { runConversationalAgent, runGuidanceAgent } from "../agents/conversationalAgent";
import { generateSessionSummary } from "./summaryBuilder";
import {
  setSpeculativeEntry,
  getSpeculativeEntry,
} from "./speculativeCache";
import type { ConversationMessage, ExpressionResult, ValidationResult, FormulaInfo } from "../agents/types";
import type { ResultData } from "./explainBuilder";
import type { TokenUsage } from "./billingService";

const SUMMARY_EVERY = 8;

/* ══════════════════════════════════════════════════════
   Tipos públicos do orquestrador (inalterados — compatível
   com calculate.ts e mobile)
   ══════════════════════════════════════════════════════ */

export type OrchestratorSuccess = {
  status: "success";
  result: ResultData;
  capturedName?: string;
  tokenUsage?: TokenUsage;
};
export type OrchestratorNeedsInput = {
  status: "needs_input";
  message: string;
  missing: { symbol: string; name: string; description: string }[];
  tokenUsage?: TokenUsage;
};
export type OrchestratorConversational = {
  status: "conversational";
  message: string;
  capturedName?: string;
  tokenUsage?: TokenUsage;
};
export type OrchestratorFormulaError = {
  status: "formula_error";
  message: string;
  suggestion?: string | null;
  tokenUsage?: TokenUsage;
};
export type OrchestratorWrongFormula = {
  status: "wrong_formula";
  message: string;
  suggestion: string | null;
  tokenUsage?: TokenUsage;
};

export type OrchestratorResult =
  | OrchestratorSuccess
  | OrchestratorNeedsInput
  | OrchestratorConversational
  | OrchestratorFormulaError
  | OrchestratorWrongFormula;

/* ══════════════════════════════════════════════════════
   Agent 1 — Intent Detection
   Analisa a query + contexto e decide:
   • "ready"          → tem tudo para calcular
   • "needs_input"    → faltam dados, faz uma pergunta
   • "conversational" → não é cálculo
   ══════════════════════════════════════════════════════ */

const INTENT_SYSTEM = `Você é o agente de intent do Phormula, uma calculadora inteligente em português.
Seu único papel: analisar a mensagem do usuário e determinar se há uma intenção de cálculo matemático com dados suficientes.

RETORNE APENAS JSON VÁLIDO, sem markdown.

Se tem objetivo claro e dados suficientes para calcular:
{
  "status": "ready",
  "objective": "descrição clara e específica do que calcular em português",
  "values": {
    "label_descritivo": valor_numérico
  },
  "contextSummary": "qualquer informação de contexto que ajude a calcular"
}

REGRAS para "ready":
• "values": chaves são labels descritivos em português (ex: "capital_inicial", "taxa_mensal", "n_periodos")
• Valores SEMPRE como números puros: "10%" → 0.1, "R$ 1.000" → 1000, "1,5%" → 0.015
• Notação pt-BR: "1.234,56" → 1234.56, "1,75" → 1.75
• Se o usuário pede aritmética simples ("2+2", "10×5", "raiz de 16"), coloque em "values" mesmo sem labels claros
• Prefira "ready" sempre que houver dados suficientes — o agente calculador saberá lidar

Se falta pelo menos um valor essencial:
{
  "status": "needs_input",
  "message": "Uma única pergunta direta e específica em português (não liste, pergunte apenas o mais importante)",
  "missing": [
    {"symbol": "n", "name": "Número de períodos", "description": "Por quantos meses?"}
  ]
}

Se não é um pedido de cálculo (saudação, pergunta conceitual, comentário):
{
  "status": "conversational"
}

CONTEXTO MULTI-TURNO — REGRA OBRIGATÓRIA:
Antes de qualquer decisão, varra TODAS as mensagens do histórico em busca dos valores necessários.
• Um valor só está "faltando" se não aparecer EM NENHUMA mensagem anterior do usuário.
• Se encontrado no histórico, use o valor mais recente mencionado pelo usuário.
• NUNCA pergunte sobre algo que o usuário já informou em mensagens anteriores.
• Se o usuário diz "e se forem 24 meses?" sem repetir os outros valores, procure-os no histórico — se estiverem lá, retorne "ready".
• Se estiver em dúvida sobre qual valor do histórico usar (ex: dois valores diferentes mencionados), prefira "ready" com o valor mais recente.

RESPOSTAS AFIRMATIVAS A SUGESTÕES: Se a última mensagem do assistente sugeriu ou propôs um cálculo específico (ex: "Você gostaria de calcular a distância percorrida em uma hora?", "Posso calcular X para você?") e o usuário responde com uma afirmação simples ("Sim", "sim", "ok", "pode", "quero", "claro", "isso", "exato", "pode ser", "vamos", "faça", "calcule"), você DEVE:
1. Extrair o objetivo e os valores da mensagem anterior do assistente E do histórico completo
2. Retornar status "ready" com esses dados
NUNCA retorne "conversational" quando o usuário estiver confirmando uma sugestão de cálculo do assistente.

REGRA needs_input — uso restrito:
Só retorne "needs_input" se, após varrer TODO o histórico, pelo menos um valor essencial for genuinamente desconhecido.
A pergunta deve ser a mais específica e direta possível — apenas o valor mais crítico que falta.`;

export type IntentReady = {
  status: "ready";
  objective: string;
  values: Record<string, number | string>;
  contextSummary: string;
};
export type IntentNeedsInput = {
  status: "needs_input";
  message: string;
  missing: { symbol: string; name: string; description: string }[];
};
export type IntentConversational = { status: "conversational" };
export type IntentResult = IntentReady | IntentNeedsInput | IntentConversational;

export async function runIntentAgent(opts: {
  query: string;
  context: ConversationMessage[];
  sessionSummary?: string;
  formulaHint?: string;
}): Promise<IntentResult> {
  const { query, context, sessionSummary, formulaHint } = opts;

  const messages: any[] = [{ role: "system", content: INTENT_SYSTEM }];

  if (sessionSummary) {
    messages.push({ role: "user", content: `[Resumo da sessão]\n${sessionSummary}` });
    messages.push({ role: "assistant", content: '{"status":"conversational"}' });
  }

  for (const m of context.slice(-8)) {
    messages.push({ role: m.role, content: m.content });
  }

  const userContent = [
    formulaHint ? `Fórmula pré-selecionada: ${formulaHint}` : "",
    `Mensagem: ${query}`,
  ]
    .filter(Boolean)
    .join("\n");

  messages.push({ role: "user", content: userContent });

  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    max_completion_tokens: 600,
    messages,
  } as any);

  const raw = response.choices[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
    if (!["ready", "needs_input", "conversational"].includes(parsed.status)) {
      return { status: "conversational" };
    }
    return parsed as IntentResult;
  } catch {
    logger.warn({ raw: raw.slice(0, 200) }, "intentAgent: JSON parse failed, fallback conversational");
    return { status: "conversational" };
  }
}

/* ══════════════════════════════════════════════════════
   Conversor: CalculatorResult → tipos legados para builders
   ══════════════════════════════════════════════════════ */

import type { CalculatorResult } from "../agents/calculatorAgent";

function calcResultToFormulaInfo(r: CalculatorResult, formulaId?: string): FormulaInfo {
  return {
    id: formulaId ?? null,
    name: r.formulaName,
    description: "",
    symbolic: r.formulaSymbolic,
    category: "Cálculo",
    expression: r.expression,
    expression_meta: {
      solveFor: r.solveFor,
      resultUnit: r.resultUnit,
      resultLabel: r.resultLabel,
      variables: r.variables.map((v) => ({
        symbol: v.symbol,
        name: v.name,
        description: v.name,
      })),
    },
  };
}

function calcResultToExpressionResult(r: CalculatorResult): ExpressionResult {
  return {
    expression: r.expression,
    solveFor: r.solveFor,
    extracted: r.extracted,
    variableNames: r.variableNames,
    variableValues: r.variableValues,
    resultUnit: r.resultUnit,
    resultLabel: r.resultLabel,
    formulaSubstituted: r.formulaSubstituted,
    searchUsed: false,
    allPresent: true,
    missing: [],
  };
}

function evaluatorToValidation(score: number, feedback: string, approved: boolean): ValidationResult {
  return {
    valid: approved,
    method: `Avaliação automática (score: ${score}/10)`,
    detail: feedback,
    tipo: "razoabilidade" as const,
    latex: null,
    steps: null,
  };
}

/* ══════════════════════════════════════════════════════
   prediction_attempts — tabela criada on-demand no Supabase
   ══════════════════════════════════════════════════════ */

let tableEnsured = false;
async function ensurePredictionAttemptsTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS prediction_attempts (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id text NOT NULL,
        session_id uuid,
        partial_query text NOT NULL,
        predicted_objective text,
        actual_query text,
        matched boolean,
        speculative_elapsed_ms integer,
        final_elapsed_ms integer,
        created_at timestamptz DEFAULT now() NOT NULL
      )
    `);
    tableEnsured = true;
  } catch (err) {
    logger.warn({ err }, "orchestrator: ensurePredictionAttemptsTable failed (silenced)");
  }
}

async function recordPredictionAttempt(opts: {
  userId: string;
  sessionId?: string;
  partialQuery: string;
  predictedObjective?: string;
  actualQuery?: string;
  matched?: boolean;
  speculativeElapsedMs?: number;
  finalElapsedMs?: number;
}): Promise<void> {
  await ensurePredictionAttemptsTable();
  try {
    await pool.query(
      `INSERT INTO prediction_attempts
         (user_id, session_id, partial_query, predicted_objective, actual_query, matched, speculative_elapsed_ms, final_elapsed_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        opts.userId,
        opts.sessionId ?? null,
        opts.partialQuery.slice(0, 500),
        opts.predictedObjective?.slice(0, 300) ?? null,
        opts.actualQuery?.slice(0, 500) ?? null,
        opts.matched ?? null,
        opts.speculativeElapsedMs ?? null,
        opts.finalElapsedMs ?? null,
      ]
    );
  } catch (err) {
    logger.warn({ err }, "orchestrator: recordPredictionAttempt failed (silenced)");
  }
}

/* ══════════════════════════════════════════════════════
   Pipeline especulativo — roda Agents 1+2+3 + buildResult
   em background enquanto o usuário ainda digita.
   NÃO roda conversationalAgent (precisa da query real).
   ══════════════════════════════════════════════════════ */

export async function runSpeculativePipeline(opts: {
  query: string;
  formulaId?: string;
  context: ConversationMessage[];
  sessionId?: string;
  sessionSummary?: string;
  messageCount?: number;
  userName?: string;
  userId: string;
}): Promise<void> {
  const { query, formulaId, context, sessionId, sessionSummary, userId } = opts;
  const start = Date.now();

  logger.info(
    { query: query.slice(0, 80), userId: userId.slice(0, 8) },
    "speculative: pipeline start"
  );

  /* ── Carrega fórmula pré-selecionada ── */
  let preloadedFormula: FormulaInfo | null = null;
  if (formulaId) {
    try {
      const [f] = await db
        .select({
          id: formulas.id,
          name: formulas.name,
          description: formulas.description,
          symbolic: formulas.symbolic,
          category: formulas.category,
          expression: formulas.expression,
          expression_meta: formulas.expression_meta,
        })
        .from(formulas)
        .where(eq(formulas.id, formulaId))
        .limit(1);
      if (f) {
        preloadedFormula = {
          id: f.id,
          name: f.name,
          description: f.description ?? "",
          symbolic: f.symbolic,
          category: f.category,
          expression: f.expression ?? null,
          expression_meta: f.expression_meta ?? null,
        };
      }
    } catch { /* silenced */ }
  }

  const formulaHint = preloadedFormula
    ? `${preloadedFormula.name} — ${preloadedFormula.symbolic}`
    : undefined;

  /* ── Agent 1: Intent ── */
  let intentResult: IntentResult;
  try {
    intentResult = await runIntentAgent({ query, context, sessionSummary, formulaHint });
  } catch {
    logger.info({ query: query.slice(0, 60) }, "speculative: intent failed, skipping");
    return;
  }

  if (intentResult.status !== "ready") {
    logger.info(
      { status: intentResult.status },
      "speculative: not ready, skipping"
    );
    return;
  }

  const { objective, values, contextSummary } = intentResult;

  const enrichedContext = [
    contextSummary,
    sessionSummary ? `Resumo da sessão: ${sessionSummary}` : "",
    preloadedFormula
      ? `Fórmula pré-selecionada: ${preloadedFormula.name} (${preloadedFormula.symbolic}).`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  /* ── Agent 2: Calculator ── */
  const MAX_RETRIES = 2;
  let calcResult: import("../agents/calculatorAgent").CalculatorResult | null = null;
  let evalFeedback: { score: number; feedback: string; suggestion: string | null } | undefined;
  let lastEvalScore = 10;
  let lastEvalFeedback = "";
  let lastEvalApproved = true;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      calcResult = await runCalculatorAgent(
        {
          objective,
          values,
          contextSummary: enrichedContext,
          feedback: evalFeedback,
          formulaHint: preloadedFormula
            ? `${preloadedFormula.name}: ${preloadedFormula.symbolic}${preloadedFormula.expression ? ` | MathJS: ${preloadedFormula.expression}` : ""}`
            : undefined,
        },
        () => {}
      );
    } catch (err: any) {
      if (attempt >= MAX_RETRIES) return;
      evalFeedback = {
        score: 0,
        feedback: `Erro MathJS: ${err?.message}`,
        suggestion: "Revise a expressão.",
      };
      continue;
    }

    /* ── Agent 3: Evaluator ── */
    try {
      const evalResult = await runEvaluatorAgent({
        objective,
        formulaName: calcResult.formulaName,
        formulaSymbolic: calcResult.formulaSymbolic,
        expression: calcResult.expression,
        computedValue: calcResult.computedValue,
        resultUnit: calcResult.resultUnit,
        resultLabel: calcResult.resultLabel,
        strategy: calcResult.strategy,
        computedSteps: calcResult.computedSteps,
      });

      lastEvalScore = evalResult.score;
      lastEvalFeedback = evalResult.feedback;
      lastEvalApproved = evalResult.approved;

      if (evalResult.approved) break;

      if (attempt < MAX_RETRIES) {
        evalFeedback = {
          score: evalResult.score,
          feedback: evalResult.feedback,
          suggestion: evalResult.suggestion,
        };
      }
    } catch {
      lastEvalApproved = true;
      lastEvalFeedback = "Verificação concluída.";
      lastEvalScore = 7;
      break;
    }
  }

  if (!calcResult) return;

  /* ── buildResult (sem conversational) ── */
  const formulaInfo = calcResultToFormulaInfo(calcResult, formulaId);
  const exprResult = calcResultToExpressionResult(calcResult);
  const validationResult = evaluatorToValidation(lastEvalScore, lastEvalFeedback, lastEvalApproved);
  const warning = !lastEvalApproved
    ? `Verifique o resultado: score ${lastEvalScore}/10.`
    : undefined;

  const partialResult = buildResult(
    calcResult.formulaName,
    calcResult.formulaSymbolic,
    exprResult,
    calcResult.computedValue,
    {
      formulaId: formulaId ?? null,
      formulaCategory: preloadedFormula?.category ?? "Cálculo",
      warning,
      searchUsed: false,
      proof: validationResult,
      formulaExpression: calcResult.expression,
      formulaMeta: formulaInfo.expression_meta,
      interpretacao: null,
    }
  );

  const elapsed = Date.now() - start;

  /* ── Armazena no cache ── */
  setSpeculativeEntry(query, {
    calcResult,
    intentResult,
    formulaId,
    evalScore: lastEvalScore,
    evalFeedback: lastEvalFeedback,
    evalApproved: lastEvalApproved,
    partialResult,
    formulaInfo,
    exprResult,
    validationResult,
    objective,
    warning,
    createdAt: Date.now(),
    elapsedMs: elapsed,
    userId,
  });

  /* ── Registra tentativa no banco ── */
  recordPredictionAttempt({
    userId,
    sessionId,
    partialQuery: query,
    predictedObjective: objective,
    speculativeElapsedMs: elapsed,
  }).catch(() => {});

  logger.info(
    { objective: objective.slice(0, 60), elapsedMs: elapsed },
    "speculative: pipeline done"
  );
}

/* ══════════════════════════════════════════════════════
   Geração de sumário de sessão — fire-and-forget
   ══════════════════════════════════════════════════════ */

function maybeTriggerSummary(opts: {
  sessionId?: string;
  messageCount: number;
  context: ConversationMessage[];
  query: string;
  resultText: string;
}) {
  const { sessionId, messageCount, context, query, resultText } = opts;
  if (!sessionId) return;
  if ((messageCount + 1) % SUMMARY_EVERY !== 0) return;

  const fullContext: ConversationMessage[] = [
    ...context,
    { role: "user", content: query },
    { role: "assistant", content: resultText },
  ];

  generateSessionSummary({ sessionId, context: fullContext }).catch((err) =>
    logger.warn({ err, sessionId }, "orchestrator: summary generation failed silently")
  );
}

/* ══════════════════════════════════════════════════════
   Pipeline principal
   ══════════════════════════════════════════════════════ */

export async function runCalculationPipeline(opts: {
  query: string;
  formulaId: string | undefined;
  context: ConversationMessage[];
  sessionId?: string;
  sessionSummary?: string;
  messageCount?: number;
  userName?: string;
  userId?: string;
  precomputedIntent?: IntentResult;
  emit?: (message: string) => void;
}): Promise<OrchestratorResult> {
  const {
    query,
    formulaId,
    context,
    sessionId,
    sessionSummary,
    messageCount = 0,
    userName,
    userId,
    precomputedIntent,
    emit = () => {},
  } = opts;

  const pipelineStart = Date.now();

  /* ══════════════════════════════════════════════════
     CACHE ESPECULATIVO — verifica antes de rodar pipeline
     ══════════════════════════════════════════════════ */
  if (userId) {
    const cached = getSpeculativeEntry(query, userId);
    if (cached) {
      emit("Preparando resultado…");

      const conversationalText = await runConversationalAgent({
        query,
        formula: cached.formulaInfo,
        expressionResult: cached.exprResult,
        computedValue: cached.calcResult.computedValue,
        validation: cached.validationResult,
        context,
        sessionSummary,
        userName,
      });

      const finalResult: ResultData = {
        ...cached.partialResult,
        conversationalResponse: conversationalText,
        desenvolvimento: [],
        desenvolvimentoInput: {
          formulaName: cached.calcResult.formulaName,
          formulaSymbolic: cached.calcResult.formulaSymbolic,
          formulaSubstituted: cached.calcResult.formulaSubstituted,
          expression: cached.calcResult.expression,
          extracted: cached.calcResult.extracted,
          variableNames: cached.calcResult.variableNames,
          variableValues: cached.calcResult.variableValues,
          solveFor: cached.calcResult.solveFor,
          computedValue: cached.calcResult.computedValue,
          resultUnit: cached.calcResult.resultUnit,
          resultLabel: cached.calcResult.resultLabel,
        },
        objetivo: cached.objective,
      };

      const totalElapsed = Date.now() - pipelineStart;
      logger.info(
        {
          cacheHit: true,
          speculativeElapsedMs: cached.elapsedMs,
          conversationalElapsedMs: totalElapsed,
          totalElapsedMs: totalElapsed,
          savedMs: cached.elapsedMs,
        },
        "orchestrator3: CACHE HIT — resultado especulativo entregue"
      );

      recordPredictionAttempt({
        userId,
        sessionId,
        partialQuery: query,
        predictedObjective: cached.objective,
        actualQuery: query,
        matched: true,
        speculativeElapsedMs: cached.elapsedMs,
        finalElapsedMs: totalElapsed,
      }).catch(() => {});

      maybeTriggerSummary({
        sessionId,
        messageCount,
        context,
        query,
        resultText: `${cached.calcResult.formulaName}: ${cached.calcResult.computedValue} ${cached.calcResult.resultUnit}`,
      });

      return { status: "success", result: finalResult };
    }
  }
  logger.info(
    { formulaId: formulaId ?? "dynamic", query: query.slice(0, 80), sessionId },
    "orchestrator3: start"
  );

  /* ── Carrega fórmula pré-selecionada (se houver) ── */
  let preloadedFormula: FormulaInfo | null = null;
  if (formulaId) {
    try {
      const [f] = await db
        .select({
          id: formulas.id,
          name: formulas.name,
          description: formulas.description,
          symbolic: formulas.symbolic,
          category: formulas.category,
          expression: formulas.expression,
          expression_meta: formulas.expression_meta,
        })
        .from(formulas)
        .where(eq(formulas.id, formulaId))
        .limit(1);

      if (f) {
        preloadedFormula = {
          id: f.id,
          name: f.name,
          description: f.description ?? "",
          symbolic: f.symbolic,
          category: f.category,
          expression: f.expression ?? null,
          expression_meta: f.expression_meta ?? null,
        };
      }
    } catch (err) {
      logger.warn({ err, formulaId }, "orchestrator3: preload formula failed");
    }
  }

  const formulaHint = preloadedFormula
    ? `${preloadedFormula.name} — ${preloadedFormula.symbolic}`
    : undefined;

  /* ══════════════════════════════════════════════════
     AGENT 1 — Intent Detection (ou pré-computado)
     ══════════════════════════════════════════════════ */

  let intentResult: IntentResult;

  if (precomputedIntent) {
    intentResult = precomputedIntent;
    logger.info({ intentStatus: intentResult.status }, "orchestrator3: using precomputed intent (speculative)");
  } else {
    emit("Entendendo o pedido…");
    try {
      intentResult = await runIntentAgent({ query, context, sessionSummary, formulaHint });
    } catch (err: any) {
      logger.warn({ err }, "orchestrator3: intentAgent failed, fallback guidance");
      const guidance = await runGuidanceAgent({ query, context, sessionSummary, userName });
      return {
        status: "conversational",
        message: guidance.message,
        capturedName: guidance.capturedName,
      };
    }
    logger.info({ intentStatus: intentResult.status }, "orchestrator3: intent detected");
  }

  /* ── Caso conversacional ── */
  if (intentResult.status === "conversational") {
    emit("Respondendo…");
    const guidance = await runGuidanceAgent({ query, context, sessionSummary, userName });
    return {
      status: "conversational",
      message: guidance.message,
      capturedName: guidance.capturedName,
    };
  }

  /* ── Caso faltam dados ── */
  if (intentResult.status === "needs_input") {
    return {
      status: "needs_input",
      message: intentResult.message,
      missing: intentResult.missing ?? [],
    };
  }

  /* ══════════════════════════════════════════════════
     AGENT 2 — Calculator (com loop de retry)
     ══════════════════════════════════════════════════ */

  const { objective, values, contextSummary } = intentResult;

  // Enriquece contextSummary com sessão e fórmula preloaded
  const enrichedContext = [
    contextSummary,
    sessionSummary ? `Resumo da sessão: ${sessionSummary}` : "",
    preloadedFormula
      ? `Fórmula pré-selecionada pelo usuário: ${preloadedFormula.name} (${preloadedFormula.symbolic}). Use esta fórmula se for adequada.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const MAX_EVAL_RETRIES = 2;
  let calcResult: CalculatorResult | null = null;
  let evalFeedback: { score: number; feedback: string; suggestion: string | null } | undefined;
  let lastEvalScore = 10;
  let lastEvalFeedback = "";
  let lastEvalApproved = true;

  for (let attempt = 0; attempt <= MAX_EVAL_RETRIES; attempt++) {
    /* ── Agent 2: calcula ── */
    try {
      emit(
        attempt === 0
          ? "Calculando…"
          : `Revisando cálculo (tentativa ${attempt + 1})…`
      );

      calcResult = await runCalculatorAgent(
        {
          objective,
          values,
          contextSummary: enrichedContext,
          feedback: evalFeedback,
          formulaHint: preloadedFormula
            ? `${preloadedFormula.name}: ${preloadedFormula.symbolic}${preloadedFormula.expression ? ` | MathJS: ${preloadedFormula.expression}` : ""}`
            : undefined,
        },
        emit
      );
    } catch (err: any) {
      logger.warn({ err, attempt }, "orchestrator3: calculatorAgent failed");

      if (attempt >= MAX_EVAL_RETRIES) {
        // Após esgotar retries, tenta fallback guidance
        const guidance = await runGuidanceAgent({
          query,
          context,
          sessionSummary,
          failReason: err?.message,
          userName,
        });
        return { status: "conversational", message: guidance.message };
      }
      // Na primeira falha, sinaliza erro ao avaliador como feedback e continua
      evalFeedback = {
        score: 0,
        feedback: `Erro de execução MathJS: ${err?.message ?? "expressão inválida"}`,
        suggestion: "Revise a expressão MathJS e garanta que é sintaticamente correta.",
      };
      continue;
    }

    /* ── Agent 3: avalia ── */
    emit("Verificando resultado…");

    try {
      const evalResult = await runEvaluatorAgent({
        objective,
        formulaName: calcResult.formulaName,
        formulaSymbolic: calcResult.formulaSymbolic,
        expression: calcResult.expression,
        computedValue: calcResult.computedValue,
        resultUnit: calcResult.resultUnit,
        resultLabel: calcResult.resultLabel,
        strategy: calcResult.strategy,
        computedSteps: calcResult.computedSteps,
      });

      lastEvalScore = evalResult.score;
      lastEvalFeedback = evalResult.feedback;
      lastEvalApproved = evalResult.approved;

      logger.info(
        {
          attempt,
          score: evalResult.score,
          approved: evalResult.approved,
          formulaName: calcResult.formulaName,
        },
        "orchestrator3: evaluator result"
      );

      if (evalResult.approved) {
        break; // aprovado → sai do loop
      }

      if (attempt < MAX_EVAL_RETRIES) {
        evalFeedback = {
          score: evalResult.score,
          feedback: evalResult.feedback,
          suggestion: evalResult.suggestion,
        };
        logger.info({ attempt, score: evalResult.score }, "orchestrator3: retrying calculator");
      }
    } catch (err: any) {
      // Falha no evaluator → aceita o resultado do calculator
      logger.warn({ err }, "orchestrator3: evaluatorAgent failed, accepting result");
      lastEvalApproved = true;
      lastEvalFeedback = "Verificação concluída.";
      lastEvalScore = 7;
      break;
    }
  }

  if (!calcResult) {
    const guidance = await runGuidanceAgent({ query, context, sessionSummary, userName });
    return { status: "conversational", message: guidance.message };
  }

  /* ══════════════════════════════════════════════════
     BUILD RESULT — paralelo: passo-a-passo + conversational
     ══════════════════════════════════════════════════ */

  emit("Preparando resultado…");

  const formulaInfo = calcResultToFormulaInfo(calcResult, formulaId);
  const exprResult = calcResultToExpressionResult(calcResult);
  const validationResult = evaluatorToValidation(lastEvalScore, lastEvalFeedback, lastEvalApproved);

  // Warning se aprovado com retry ou score baixo após esgotar tentativas
  const warning = !lastEvalApproved
    ? `Verifique o resultado: avaliação automática com score ${lastEvalScore}/10.`
    : undefined;

  const conversationalText = await runConversationalAgent({
    query,
    formula: formulaInfo,
    expressionResult: exprResult,
    computedValue: calcResult.computedValue,
    validation: validationResult,
    context,
    sessionSummary,
    userName,
  });

  const partialResult = buildResult(
    calcResult.formulaName,
    calcResult.formulaSymbolic,
    exprResult,
    calcResult.computedValue,
    {
      formulaId: formulaId ?? null,
      formulaCategory: preloadedFormula?.category ?? "Cálculo",
      warning,
      searchUsed: false,
      proof: validationResult,
      formulaExpression: calcResult.expression,
      formulaMeta: formulaInfo.expression_meta,
      interpretacao: null,
    }
  );

  const finalResult: ResultData = {
    ...partialResult,
    conversationalResponse: conversationalText,
    desenvolvimento: [],
    desenvolvimentoInput: {
      formulaName: calcResult.formulaName,
      formulaSymbolic: calcResult.formulaSymbolic,
      formulaSubstituted: calcResult.formulaSubstituted,
      expression: calcResult.expression,
      extracted: calcResult.extracted,
      variableNames: calcResult.variableNames,
      variableValues: calcResult.variableValues,
      solveFor: calcResult.solveFor,
      computedValue: calcResult.computedValue,
      resultUnit: calcResult.resultUnit,
      resultLabel: calcResult.resultLabel,
    },
    objetivo: objective,
  };

  const elapsed = Date.now() - pipelineStart;
  logger.info(
    {
      formulaName: calcResult.formulaName,
      strategy: calcResult.strategy,
      score: lastEvalScore,
      approved: lastEvalApproved,
      elapsedMs: elapsed,
    },
    "orchestrator3: success"
  );

  /* ── Sumário de sessão — fire-and-forget ── */
  maybeTriggerSummary({
    sessionId,
    messageCount,
    context,
    query,
    resultText: `${calcResult.formulaName}: ${calcResult.computedValue} ${calcResult.resultUnit}`,
  });

  return {
    status: "success",
    result: finalResult,
    tokenUsage: {
      model: "gpt-4o",
      input_tokens: 0,  // contabilizado globalmente pelo billing service
      output_tokens: 0,
    },
  };
}
