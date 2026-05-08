/* ═══════════════════════════════════════════════════════
   Orquestrador Central — coordena todas as 5 fases do pipeline
   Fase 1: formulaAgent + contextAgent (paralelo)
   Fase 2: expressionAgent (com loop de retry interno)
   Fase 3: computeFormula via mathjs
   Fase 4: validationAgent (prova reversa)
   Fase 5: buildResult + conversationalAgent (paralelo)

   Contexto inteligente:
   - Recebe sessionSummary (resumo LLM da sessão) + últimas N msgs
   - Se contextAgent retorna needsHistory: true, busca histórico completo
   - Após sucesso, dispara geração de novo resumo quando necessário
   ═══════════════════════════════════════════════════════ */

import { logger } from "./logger";
import { computeFormula } from "./formulaCompute";
import { buildResult, buildDesenvolvimento } from "./explainBuilder";
import { runFormulaAgent } from "../agents/formulaAgent";
import { runContextAgent } from "../agents/contextAgent";
import { runExpressionAgent } from "../agents/expressionAgent";
import { runValidationAgent } from "../agents/validationAgent";
import { runConversationalAgent, runGuidanceAgent } from "../agents/conversationalAgent";
import { classifyIntent } from "../agents/intentAgent";
import { fetchSessionMessages } from "./supabase";
import { generateSessionSummary } from "./summaryBuilder";
import type { ConversationMessage } from "../agents/types";
import type { ResultData } from "./explainBuilder";

/* ── Limiar: gerar resumo a cada 8 mensagens salvas ── */
const SUMMARY_EVERY = 8;

/* ── Tipos do orquestrador ── */
export type OrchestratorSuccess = {
  status: "success";
  result: ResultData;
  capturedName?: string;
};

export type OrchestratorNeedsInput = {
  status: "needs_input";
  message: string;
  missing: { symbol: string; name: string; description: string }[];
};

export type OrchestratorConversational = {
  status: "conversational";
  message: string;
  capturedName?: string;
};

export type OrchestratorFormulaError = {
  status: "formula_error";
  message: string;
  suggestion?: string | null;
};

export type OrchestratorWrongFormula = {
  status: "wrong_formula";
  message: string;
  suggestion: string | null;
};

export type OrchestratorResult =
  | OrchestratorSuccess
  | OrchestratorNeedsInput
  | OrchestratorConversational
  | OrchestratorFormulaError
  | OrchestratorWrongFormula;

/* ── Converte mensagens do DB em ConversationMessage[] ──
   Suporta schema antigo (flat) e novo (universal) de forma transparente. ── */
function dbMessagesToContext(
  rows: Array<{ kind: string; text: string | null; result_data: any | null }>
): ConversationMessage[] {
  const out: ConversationMessage[] = [];
  for (const row of rows) {
    if (row.kind === "user" && row.text) {
      out.push({ role: "user", content: row.text });
    } else if (row.kind === "result" && row.result_data) {
      const r = row.result_data as any;

      // ── Suporte dual: novo schema (r.meta / r.resultado / r.variaveis) e antigo (r.formulaName / r.resultFormatted / r.variables)
      const titulo = r.meta?.titulo ?? r.formulaName ?? "Cálculo";
      const valor = r.resultado?.valor ?? r.resultFormatted ?? "";
      const unidade = r.resultado?.unidade ?? r.resultUnit ?? "";
      const unit = unidade ? ` ${unidade}` : "";
      const base = `Resultado: ${titulo} = ${valor}${unit}`;

      // Variáveis: novo schema usa variaveis[].descricao + .valor; antigo usa variables[].name + .value
      const varList: any[] = Array.isArray(r.variaveis)
        ? r.variaveis
        : Array.isArray(r.variables) ? r.variables : [];
      const vars = varList.length > 0
        ? ` | Valores usados: ${varList.map((v: any) => {
            const name = v.descricao ?? v.name ?? v.simbolo ?? v.symbol ?? "";
            const val = v.valor ?? v.value ?? "";
            return `${name}=${val}`;
          }).join(", ")}`
        : "";

      // Fórmula/expressão: novo schema usa formula.abstrata; antigo usa formulaSubstituted
      const formulaText = r.formula?.abstrata ?? r.formulaSubstituted ?? "";
      const expr = formulaText ? ` | Fórmula: ${formulaText}` : "";

      out.push({
        role: "assistant",
        content: `${base}${vars}${expr}`,
      });
    }
  }
  return out;
}

