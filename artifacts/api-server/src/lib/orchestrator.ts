/* ═══════════════════════════════════════════════════════
   Orquestrador Central — coordena todas as 5 fases do pipeline
   Fase 1: formulaAgent + contextAgent (paralelo)
   Fase 2: expressionAgent (com loop de retry interno)
   Fase 3: computeFormula via mathjs
   Fase 4: validationAgent (prova reversa)
   Fase 5: buildResult + conversationalAgent (paralelo)
   ═══════════════════════════════════════════════════════ */

import { logger } from "./logger";
import { computeFormula } from "./formulaCompute";
import { buildResult } from "./explainBuilder";
import { runFormulaAgent } from "../agents/formulaAgent";
import { runContextAgent } from "../agents/contextAgent";
import { runExpressionAgent } from "../agents/expressionAgent";
import { runValidationAgent } from "../agents/validationAgent";
import { runConversationalAgent } from "../agents/conversationalAgent";
import type { ConversationMessage } from "../agents/types";
import type { ResultData } from "./explainBuilder";

/* ── Tipos do orquestrador ── */
export type OrchestratorSuccess = {
  status: "success";
  result: ResultData;
};

export type OrchestratorNeedsInput = {
  status: "needs_input";
  message: string;
  missing: { symbol: string; name: string; description: string }[];
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
  | OrchestratorFormulaError
  | OrchestratorWrongFormula;

/* ── Exportação principal ── */
export async function runCalculationPipeline(opts: {
  query: string;
  formulaId: string | undefined;
  context: ConversationMessage[];
}): Promise<OrchestratorResult> {
  const { query, formulaId, context } = opts;

  const pipelineStart = Date.now();
  logger.info({ formulaId: formulaId ?? "dynamic", query: query.slice(0, 80) }, "orchestrator: pipeline start");

  /* ══════════════════════════════════════════════════════
     FASE 1 — formulaAgent + contextAgent em paralelo
     formulaAgent: identifica/busca a fórmula
     contextAgent: extrai valores genéricos da conversa
     ══════════════════════════════════════════════════════ */

  const phase1Start = Date.now();
  const [formulaResult, contextResult] = await Promise.all([
    runFormulaAgent(formulaId, query, context),
    runContextAgent(query, context),
  ]);
  logger.info({ ms: Date.now() - phase1Start }, "orchestrator: phase 1 complete");

  /* ── Trata resultados do formulaAgent ── */
  if (formulaResult.status === "not_found") {
    return { status: "formula_error", message: formulaResult.message };
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
     FASE 2 — expressionAgent (com loop de retry interno)
     Mapeia valores extraídos → variáveis da fórmula
     Constrói e valida expressão MathJS
     Loop: máx 3 tentativas, busca web como fallback
     ══════════════════════════════════════════════════════ */

  const phase2Start = Date.now();
  let expressionResult;

  try {
    expressionResult = await runExpressionAgent({
      formula,
      contextResult,
      query,
      context,
      maxAttempts: 3,
    });
  } catch (err: any) {
    logger.error({ err, formulaName: formula.name }, "orchestrator: expressionAgent failed all attempts");
    return {
      status: "formula_error",
      message: err?.message ?? "Não foi possível montar a expressão matemática. Tente descrever o cálculo com mais detalhes.",
    };
  }
  logger.info({ ms: Date.now() - phase2Start, searchUsed: expressionResult.searchUsed }, "orchestrator: phase 2 complete");

  /* ── Variáveis faltando → pede ao usuário ── */
  if (!expressionResult.allPresent) {
    const formulaDisplayName = formula.name || "este valor";
    return {
      status: "needs_input",
      message: `Para calcular ${formulaDisplayName}, preciso de mais alguns dados:`,
      missing: expressionResult.missing,
    };
  }

  /* ══════════════════════════════════════════════════════
     FASE 3 — computeFormula via mathjs
     Se falhar, tenta re-executar expressionAgent uma vez mais
     ══════════════════════════════════════════════════════ */

  const phase3Start = Date.now();
  let computedValue: number;

  try {
    computedValue = computeFormula(expressionResult.expression, expressionResult.extracted);
  } catch (err: any) {
    logger.warn({ err, expression: expressionResult.expression }, "orchestrator: compute failed, retrying expression");

    // Uma tentativa extra com contexto de erro
    try {
      const retryResult = await runExpressionAgent({
        formula,
        contextResult,
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
      return {
        status: "formula_error",
        message: retryErr?.message ?? "Erro ao calcular a fórmula. Verifique os valores informados.",
      };
    }
  }
  logger.info({ ms: Date.now() - phase3Start, computedValue }, "orchestrator: phase 3 complete");

  /* ══════════════════════════════════════════════════════
     FASE 4 — validationAgent (prova reversa)
     Verifica consistência matemática + razoabilidade
     Se inválido, registra mas não bloqueia (adiciona aviso)
     ══════════════════════════════════════════════════════ */

  const phase4Start = Date.now();
  const validation = await runValidationAgent({
    formula,
    expressionResult,
    computedValue,
    query,
  });
  logger.info({ ms: Date.now() - phase4Start, valid: validation.valid }, "orchestrator: phase 4 complete");

  /* ══════════════════════════════════════════════════════
     FASE 5 — buildResult + conversationalAgent (paralelo)
     buildResult: monta ResultData com prova
     conversationalAgent: gera resposta em linguagem natural
     ══════════════════════════════════════════════════════ */

  const phase5Start = Date.now();
  const [result, conversationalResponse] = await Promise.all([
    Promise.resolve(
      buildResult(
        formula.name,
        formula.symbolic,
        expressionResult,
        computedValue,
        {
          searchUsed: expressionResult.searchUsed,
          warning: validation.valid ? undefined : validation.detail,
          proof: validation,
        }
      )
    ),
    runConversationalAgent({
      query,
      formula,
      expressionResult,
      computedValue,
      validation,
    }),
  ]);
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

  return {
    status: "success",
    result: { ...result, conversationalResponse },
  };
}
