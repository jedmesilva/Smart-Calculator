import { evaluate, compile, det, inv, transpose, matrix, multiply } from "mathjs";

/* ══════════════════════════════════════════════════════
   Helpers: compilar e avaliar uma expressão com escopo
   ══════════════════════════════════════════════════════ */
function makeScope(extra: Record<string, number> = {}): Record<string, number> {
  return { pi: Math.PI, e: Math.E, ...extra };
}

function evalExpr(compiled: any, scope: Record<string, number>): number {
  const res = compiled.evaluate(scope);
  const n = typeof res?.toNumber === "function" ? res.toNumber() : Number(res);
  return n;
}

/* ══════════════════════════════════════════════════════
   1. INTEGRAÇÃO NUMÉRICA — Regra de Simpson (1000 passos)
      integrate(expr, var, a, b)
   ══════════════════════════════════════════════════════ */
function numericalIntegrate(
  exprStr: string,
  variable: string,
  a: number,
  b: number,
  steps = 1000
): number {
  const compiled = compile(exprStr);
  const n = steps % 2 === 0 ? steps : steps + 1;
  const h = (b - a) / n;
  const f = (x: number) => evalExpr(compiled, makeScope({ [variable]: x }));

  let sum = f(a) + f(b);
  for (let i = 1; i < n; i++) {
    sum += (i % 2 === 0 ? 2 : 4) * f(a + i * h);
  }
  return (h / 3) * sum;
}

/* ══════════════════════════════════════════════════════
   2. DERIVADA NUMÉRICA — Diferença Central de 5 pontos
      derivative(expr, var, a)
   ══════════════════════════════════════════════════════ */
function numericalDerivative(
  exprStr: string,
  variable: string,
  a: number,
  h = 1e-5
): number {
  const compiled = compile(exprStr);
  const f = (x: number) => evalExpr(compiled, makeScope({ [variable]: x }));
  // Fórmula de 5 pontos — mais precisa que diferença central simples
  return (-f(a + 2 * h) + 8 * f(a + h) - 8 * f(a - h) + f(a - 2 * h)) / (12 * h);
}

/* ══════════════════════════════════════════════════════
   3. SOMATÓRIO — iteração discreta
      summation(expr, var, start, end)
      Ex: summation(k^2, k, 1, 10) = 385
   ══════════════════════════════════════════════════════ */
function numericalSummation(
  exprStr: string,
  variable: string,
  start: number,
  end: number
): number {
  const compiled = compile(exprStr);
  // Arredonda limites para inteiros (somatórios são discretos)
  const iStart = Math.round(start);
  const iEnd = Math.round(end);
  if (iEnd - iStart > 1_000_000) {
    throw new Error("Intervalo de somatório muito grande (máx 1.000.000 termos).");
  }
  let total = 0;
  for (let i = iStart; i <= iEnd; i++) {
    total += evalExpr(compiled, makeScope({ [variable]: i }));
  }
  return total;
}

/* ══════════════════════════════════════════════════════
   4. LIMITE NUMÉRICO — aproximação bilateral
      limit(expr, var, a)
      limit(expr, var, a, "left")   → apenas pela esquerda
      limit(expr, var, a, "right")  → apenas pela direita
   ══════════════════════════════════════════════════════ */
function numericalLimit(
  exprStr: string,
  variable: string,
  a: number,
  direction: "both" | "left" | "right" = "both"
): number {
  const compiled = compile(exprStr);
  const f = (x: number) => evalExpr(compiled, makeScope({ [variable]: x }));

  const epsilons = [1e-6, 1e-7, 1e-8, 1e-9];

  let leftVal: number | null = null;
  let rightVal: number | null = null;

  for (const eps of epsilons) {
    try {
      if (direction !== "right") leftVal = f(a - eps);
      if (direction !== "left") rightVal = f(a + eps);
      break;
    } catch {
      continue;
    }
  }

  if (direction === "left") {
    if (leftVal === null || !isFinite(leftVal)) {
      throw new Error("Limite pela esquerda não existe ou é indeterminado.");
    }
    return leftVal;
  }
  if (direction === "right") {
    if (rightVal === null || !isFinite(rightVal)) {
      throw new Error("Limite pela direita não existe ou é indeterminado.");
    }
    return rightVal;
  }

  // Verifica se os dois lados concordam (tolerância relativa de 0.01%)
  if (
    leftVal !== null && rightVal !== null &&
    isFinite(leftVal) && isFinite(rightVal)
  ) {
    const avg = (leftVal + rightVal) / 2;
    const tol = avg !== 0 ? Math.abs((leftVal - rightVal) / avg) : Math.abs(leftVal - rightVal);
    if (tol < 1e-4) return avg;
    throw new Error(
      `Limite não existe: limite pela esquerda (${leftVal.toPrecision(6)}) e pela direita (${rightVal.toPrecision(6)}) diferem.`
    );
  }

  throw new Error("Não foi possível calcular o limite numericamente.");
}

/* ══════════════════════════════════════════════════════
   5. PRODUTO — iteração discreta (análogo ao somatório)
      product(expr, var, start, end)
      Ex: product(k, k, 1, 5) = 120 (= 5!)
   ══════════════════════════════════════════════════════ */
