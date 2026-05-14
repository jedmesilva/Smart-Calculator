/* ═══════════════════════════════════════════════════════
   Agent 2 — Calculator
   Recebe {objective, values, contextSummary} do orquestrador.

   Decide a estratégia:
   → SIMPLE  : monta uma única expressão MathJS com valores literais
               → math.evaluate() → resultado instantâneo
   → COMPLEX : raciocina passo a passo, cada step é uma sub-expressão
               MathJS; steps anteriores podem ser referenciados por {label}

   Se receber feedback do Evaluator (retry), o prompt é estendido
   com o feedback para que o agente corrija o problema apontado.

   Após obter a estrutura do LLM, executa tudo localmente com MathJS
   e retorna um resultado completamente computado.
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { computeFormula } from "../lib/formulaCompute";
import { logger } from "../lib/logger";
import { normalizeUnit, UNIT_PROMPT_RULES, type UnitType } from "../lib/unitUtils";

/* ── Tipos ────────────────────────────────────────────── */

export type CalcVariable = {
  symbol: string;
  name: string;
  value: string;         // legível (ex: "R$ 1.000")
  numericValue?: number; // extraído para uso interno
};

export type CalcStep = {
  description: string;
  expression: string; // pode conter referências {label}
  label: string;
};

export type ComputedStep = {
  description: string;
  expression: string; // expressão já resolvida (sem {label})
  label: string;
  value: number;
};

export type CalculatorResult = {
  strategy: "simple" | "complex";
  formulaName: string;
  formulaSymbolic: string;
  expression: string;
  computedValue: number;
  computedSteps?: ComputedStep[];
  resultUnit: string;       // símbolo canônico após normalização
  resultUnitType: UnitType; // tipo semântico (currency, percent, physical, …)
  resultLabel: string;
  solveFor: string;
  variables: CalcVariable[];
  extracted: Record<string, number>;
  variableNames: Record<string, string>;
  variableValues: Record<string, string>;
  formulaSubstituted: string;
};

export type CalculatorInput = {
  objective: string;
  values: Record<string, number | string>;
  contextSummary: string;
  feedback?: {
    score: number;
    feedback: string;
    suggestion: string | null;
  };
  formulaHint?: string; // nome/descrição de fórmula pré-selecionada
};

/* ── Prompt base do Agent 2 ──────────────────────────── */

const CALCULATOR_SYSTEM = `Você é um agente matemático especializado do Phormula.
Você recebe um objetivo claro e os valores já extraídos da conversa.
Você tem acesso ao MathJS para executar expressões.

MathJS aceita: operadores (+,-,*,/,^), funções (sqrt, log, sin, cos, tan, factorial, abs, exp),
constantes (pi, e), e expressões encadeadas.
Funções especiais disponíveis:
  integrate(expr, x, a, b)   — integral definida
  derivative(expr, x, a)     — derivada numérica em um ponto
  summation(expr, k, a, b)   — somatório
  limit(expr, x, a)          — limite numérico
  product(expr, k, a, b)     — produto

PASSO 1 — Decida a estratégia:
Analise se o problema é resolvível com uma única expressão MathJS direta.
Se sim → estratégia SIMPLE.
Se o resultado de um passo alimenta o próximo → estratégia COMPLEX.

PASSO 2 — Identifique a fórmula correta. Justifique internamente por que essa e não outra.

PASSO 3 — Monte as expressões MathJS com os valores literais fornecidos. Cada expressão deve
ser autocontida e válida. NÃO use variáveis simbólicas — substitua pelos valores numéricos.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Estratégia SIMPLE:
{
  "strategy": "simple",
  "formulaName": "Nome da fórmula",
  "formulaSymbolic": "M = C × (1 + i)^n",
  "solveFor": "M",
  "expression": "1000 * (1 + 0.01)^12",
  "resultUnit": "R$",
  "resultLabel": "montante final",
  "variables": [
    {"symbol": "C", "name": "Capital inicial", "value": "R$ 1.000", "numericValue": 1000},
    {"symbol": "i", "name": "Taxa de juros", "value": "1% ao mês", "numericValue": 0.01},
    {"symbol": "n", "name": "Número de períodos", "value": "12 meses", "numericValue": 12}
  ]
}

Estratégia COMPLEX:
{
  "strategy": "complex",
  "formulaName": "Nome da fórmula",
  "formulaSymbolic": "M = C × (1 + i)^n",
  "solveFor": "M",
  "steps": [
    {
      "description": "Calcular o fator de crescimento (1 + i)^n",
      "expression": "(1 + 0.01)^12",
      "label": "fator"
    },
    {
      "description": "Aplicar o fator sobre o capital",
      "expression": "1000 * {fator}",
      "label": "montante"
    }
  ],
  "resultStep": "montante",
  "resultUnit": "R$",
  "resultLabel": "montante final",
  "variables": [
    {"symbol": "C", "name": "Capital inicial", "value": "R$ 1.000", "numericValue": 1000},
    {"symbol": "i", "name": "Taxa de juros", "value": "1% ao mês", "numericValue": 0.01},
    {"symbol": "n", "name": "Número de períodos", "value": "12 meses", "numericValue": 12}
  ]
}

Em COMPLEX, use {label} para referenciar o resultado de um step anterior.
O último step ou o step indicado em "resultStep" é o resultado final.
REGRA: "numericValue" em cada variável DEVE ser o número puro (sem unidade, sem formatação pt-BR).
REGRA: "expression" DEVE conter valores numéricos literais (substitua todos os símbolos).

${UNIT_PROMPT_RULES}`;