/* ── Exportação principal ── */
export async function runCalculationPipeline(opts: {
  query: string;
  formulaId: string | undefined;
  context: ConversationMessage[];
  sessionId?: string;
  sessionSummary?: string;
  messageCount?: number;
  userName?: string;
}): Promise<OrchestratorResult> {
  const { query, formulaId, context, sessionId, sessionSummary, messageCount = 0, userName } = opts;

  const pipelineStart = Date.now();
  logger.info(
    { formulaId: formulaId ?? "dynamic", query: query.slice(0, 80), sessionId, messageCount },
    "orchestrator: pipeline start"
  );

  /* ══════════════════════════════════════════════════════
     FASE 0 (paralelo com Fase 1) — classifyIntent
     intentAgent roda junto com formulaAgent + contextAgent,
     sem adicionar latência ao caminho crítico de cálculo.
     Se intenção for conversacional, ignora Phase 1 e responde.
     ══════════════════════════════════════════════════════ */

  const phase1Start = Date.now();

  // Modo fixo (formulaId): pula intenção — usuário já escolheu uma fórmula, sempre calcula
  const [intent, formulaResult, contextResult] = await Promise.all([
    formulaId
      ? Promise.resolve<"calculate">("calculate")
      : classifyIntent(query, context, sessionSummary ?? undefined),
    runFormulaAgent(formulaId, query, context),
    runContextAgent(query, context, sessionSummary),
  ]);

  logger.info({ ms: Date.now() - phase1Start, intent }, "orchestrator: phase 1 + intent complete");

  /* ── Intenção conversacional detectada → responde diretamente ── */
  if (intent === "conversational") {
    logger.info({ query: query.slice(0, 60) }, "orchestrator: conversational intent — skipping pipeline");
    const guidance = await runGuidanceAgent({ query, context, sessionSummary, userName });
    return { status: "conversational", message: guidance.message, capturedName: guidance.capturedName };
  }

  /* ── Trata resultados do formulaAgent ── */
  if (formulaResult.status === "not_found") {
    const guidance = await runGuidanceAgent({
      query,
      context,
      sessionSummary,
      failReason: formulaResult.message,
      userName,
    });
    return { status: "conversational", message: guidance.message, capturedName: guidance.capturedName };
  }
  if (formulaResult.status === "wrong_formula") {
    return {
      status: "wrong_formula",
      message: formulaResult.message,
      suggestion: formulaResult.suggestion,
    };
  }

  const formula = formulaResult.formula;

  /* ══════════════════════════════════════════════════════
     BUSCA DE HISTÓRICO SOB DEMANDA
     Se contextAgent sinalizou needsHistory E temos sessionId,
     busca as últimas 30 mensagens do Supabase e refaz a extração
     com o histórico completo como contexto.
     ══════════════════════════════════════════════════════ */

  let resolvedContextResult = contextResult;

  if (contextResult.needsHistory && sessionId) {
    logger.info({ sessionId }, "orchestrator: needsHistory — fetching full session history");
    try {
      const historyRows = await fetchSessionMessages(sessionId, 30);
      const fullContext = dbMessagesToContext(historyRows);

      const retryContext = await runContextAgent(query, fullContext, sessionSummary);
      resolvedContextResult = retryContext;
      logger.info(
        { entityCount: retryContext.entities.length },
        "orchestrator: history fetch — contextAgent retry complete"
      );
    } catch (err) {
      logger.warn({ err }, "orchestrator: history fetch failed, using original result");
    }
  }

  /* ══════════════════════════════════════════════════════
     FASE 2 — expressionAgent (com loop de retry interno)
     ══════════════════════════════════════════════════════ */

  const phase2Start = Date.now();
  let expressionResult;

  try {
    expressionResult = await runExpressionAgent({
      formula,
      contextResult: resolvedContextResult,
      query,
      context,
      maxAttempts: 3,
    });
  } catch (err: any) {
    logger.error({ err, formulaName: formula.name }, "orchestrator: expressionAgent failed all attempts");
    const guidance = await runGuidanceAgent({
      query,
      context,
      sessionSummary,
      failReason: err?.message ?? "Não foi possível montar a expressão matemática.",
      userName,
    });
    return { status: "conversational", message: guidance.message, capturedName: guidance.capturedName };
  }
  logger.info(
    { ms: Date.now() - phase2Start, searchUsed: expressionResult.searchUsed },
    "orchestrator: phase 2 complete"
  );

  /* ── Variáveis faltando → pede ao usuário ── */
  if (!expressionResult.allPresent) {
    return {
      status: "needs_input",
      message: `Para calcular ${formula.name || "este valor"}, preciso de mais alguns dados:`,
      missing: expressionResult.missing,
    };
  }

  /* ══════════════════════════════════════════════════════
     FASE 3 — computeFormula via mathjs
     ══════════════════════════════════════════════════════ */

  const phase3Start = Date.now();
  let computedValue: number;

  try {
    computedValue = computeFormula(expressionResult.expression, expressionResult.extracted);
  } catch (err: any) {
    logger.warn({ err, expression: expressionResult.expression }, "orchestrator: compute failed, retrying expression");

    try {
      const retryResult = await runExpressionAgent({
        formula,
        contextResult: resolvedContextResult,
        query,
        context,
        maxAttempts: 2,
      });

      if (!retryResult.allPresent) {
        return {
          status: "needs_input",
          message: `Para calcular ${formula.name}, preciso de mais alguns dados:`,
          missing: retryResult.missing,
        };
      }

      computedValue = computeFormula(retryResult.expression, retryResult.extracted);
      expressionResult = retryResult;
    } catch (retryErr: any) {
      const guidance = await runGuidanceAgent({
        query,
        context,
        sessionSummary,
        failReason: retryErr?.message ?? "Erro ao calcular a fórmula.",
        userName,
      });
      return { status: "conversational", message: guidance.message, capturedName: guidance.capturedName };
    }
  }
  logger.info({ ms: Date.now() - phase3Start, computedValue }, "orchestrator: phase 3 complete");

  /* ══════════════════════════════════════════════════════
     FASE 4 — validationAgent (prova reversa)
     ══════════════════════════════════════════════════════ */

  const phase4Start = Date.now();
  const validation = await runValidationAgent({ formula, expressionResult, computedValue, query });
  logger.info({ ms: Date.now() - phase4Start, valid: validation.valid }, "orchestrator: phase 4 complete");

  /* ══════════════════════════════════════════════════════
     FASE 5 — buildResult + conversationalAgent (paralelo)
     ══════════════════════════════════════════════════════ */

  const phase5Start = Date.now();
  const [partialResult, conversationalResponse, desenvolvimentoResult] = await Promise.all([
    Promise.resolve(
      buildResult(formula.name, formula.symbolic, expressionResult, computedValue, {
        formulaId: formula.id,
        formulaCategory: formula.category,
        searchUsed: expressionResult.searchUsed,
        proof: validation,
        formulaExpression: formula.expression,
        formulaMeta: formula.expression_meta,
      })
    ),
    runConversationalAgent({ query, formula, expressionResult, computedValue, validation, context, sessionSummary, userName }),
    buildDesenvolvimento({
      formulaName: formula.name,
      formulaSymbolic: formula.symbolic,
      formulaSubstituted: expressionResult.formulaSubstituted,
      expression: expressionResult.expression,
      extracted: expressionResult.extracted,
      variableNames: expressionResult.variableNames,
      variableValues: expressionResult.variableValues,
      solveFor: expressionResult.solveFor,
      computedValue,
      resultUnit: expressionResult.resultUnit,
      resultLabel: expressionResult.resultLabel,
    }),
  ]);

  /* Mescla interpretacao do desenvolvimento no resultado */
  const result = {
    ...partialResult,
    resultado: {
      ...partialResult.resultado,
      interpretacao: desenvolvimentoResult.interpretacao ?? partialResult.resultado.interpretacao,
    },
  };
  const desenvolvimento = desenvolvimentoResult.steps;

  logger.info({ ms: Date.now() - phase5Start }, "orchestrator: phase 5 complete");

  logger.info(
    {
      totalMs: Date.now() - pipelineStart,
      formulaName: formula.name,
      searchUsed: expressionResult.searchUsed,
      valid: validation.valid,
    },
    "orchestrator: pipeline complete"
  );

  /* ══════════════════════════════════════════════════════
     RESUMO DA SESSÃO — fire-and-forget
     Gera novo resumo LLM a cada SUMMARY_EVERY mensagens salvas.
     Após sucesso, o mobile salva 2 mensagens (user + result),
     então disparamos quando messageCount % SUMMARY_EVERY <= 1.
     ══════════════════════════════════════════════════════ */

  if (sessionId && messageCount > 0 && messageCount % SUMMARY_EVERY <= 1) {
    logger.info({ sessionId, messageCount }, "orchestrator: triggering summary generation");
    generateSessionSummary(sessionId, messageCount + 2, sessionSummary).catch((err) => {
      logger.warn({ err, sessionId }, "orchestrator: background summary failed");
    });
  }

  return {
    status: "success",
    result: { ...result, conversationalResponse, desenvolvimento },
  };
}