function numericalProduct(
  exprStr: string,
  variable: string,
  start: number,
  end: number
): number {
  const compiled = compile(exprStr);
  const iStart = Math.round(start);
  const iEnd = Math.round(end);
  if (iEnd - iStart > 100_000) {
    throw new Error("Intervalo de produto muito grande (máx 100.000 termos).");
  }
  let total = 1;
  for (let i = iStart; i <= iEnd; i++) {
    total *= evalExpr(compiled, makeScope({ [variable]: i }));
  }
  return total;
}

/* ══════════════════════════════════════════════════════
   Parser de funções especiais
   Formato geral: funcao(arg1, arg2, ...)
   Suporta:
     integrate(expr, var, a, b)
     derivative(expr, var, a)
     summation(expr, var, start, end)
     limit(expr, var, a)
     limit(expr, var, a, "left"|"right")
     product(expr, var, start, end)
   ══════════════════════════════════════════════════════ */

/**
 * Extrai os argumentos de uma chamada de função especial,
 * respeitando parênteses aninhados.
 * Ex: "integrate(sin(x), x, 0, pi)" → ["sin(x)", "x", "0", "pi"]
 */
function extractArgs(argsStr: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of argsStr) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

const SPECIAL_FN_RE = /^(integrate|derivative|summation|limit|product)\s*\((.+)\)$/is;

function resolveValue(str: string, variables: Record<string, number>): number {
  const trimmed = str.trim().replace(/^["']|["']$/g, ""); // remove aspas se houver
  if (trimmed in variables) return variables[trimmed];
  try {
    const result = evaluate(trimmed, makeScope(variables));
    return typeof result?.toNumber === "function" ? result.toNumber() : Number(result);
  } catch {
    throw new Error(`Não foi possível resolver o valor: "${trimmed}"`);
  }
}

function trySpecialExpression(
  expression: string,
  variables: Record<string, number>
): number | null {
  const trimmed = expression.trim();
  const match = trimmed.match(SPECIAL_FN_RE);
  if (!match) return null;

  const fn = match[1].toLowerCase();
  const args = extractArgs(match[2]);

  switch (fn) {
    case "integrate": {
      if (args.length < 4) throw new Error(`integrate() requer 4 argumentos: integrate(expr, var, a, b). Recebidos: ${args.length}`);
      const [exprStr, variable, aStr, bStr] = args;
      return numericalIntegrate(exprStr, variable, resolveValue(aStr, variables), resolveValue(bStr, variables));
    }
    case "derivative": {
      if (args.length < 3) throw new Error(`derivative() requer 3 argumentos: derivative(expr, var, a). Recebidos: ${args.length}`);
      const [exprStr, variable, aStr] = args;
      return numericalDerivative(exprStr, variable, resolveValue(aStr, variables));
    }
    case "summation": {
      if (args.length < 4) throw new Error(`summation() requer 4 argumentos: summation(expr, var, start, end). Recebidos: ${args.length}`);
      const [exprStr, variable, startStr, endStr] = args;
      return numericalSummation(exprStr, variable, resolveValue(startStr, variables), resolveValue(endStr, variables));
    }
    case "limit": {
      if (args.length < 3) throw new Error(`limit() requer ao menos 3 argumentos: limit(expr, var, a). Recebidos: ${args.length}`);
      const [exprStr, variable, aStr] = args;
      const direction = args[3]?.replace(/["']/g, "").toLowerCase() as "left" | "right" | "both" | undefined;
      const validDir = direction === "left" || direction === "right" ? direction : "both";
      return numericalLimit(exprStr, variable, resolveValue(aStr, variables), validDir);
    }
    case "product": {
      if (args.length < 4) throw new Error(`product() requer 4 argumentos: product(expr, var, start, end). Recebidos: ${args.length}`);
      const [exprStr, variable, startStr, endStr] = args;
      return numericalProduct(exprStr, variable, resolveValue(startStr, variables), resolveValue(endStr, variables));
    }
    default:
      return null;
  }
}

/* ══════════════════════════════════════════════════════
   Exportação principal
   Ordem de tentativas:
   1. Funções especiais (integrate, derivative, summation, limit, product)
   2. MathJS evaluate() padrão (cobre: matrizes, raízes aninhadas,
      frações aninhadas, expoentes em cadeia, trigonometria, etc.)
   ══════════════════════════════════════════════════════ */
export function computeFormula(
  expression: string,
  variables: Record<string, number>
): number {
  // 1. Tenta funções especiais de cálculo
  const specialResult = trySpecialExpression(expression, variables);
  if (specialResult !== null) {
    if (!isFinite(specialResult)) {
      throw new Error(
        "O resultado do cálculo é inválido (possível singularidade ou divisão por zero)."
      );
    }
    return specialResult;
  }

  // 2. Fluxo padrão: mathjs evaluate (matrizes, raízes, expoentes, etc.)
  let rawResult: unknown;
  try {
    rawResult = evaluate(expression, makeScope(variables));
  } catch (err: any) {
    throw new Error(
      `Erro ao avaliar a fórmula: ${err?.message ?? "expressão inválida"}. Verifique os valores informados.`
    );
  }

  // Trata resultado de matriz: det/trace/norm já retornam escalar,
  // mas se vier uma Matrix tentamos extrair o único elemento
  if (rawResult != null && typeof (rawResult as any).toArray === "function") {
    const arr = (rawResult as any).toArray();
    if (arr.length === 1 && !Array.isArray(arr[0])) {
      // Matrix 1×1
      const num = Number(arr[0]);
      if (isFinite(num)) return num;
    }
    throw new Error(
      "O resultado é uma matriz. Use det(), trace() ou norm() para obter um valor escalar."
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