/* ── Resolvedor de steps complexos com {label} ────────── */

function resolveComplexSteps(
  steps: CalcStep[],
  resultStep: string
): { computedSteps: ComputedStep[]; finalValue: number; finalExpression: string } {
  const labelValues: Record<string, number> = {};
  const computedSteps: ComputedStep[] = [];

  for (const step of steps) {
    // Substitui referências {label} pelo valor computado do step anterior
    let resolvedExpr = step.expression;
    for (const [label, value] of Object.entries(labelValues)) {
      resolvedExpr = resolvedExpr.replace(
        new RegExp(`\\{${label}\\}`, "g"),
        String(value)
      );
    }

    let value: number;
    try {
      value = computeFormula(resolvedExpr, {});
    } catch (err: any) {
      throw new Error(
        `Erro no passo "${step.label}" (expressão: ${resolvedExpr}): ${err?.message ?? "erro MathJS"}`
      );
    }

    if (!isFinite(value)) {
      throw new Error(`Passo "${step.label}" retornou valor inválido (${value}).`);
    }

    labelValues[step.label] = value;
    computedSteps.push({
      description: step.description,
      expression: resolvedExpr,
      label: step.label,
      value,
    });
  }

  const finalStep =
    computedSteps.find((s) => s.label === resultStep) ??
    computedSteps[computedSteps.length - 1];

  if (!finalStep) {
    throw new Error("Nenhum step encontrado após execução complexa.");
  }

  return {
    computedSteps,
    finalValue: finalStep.value,
    finalExpression: finalStep.expression,
  };
}

/* ── Extrai extracted/variableNames/variableValues das variables ── */

function buildVariableMaps(variables: CalcVariable[]): {
  extracted: Record<string, number>;
  variableNames: Record<string, string>;
  variableValues: Record<string, string>;
} {
  const extracted: Record<string, number> = {};
  const variableNames: Record<string, string> = {};
  const variableValues: Record<string, string> = {};

  for (const v of variables) {
    variableNames[v.symbol] = v.name;
    variableValues[v.symbol] = v.value;
    if (v.numericValue !== undefined && isFinite(v.numericValue)) {
      extracted[v.symbol] = v.numericValue;
    }
  }

  return { extracted, variableNames, variableValues };
}

/* ── Deriva formulaSubstituted a partir da symbolic ─────── */

function buildFormulaSubstituted(
  formulaSymbolic: string,
  variables: CalcVariable[]
): string {
  let result = formulaSymbolic;
  // Substitui cada símbolo pelo valor legível
  for (const v of variables) {
    result = result.replace(
      new RegExp(`\\b${v.symbol}\\b`, "g"),
      v.value
    );
  }
  return result;
}

/* ── Parse + validação da resposta LLM ────────────────── */

function parseJson(raw: string, ctx: string): any {
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
  } catch (err) {
    logger.error({ raw: raw.slice(0, 300), err }, `calculatorAgent[${ctx}]: JSON parse failed`);
    throw new Error("Não foi possível interpretar a resposta do agente calculador.");
  }
}

/* ══════════════════════════════════════════════════════
   Exportação principal
   ══════════════════════════════════════════════════════ */

