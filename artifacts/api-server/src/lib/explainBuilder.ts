import { parse } from "mathjs";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { ExpressionResult, ValidationResult } from "../agents/types";
import { logger } from "./logger";

/* ═══════════════════════════════════════════════════════
   Schema Universal de Resultado
   ═══════════════════════════════════════════════════════ */

export type DesenvolvimentoStep = {
  ordem: number;
  descricao: string;
  latex: string | null;
  tipo: "substituicao" | "simplificacao" | "teorema" | "resolucao" | "resultado";
};

export type ResultData = {
  formulaId?: string | null;
  searchUsed?: boolean;
  warning?: string | null;
  conversationalResponse: string;

  meta: {
    titulo: string;
    categoria: string;
    subcategoria: string;
    responsavel: string;
    timestamp: string;
  };

  formula: {
    abstrata: string;
    latex: string | null;
    referencia: string | null;
  };

  variaveis: {
    simbolo: string;
    descricao: string;
    valor: string;
    unidade: string;
  }[];

  desenvolvimento: DesenvolvimentoStep[];

  resultado: {
    valor: string;
    latex: string | null;
    unidade: string;
  };

  prova: {
    tipo: "inversa" | "derivacao" | "substituicao" | "razoabilidade";
    descricao: string;
    latex: string | null;
    valido: boolean;
  };
};

/* ── Gera LaTeX da fórmula simbólica via mathjs ── */
function toLatexSymbolic(expression: string, solveFor: string): string | null {
  try {
    const tex = parse(expression)
      .toTex()
      .replace(/\bPI\b/g, "\\pi")
      .replace(/\bE\b(?=[^a-zA-Z])/g, "e");
    return `${solveFor} = ${tex}`;
  } catch {
    return null;
  }
}

