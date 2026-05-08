import { parse } from "mathjs";
import { latexToSvg } from "./mathRenderer";
import type { ExpressionResult } from "../agents/types";
import type { ValidationResult } from "../agents/types";

export type ProofResult = {
  verified: boolean;
  method: string;
  detail: string;
};

export type ResultData = {
  formulaId?: string | null;
  formulaCategory?: string | null;
  formulaName: string;
  resultFormatted: string;
  resultUnit: string;
  resultLabel: string;
  formulaSymbolic: string;
  formulaSubstituted: string;
  svgSymbolic?: string | null;
  svgSubstituted?: string | null;
  variables: { symbol: string; name: string; value: string }[];
  steps: string[];
  note: string | null;
  warning?: string | null;
  searchUsed?: boolean;
  proof: ProofResult;
  conversationalResponse: string;
};

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

/* ── Geração de LaTeX via mathjs ── */
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

function toLatexSubstituted(
  expression: string,
  extracted: Record<string, number>,
  solveFor: string,
  computedValue?: number,
  resultUnit?: string
): string | null {
  try {
    // Substitui os valores na expressão, do símbolo mais longo para o mais curto
    // para evitar substituições parciais (ex: "altura_cm" antes de "altura")
    const sorted = Object.entries(extracted).sort(
      (a, b) => b[0].length - a[0].length
    );
    let subst = expression;
    for (const [sym, val] of sorted) {
      subst = subst.replace(new RegExp(`\\b${sym}\\b`, "g"), String(val));
    }
    const tex = parse(subst)
      .toTex()
      .replace(/\bPI\b/g, "\\pi")
      .replace(/\bE\b(?=[^a-zA-Z])/g, "e");

    let result = `${solveFor} = ${tex}`;

    if (computedValue !== undefined) {
      let displayValue = computedValue;
      if (resultUnit === "%") displayValue = computedValue * 100;
      const decimals = Number.isInteger(displayValue) ? 0 : 2;
      const formatted = new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(displayValue).replace(",", "{,}");
      const unitPart = resultUnit && resultUnit !== "%" ? `\\;\\text{${resultUnit}}` : (resultUnit === "%" ? "\\%" : "");
      result += ` = ${formatted}${unitPart}`;
    }

    return result;
  } catch {
    return null;
  }
}

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
): Omit<ResultData, "conversationalResponse"> {
  const formatted = formatPtBR(computedValue, vars.resultUnit);

  // Use variableValues as primary source so that inline-expression results
  // (where extracted is {}) still display variables. Fall back to extracted.
  const allSymbols = new Set([
    ...Object.keys(vars.variableValues),
    ...Object.keys(vars.extracted),
  ]);
  const variables = [...allSymbols]
    .filter((sym) => sym !== vars.solveFor)
    .map((sym) => ({
      symbol: sym,
      name: vars.variableNames[sym] ?? sym,
      value: vars.variableValues[sym] ?? String(vars.extracted[sym] ?? ""),
    }))
    .filter((v) => v.value !== "");

  const steps = buildSteps(vars, formatted);

  const proof: ProofResult = options.proof
    ? {
        verified: options.proof.valid,
        method: options.proof.method,
        detail: options.proof.detail,
      }
    : {
        verified: true,
        method: "Não verificado",
        detail: "Verificação não realizada.",
      };

  // svgSymbolic: apenas quando temos a expressão do DB (fórmula com símbolos conhecidos)
  const latexSym = options.formulaExpression
    ? toLatexSymbolic(options.formulaExpression, vars.solveFor)
    : null;
  const svgSymbolic = latexSym ? latexToSvg(latexSym) : null;

  // formulaSubstituted text: expressão com valores + resultado (quebra linha no mobile)
  const unitPrefix = vars.resultUnit && vars.resultUnit !== "%" ? `${vars.resultUnit} ` : "";
  const formulaSubstitutedWithResult = vars.formulaSubstituted
    ? `${vars.formulaSubstituted} = ${unitPrefix}${formatted}`
    : "";

  return {
    formulaId: options.formulaId ?? null,
    formulaCategory: options.formulaCategory ?? null,
    formulaName,
    resultFormatted: formatted,
    resultUnit: vars.resultUnit,
    resultLabel: vars.resultLabel,
    formulaSymbolic: symbolic,
    formulaSubstituted: formulaSubstitutedWithResult || vars.formulaSubstituted,
    svgSymbolic,
    svgSubstituted: null,
    variables,
    steps,
    note: null,
    warning: options.warning ?? null,
    searchUsed: options.searchUsed ?? false,
    proof,
  };
}

function formatPtBR(value: number, unit: string): string {
  if (unit === "%") {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(
      value * 100
    );
  }
  const decimals = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function buildSteps(vars: VarsLike, formattedResult: string): string[] {
  const varList = Object.entries(vars.extracted)
    .filter(([sym]) => sym !== vars.solveFor)
    .map(([sym, numVal]) => {
      const display = vars.variableValues[sym] ?? String(numVal);
      return `${sym} = ${display}`;
    })
    .join(", ");

  return [
    `Identificamos as variáveis: ${varList}`,
    `Substituímos na fórmula: ${vars.formulaSubstituted}`,
    `Resultado: ${vars.solveFor} = ${vars.resultUnit ? vars.resultUnit + " " : ""}${formattedResult}`,
  ];
}
