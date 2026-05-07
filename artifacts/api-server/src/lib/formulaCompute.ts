import { evaluate } from "mathjs";

/**
 * Evaluates a mathjs expression with the given variable values.
 * Returns the numeric result or throws if invalid.
 */
export function computeFormula(
  expression: string,
  variables: Record<string, number>
): number {
  let rawResult: unknown;

  try {
    rawResult = evaluate(expression, variables);
  } catch (err: any) {
    throw new Error(
      `Erro ao avaliar a fórmula: ${err?.message ?? "expressão inválida"}. Verifique os valores informados.`
    );
  }

  // mathjs may return a Unit, Matrix, or number
  const num =
    rawResult != null && typeof (rawResult as any).toNumber === "function"
      ? (rawResult as any).toNumber()
      : Number(rawResult);

  if (!isFinite(num)) {
    throw new Error(
      "O resultado da fórmula é inválido (divisão por zero ou valor infinito). Verifique os valores informados."
    );
  }

  return num;
}
