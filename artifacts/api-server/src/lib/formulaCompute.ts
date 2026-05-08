import { evaluate, parse, compile, pi, e } from "mathjs";

/* ══════════════════════════════════════════════════════
   Integração Numérica — Regra de Simpson Adaptativa
   Avalia ∫f(x)dx de a até b com precisão configurável
   ══════════════════════════════════════════════════════ */
function numericalIntegrate(
  exprStr: string,
  variable: string,
  a: number,
  b: number,
  steps = 1000
): number {
  const compiled = compile(exprStr);

  // Garante número par de intervalos (requisito Simpson)
  const n = steps % 2 === 0 ? steps : steps + 1;
  const h = (b - a) / n;

  function f(x: number): number {
    const scope: Record<string, number> = { [variable]: x, pi: Math.PI, e: Math.E };
    const res = compiled.evaluate(scope);
    return typeof res === "number" ? res : Number(res);
  }

  // Simpson 1/3 rule
  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) {
    const x = a + i * h;
    sum += (i % 2 === 0 ? 2 : 4) * f(x);
  }

  return (h / 3) * sum;
}

/* ══════════════════════════════════════════════════════
   Derivada Numérica — Diferença Central
   Avalia f'(x) no ponto x = a
   ══════════════════════════════════════════════════════ */
function numericalDerivative(
  exprStr: string,
  variable: string,
  a: number,
  h = 1e-7
): number {
  const compiled = compile(exprStr);

  function f(x: number): number {
    const scope: Record<string, number> = { [variable]: x, pi: Math.PI, e: Math.E };
    const res = compiled.evaluate(scope);
    return typeof res === "number" ? res : Number(res);
  }

  return (f(a + h) - f(a - h)) / (2 * h);
}

/* ══════════════════════════════════════════════════════
   Parser de funções de cálculo especiais
   Suporta:
     integrate(expr, var, a, b)
     derivative(expr, var, a)
   ══════════════════════════════════════════════════════ */
const INTEGRATE_RE = /^integrate\s*\(\s*(.+?)\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*(.+?)\s*,\s*(.+?)\s*\)$/i;
const DERIVATIVE_RE = /^derivative\s*\(\s*(.+?)\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,\s*(.+?)\s*\)$/i;

function resolveValue(str: string, variables: Record<string, number>): number {
  const trimmed = str.trim();
  // Tenta como variável conhecida
  if (trimmed in variables) return variables[trimmed];
  // Tenta avaliar como expressão mathjs simples
  try {
    const result = evaluate(trimmed, { ...variables, pi: Math.PI, e: Math.E });
    return typeof result === "number" ? result : Number(result);
  } catch {
    throw new Error(`Não foi possível resolver o valor: "${trimmed}"`);
  }
}

function tryCalculusExpression(
  expression: string,
  variables: Record<string, number>
): number | null {
  const trimmed = expression.trim();

  // integrate(expr, var, a, b)
  const intMatch = trimmed.match(INTEGRATE_RE);
  if (intMatch) {
    const [, integrand, variable, aStr, bStr] = intMatch;
    const a = resolveValue(aStr, variables);
    const b = resolveValue(bStr, variables);
    return numericalIntegrate(integrand, variable, a, b);
  }

  // derivative(expr, var, a)
  const derMatch = trimmed.match(DERIVATIVE_RE);
  if (derMatch) {
    const [, expr, variable, aStr] = derMatch;
    const a = resolveValue(aStr, variables);
    return numericalDerivative(expr, variable, a);
  }

  return null;
}

/* ══════════════════════════════════════════════════════
   Exportação principal
   1. Tenta expressões de cálculo (integrate/derivative)
   2. Tenta evaluate() padrão do mathjs
   ══════════════════════════════════════════════════════ */
export function computeFormula(
  expression: string,
  variables: Record<string, number>
): number {
  // Tenta cálculo (integração / derivada numérica) antes do mathjs padrão
  const calculusResult = tryCalculusExpression(expression, variables);
  if (calculusResult !== null) {
    if (!isFinite(calculusResult)) {
      throw new Error(
        "O resultado do cálculo é inválido (possível singularidade ou divisão por zero)."
      );
    }
    return calculusResult;
  }

  // Fluxo padrão: mathjs evaluate
  let rawResult: unknown;
  try {
    rawResult = evaluate(expression, { ...variables, pi: Math.PI, e: Math.E });
  } catch (err: any) {
    throw new Error(
      `Erro ao avaliar a fórmula: ${err?.message ?? "expressão inválida"}. Verifique os valores informados.`
    );
  }

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
