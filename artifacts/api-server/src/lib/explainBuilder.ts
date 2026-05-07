import type { ExpressionResult } from "../agents/types";
import type { ValidationResult } from "../agents/types";

export type ProofResult = {
  verified: boolean;
  method: string;
  detail: string;
};

export type ResultData = {
  formulaName: string;
  resultFormatted: string;
  resultUnit: string;
  resultLabel: string;
  formulaSymbolic: string;
  formulaSubstituted: string;
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

export function buildResult(
  formulaName: string,
  symbolic: string,
  vars: VarsLike,
  computedValue: number,
  options: {
    warning?: string;
    searchUsed?: boolean;
    proof?: ValidationResult;
  } = {}
): Omit<ResultData, "conversationalResponse"> {
  const formatted = formatPtBR(computedValue, vars.resultUnit);

  const variables = Object.entries(vars.variableValues)
    .filter(([sym]) => sym !== vars.solveFor)
    .map(([symbol, value]) => ({
      symbol,
      name: vars.variableNames[symbol] ?? symbol,
      value,
    }));

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

  return {
    formulaName,
    resultFormatted: formatted,
    resultUnit: vars.resultUnit,
    resultLabel: vars.resultLabel,
    formulaSymbolic: symbolic,
    formulaSubstituted: vars.formulaSubstituted,
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
  const varList = Object.entries(vars.variableValues)
    .filter(([sym]) => sym !== vars.solveFor)
    .map(([sym, val]) => `${sym} = ${val}`)
    .join(", ");

  return [
    `Identificamos as variáveis: ${varList}`,
    `Substituímos na fórmula: ${vars.formulaSubstituted}`,
    `Resultado: ${vars.solveFor} = ${vars.resultUnit ? vars.resultUnit + " " : ""}${formattedResult}`,
  ];
}
