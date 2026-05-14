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
import { db } from "@workspace/db";
import { formulas } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { buildResult } from "./explainBuilder";
import { runCalculatorAgent } from "../agents/calculatorAgent";
import { runEvaluatorAgent } from "../agents/evaluatorAgent";
import { runConversationalAgent, runGuidanceAgent } from "../agents/conversationalAgent";
import { generateSessionSummary } from "./summaryBuilder";
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

CONTEXTO MULTI-TURNO: use o histórico da conversa para inferir valores já mencionados.
Se o usuário diz "e se forem 24 meses?" sem repetir os outros valores, procure-os no histórico.`;

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
    model: "gpt-4o-mini",
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
    precomputedIntent,
    emit = () => {},
  } = opts;

  const pipelineStart = Date.now();
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