/* ── Gera LaTeX com valores substituídos + resultado ── */
function toLatexResultado(
  expression: string,
  extracted: Record<string, number>,
  solveFor: string,
  computedValue: number,
  resultUnit: string
): string | null {
  try {
    const sorted = Object.entries(extracted).sort((a, b) => b[0].length - a[0].length);
    let subst = expression;
    for (const [sym, val] of sorted) {
      subst = subst.replace(new RegExp(`\\b${sym}\\b`, "g"), String(val));
    }
    const tex = parse(subst)
      .toTex()
      .replace(/\bPI\b/g, "\\pi")
      .replace(/\bE\b(?=[^a-zA-Z])/g, "e");

    let displayValue = computedValue;
    if (resultUnit === "%") displayValue = computedValue * 100;
    const decimals = Number.isInteger(displayValue) ? 0 : 2;
    const formatted = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(displayValue).replace(",", "{,}");
    const unitPart = resultUnit && resultUnit !== "%" ? `\\;\\text{${resultUnit}}` : (resultUnit === "%" ? "\\%" : "");

    return `${solveFor} = ${tex} = ${formatted}${unitPart}`;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════
   Prompt para geração de passos de desenvolvimento via LLM
   ═══════════════════════════════════════════════════════ */

const DESENVOLV_SYSTEM = `Você é um especialista em matemática. Dado o cálculo, gere os passos detalhados de desenvolvimento algébrico.

RETORNE APENAS um array JSON válido, sem markdown, sem texto adicional.

Formato de cada item:
{
  "ordem": 1,
  "descricao": "descrição em português do que foi feito",
  "latex": "expressão LaTeX KaTeX para esse passo (ou null)",
  "tipo": "substituicao"
}

Tipos possíveis:
- substituicao: substituir valores numéricos na expressão
- simplificacao: simplificar ou reorganizar algebricamente
- teorema: aplicar propriedade, identidade ou teorema matemático
- resolucao: resolver operação intermediária
- resultado: passo final com o resultado completo (SEMPRE o último)

Regras críticas:
- Nunca pule etapas. Nunca agrupe dois passos em um.
- O último passo SEMPRE tem tipo "resultado".
- Use LaTeX compatível com KaTeX (expressões inline, sem \\begin{equation}).
- Para decimais pt-BR no LaTeX: use {,} ex: 1{,}5 (não 1.5).
- Inclua unidades no LaTeX quando relevante: \\text{m}, \\text{kg}, \\text{R\\$}.
- latex pode ser null apenas se o passo não tiver expressão matemática.`;

export async function buildDesenvolvimento(opts: {
  formulaName: string;
  formulaSymbolic: string;
  expression: string;
  extracted: Record<string, number>;
  variableNames: Record<string, string>;
  variableValues: Record<string, string>;
  solveFor: string;
  computedValue: number;
  resultUnit: string;
  resultLabel: string;
}): Promise<DesenvolvimentoStep[]> {
  const { formulaName, formulaSymbolic, expression, extracted, variableNames,
          variableValues, solveFor, computedValue, resultUnit, resultLabel } = opts;

  const varDesc = Object.entries(extracted)
    .filter(([sym]) => sym !== solveFor)
    .map(([sym, val]) => {
      const display = variableValues[sym] ?? String(val);
      const name = variableNames[sym] ?? sym;
      return `${sym} = ${display} (${name})`;
    })
    .join(", ");

  let displayValue = computedValue;
  if (resultUnit === "%") displayValue = computedValue * 100;
  const decimals = Number.isInteger(displayValue) ? 0 : 2;
  const formattedResult = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(displayValue);

  const userContent = [
    `Fórmula: ${formulaName}`,
    `Expressão simbólica: ${formulaSymbolic}`,
    `Expressão mathjs calculada: ${expression}`,
    `Variável calculada: ${solveFor} = ${resultLabel}`,
    `Variáveis de entrada: ${varDesc || "(nenhuma)"}`,
    `Resultado: ${solveFor} = ${resultUnit ? resultUnit + " " : ""}${formattedResult}`,
  ].join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: DESENVOLV_SYSTEM },
        { role: "user", content: userContent },
      ],
    } as any);

    const raw = response.choices[0]?.message?.content ?? "[]";
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("LLM returned empty or non-array");
    }

    return parsed.map((step: any, idx: number) => ({
      ordem: step.ordem ?? idx + 1,
      descricao: step.descricao ?? "",
      latex: step.latex ?? null,
      tipo: step.tipo ?? "resolucao",
    }));
  } catch (err) {
    logger.warn({ err }, "buildDesenvolvimento: LLM failed, using fallback");
    return buildFallbackDesenvolvimento(expression, extracted, variableNames, variableValues,
      solveFor, computedValue, resultUnit, resultLabel);
  }
}

/* ── Fallback determinístico caso o LLM falhe ── */
function buildFallbackDesenvolvimento(
  expression: string,
  extracted: Record<string, number>,
  variableNames: Record<string, string>,
  variableValues: Record<string, string>,
  solveFor: string,
  computedValue: number,
  resultUnit: string,
  resultLabel: string
): DesenvolvimentoStep[] {
  const inputVars = Object.entries(extracted).filter(([sym]) => sym !== solveFor);

  const steps: DesenvolvimentoStep[] = [];

  if (inputVars.length > 0) {
    const varList = inputVars
      .map(([sym]) => {
        const display = variableValues[sym] ?? String(extracted[sym]);
        const name = variableNames[sym] ?? sym;
        return `${sym} = ${display} (${name})`;
      })
      .join(", ");

    steps.push({
      ordem: 1,
      descricao: `Identificamos as variáveis: ${varList}`,
      latex: inputVars
        .map(([sym]) => {
          const val = extracted[sym];
          return `${sym} = ${String(val).replace(".", "{,}")}`;
        })
        .join(",\\;"),
      tipo: "substituicao",
    });
  }

  let substExpr = expression;
  const sorted = Object.entries(extracted).sort((a, b) => b[0].length - a[0].length);
  for (const [sym, val] of sorted) {
    substExpr = substExpr.replace(new RegExp(`\\b${sym}\\b`, "g"), String(val));
  }

  steps.push({
    ordem: steps.length + 1,
    descricao: `Substituímos os valores na expressão`,
    latex: null,
    tipo: "substituicao",
  });

  let displayValue = computedValue;
  if (resultUnit === "%") displayValue = computedValue * 100;
  const decimals = Number.isInteger(displayValue) ? 0 : 2;
  const formattedResult = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(displayValue);

  const unitPrefix = resultUnit && resultUnit !== "%" ? `${resultUnit} ` : resultUnit === "%" ? "" : "";
  const pct = resultUnit === "%" ? "%" : "";

  steps.push({
    ordem: steps.length + 1,
    descricao: `Resultado: ${resultLabel || solveFor} = ${unitPrefix}${formattedResult}${pct}`,
    latex: `${solveFor} = ${formattedResult.replace(",", "{,}")}${resultUnit && resultUnit !== "%" ? `\\;\\text{${resultUnit}}` : pct ? "\\%" : ""}`,
    tipo: "resultado",
  });

  return steps;
}