export async function runCalculatorAgent(
  input: CalculatorInput,
  emit?: (msg: string) => void
): Promise<CalculatorResult> {
  const { objective, values, contextSummary, feedback, formulaHint } = input;

  /* ── Monta o conteúdo do usuário ── */
  const valuesText = Object.entries(values)
    .map(([k, v]) => `  "${k}": ${v}`)
    .join("\n");

  const feedbackBlock = feedback
    ? `\n\nFEEDBACK DO AVALIADOR (score: ${feedback.score}/10):\n"${feedback.feedback}"\n${
        feedback.suggestion ? `Sugestão: "${feedback.suggestion}"` : ""
      }\n\nReleia o objetivo e os valores, corrija o problema apontado, e emita um novo JSON com a estratégia revisada.`
    : "";

  const formulaHintBlock = formulaHint
    ? `\nFórmula sugerida (pré-selecionada pelo usuário): ${formulaHint}\nUse esta fórmula se for adequada para o objetivo.`
    : "";

  const userContent = [
    `Objetivo: ${objective}`,
    formulaHintBlock,
    `\nValores disponíveis:\n${valuesText || "  (nenhum valor explícito — use seu conhecimento)"}`,
    contextSummary ? `\nContexto adicional: ${contextSummary}` : "",
    feedbackBlock,
  ]
    .filter(Boolean)
    .join("\n");

  if (emit) emit(feedback ? "Revisando cálculo com base no feedback…" : "Analisando fórmula e estratégia…");

  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    max_completion_tokens: 800,
    messages: [
      { role: "system", content: CALCULATOR_SYSTEM },
      { role: "user", content: userContent },
    ],
  } as any);

  const raw = response.choices[0]?.message?.content ?? "";
  const parsed = parseJson(raw, feedback ? "retry" : "initial");

  /* ── Executa com MathJS ── */

  if (parsed.strategy === "simple") {
    if (emit) emit("Executando cálculo…");

    const computedValue = computeFormula(parsed.expression ?? "", {});

    if (!isFinite(computedValue)) {
      throw new Error("O cálculo retornou um valor inválido. Verifique os valores informados.");
    }

    const variables: CalcVariable[] = parsed.variables ?? [];
    const { extracted, variableNames, variableValues } = buildVariableMaps(variables);
    const formulaSubstituted = buildFormulaSubstituted(
      parsed.formulaSymbolic ?? "",
      variables
    );

    logger.info(
      {
        strategy: "simple",
        formulaName: parsed.formulaName,
        expression: parsed.expression,
        computedValue,
      },
      "calculatorAgent: simple result"
    );

    const normUnit = normalizeUnit(parsed.resultUnit ?? "");

    return {
      strategy: "simple",
      formulaName: parsed.formulaName ?? "Cálculo",
      formulaSymbolic: parsed.formulaSymbolic ?? "",
      expression: parsed.expression ?? "",
      computedValue,
      resultUnit: normUnit.symbol,
      resultUnitType: normUnit.type,
      resultLabel: parsed.resultLabel ?? "resultado",
      solveFor: parsed.solveFor ?? "R",
      variables,
      extracted,
      variableNames,
      variableValues,
      formulaSubstituted,
    };
  }

  if (parsed.strategy === "complex") {
    if (emit) emit("Executando cálculo em etapas…");

    const steps: CalcStep[] = parsed.steps ?? [];
    if (steps.length === 0) {
      throw new Error("Estratégia complexa sem steps definidos.");
    }

    const { computedSteps, finalValue, finalExpression } = resolveComplexSteps(
      steps,
      parsed.resultStep ?? steps[steps.length - 1]?.label ?? ""
    );

    const variables: CalcVariable[] = parsed.variables ?? [];
    const { extracted, variableNames, variableValues } = buildVariableMaps(variables);
    const formulaSubstituted = buildFormulaSubstituted(
      parsed.formulaSymbolic ?? "",
      variables
    );

    logger.info(
      {
        strategy: "complex",
        formulaName: parsed.formulaName,
        stepsCount: computedSteps.length,
        finalValue,
      },
      "calculatorAgent: complex result"
    );

    const normUnit = normalizeUnit(parsed.resultUnit ?? "");

    return {
      strategy: "complex",
      formulaName: parsed.formulaName ?? "Cálculo",
      formulaSymbolic: parsed.formulaSymbolic ?? "",
      expression: finalExpression,
      computedValue: finalValue,
      computedSteps,
      resultUnit: normUnit.symbol,
      resultUnitType: normUnit.type,
      resultLabel: parsed.resultLabel ?? "resultado",
      solveFor: parsed.solveFor ?? "R",
      variables,
      extracted,
      variableNames,
      variableValues,
      formulaSubstituted,
    };
  }

  throw new Error(`Estratégia desconhecida retornada pelo agente: "${parsed.strategy}".`);
}