/* ═══════════════════════════════════════════════════════
   buildResult — monta o ResultData (sem conversationalResponse e desenvolvimento)
   ═══════════════════════════════════════════════════════ */

type VarsLike = Pick<
  ExpressionResult,
  | "expression"
  | "solveFor"
  | "extracted"
  | "variableNames"
  | "variableValues"
  | "resultUnit"
  | "resultLabel"
  | "formulaSubstituted"
>;

export function buildResult(
  formulaName: string,
  symbolic: string,
  vars: VarsLike,
  computedValue: number,
  options: {
    formulaId?: string | null;
    formulaCategory?: string | null;
    warning?: string;
    searchUsed?: boolean;
    proof?: ValidationResult;
    formulaExpression?: string | null;
  } = {}
): Omit<ResultData, "conversationalResponse" | "desenvolvimento"> {
  const formatted = formatPtBR(computedValue, vars.resultUnit);

  const allSymbols = new Set([
    ...Object.keys(vars.variableValues),
    ...Object.keys(vars.extracted),
  ]);

  const variaveis = [...allSymbols]
    .filter((sym) => sym !== vars.solveFor)
    .map((sym) => ({
      simbolo: sym,
      descricao: vars.variableNames[sym] ?? sym,
      valor: vars.variableValues[sym] ?? String(vars.extracted[sym] ?? ""),
      unidade: "",
    }))
    .filter((v) => v.valor !== "");

  const latexSym = options.formulaExpression
    ? toLatexSymbolic(options.formulaExpression, vars.solveFor)
    : null;

  const latexRes = options.formulaExpression
    ? toLatexResultado(options.formulaExpression, vars.extracted, vars.solveFor, computedValue, vars.resultUnit)
    : null;

  const prova = options.proof
    ? {
        tipo: options.proof.tipo,
        descricao: options.proof.detail,
        latex: null as string | null,
        valido: options.proof.valid,
      }
    : {
        tipo: "razoabilidade" as const,
        descricao: "Verificação não realizada.",
        latex: null as string | null,
        valido: true,
      };

  return {
    formulaId: options.formulaId ?? null,
    searchUsed: options.searchUsed ?? false,
    warning: options.warning ?? null,

    meta: {
      titulo: formulaName,
      categoria: options.formulaCategory ?? "Cálculo",
      subcategoria: vars.resultLabel || vars.solveFor,
      responsavel: "Phormula",
      timestamp: new Date().toISOString(),
    },

    formula: {
      abstrata: symbolic,
      latex: latexSym,
      referencia: formulaName,
    },

    variaveis,

    resultado: {
      valor: formatted,
      latex: latexRes,
      unidade: vars.resultUnit,
    },

    prova,
  };
}

function formatPtBR(value: number, unit: string): string {
  if (unit === "%") {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(value * 100);
  }
  const decimals = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
