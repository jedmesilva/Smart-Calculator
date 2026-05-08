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
    const safeUnit = resultUnit.replace(/\$/g, "\\$");
    const unitPart = resultUnit && resultUnit !== "%" ? `\\;\\text{${safeUnit}}` : (resultUnit === "%" ? "\\%" : "");

    return `${solveFor} = ${tex} = ${formatted}${unitPart}`;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════
   Prompt para geração de passos de desenvolvimento via LLM
   ═══════════════════════════════════════════════════════ */

/** Detecta o tipo de operação a partir da expressão mathjs */
function detectExpressionType(expression: string): string {
  const e = expression.trim().toLowerCase();
  if (e.startsWith("integrate(")) return "integral";
  if (e.startsWith("derivative(")) return "derivada";
  if (e.startsWith("summation(")) return "somatorio";
  if (e.startsWith("limit(")) return "limite";
  if (e.startsWith("product(")) return "produto";
  if (e.startsWith("det(") || e.startsWith("trace(") || e.startsWith("norm(")) return "matriz";
  return "algebra";
}

const DESENVOLV_SYSTEM = `Você é um professor de matemática. Dado o cálculo, gere os passos do desenvolvimento matemático real — com raciocínio genuíno, não apenas substituição mecânica.

RETORNE APENAS um array JSON válido, sem markdown, sem texto adicional.

Formato de cada item:
{
  "ordem": 1,
  "descricao": "descrição em português do que foi feito",
  "latex": "expressão LaTeX KaTeX para esse passo (ou null)",
  "tipo": "teorema"
}

Tipos de passo:
- substituicao: substituir valores numéricos na expressão simbólica
- simplificacao: simplificar ou reorganizar algebricamente
- teorema: aplicar propriedade, identidade, regra ou teorema matemático
- resolucao: calcular uma operação ou subexpressão intermediária
- resultado: passo final com o resultado (SEMPRE o último, obrigatório)

══════════════════════════════════════
ROTEIRO POR TIPO DE OPERAÇÃO
══════════════════════════════════════

INTEGRAL DEFINIDA (tipo_operacao = "integral"):
1. Escrever a integral: \\int_a^b f(x)\\,dx  →  tipo "teorema"
2. Enunciar a regra de integração aplicada (primitiva imediata, partes, substituição u, etc.)  →  tipo "teorema"
3. Calcular a primitiva F(x) mostrando o processo  →  tipo "resolucao"
4. Aplicar o Teorema Fundamental do Cálculo: [F(x)]_a^b = F(b) - F(a)  →  tipo "teorema"
5. Calcular F(b) e F(a) com os valores numéricos  →  tipo "resolucao"
6. Computar F(b) - F(a) = resultado numérico  →  tipo "resultado"

DERIVADA EM UM PONTO (tipo_operacao = "derivada"):
1. Escrever a expressão: \\frac{d}{dx}[f(x)]  →  tipo "teorema"
2. Enunciar a regra de derivação (potência, cadeia, produto, quociente)  →  tipo "teorema"
3. Calcular f'(x) aplicando a regra passo a passo  →  tipo "resolucao"
4. Substituir o ponto x = a na derivada  →  tipo "substituicao"
5. Calcular o valor numérico  →  tipo "resultado"

SOMATÓRIO (tipo_operacao = "somatorio"):
1. Escrever o somatório \\sum_{k=a}^{b} f(k)  →  tipo "teorema"
2. Se houver fórmula fechada, enunciá-la; senão expandir os termos  →  tipo "teorema" ou "resolucao"
3. Calcular cada termo ou aplicar a fórmula  →  tipo "resolucao"
4. Somar todos os termos  →  tipo "resultado"

LIMITE (tipo_operacao = "limite"):
1. Escrever \\lim_{x \\to a} f(x)  →  tipo "teorema"
2. Tentar substituição direta; se indeterminado (0/0, ∞/∞), indicar a forma  →  tipo "resolucao"
3. Aplicar a técnica adequada (L'Hôpital, fatoração, identidade trigonométrica)  →  tipo "teorema"
4. Simplificar e calcular o limite  →  tipo "resultado"

PRODUTO / FATORIAL (tipo_operacao = "produto"):
1. Escrever \\prod_{k=a}^{b} f(k)  →  tipo "teorema"
2. Expandir os fatores explicitamente  →  tipo "resolucao"
3. Calcular o produto  →  tipo "resultado"

ÁLGEBRA / FÓRMULAS (tipo_operacao = "algebra"):
1. Apresentar a fórmula simbólica com LaTeX  →  tipo "teorema"
2. Substituir cada valor numérico na expressão  →  tipo "substituicao"
3. Resolver operações intermediárias (raiz, potência, divisão, etc.) uma por vez  →  tipo "resolucao"
4. Resultado final  →  tipo "resultado"

══════════════════════════════════════
REGRAS CRÍTICAS UNIVERSAIS
══════════════════════════════════════
- PROIBIDO escrever "Identificamos as variáveis" — isso não é um passo matemático
- Nunca pule etapas. Nunca agrupe dois passos distintos em um.
- O último passo SEMPRE tem tipo "resultado" com o valor numérico final
- Mínimo 3 passos, máximo 8 passos
- Use LaTeX compatível com KaTeX (sem \\begin{equation}, inline apenas)
- Decimais pt-BR no LaTeX: use {,} — ex: 1{,}5 (nunca 1.5)
- Inclua unidades quando relevante: \\text{m}, \\text{kg}, \\text{R\\$}, \\text{cm}^2
- latex pode ser null apenas se o passo for puramente textual sem expressão`;

export async function buildDesenvolvimento(opts: {
  formulaName: string;
  formulaSymbolic: string;
  formulaSubstituted: string;
  expression: string;
  extracted: Record<string, number>;
  variableNames: Record<string, string>;
  variableValues: Record<string, string>;
  solveFor: string;
  computedValue: number;
  resultUnit: string;
  resultLabel: string;
}): Promise<DesenvolvimentoStep[]> {
  const { formulaName, formulaSymbolic, formulaSubstituted, expression, extracted,
          variableNames, variableValues, solveFor, computedValue, resultUnit, resultLabel } = opts;

  const tipoOperacao = detectExpressionType(expression);

  const varDesc = Object.entries(extracted)
    .filter(([sym]) => sym !== solveFor)
    .map(([sym, val]) => {
      const display = variableValues[sym] ?? String(val);
      const name = variableNames[sym] ?? sym;
      return `${sym} = ${display} (${name})`;
    })
    .join(", ");

  const varValDesc = Object.entries(variableValues)
    .map(([sym, val]) => {
      const name = variableNames[sym] ?? sym;
      return `${sym} = ${val} (${name})`;
    })
    .join(", ");

  let displayValue = computedValue;
  if (resultUnit === "%") displayValue = computedValue * 100;
  const decimals = Number.isInteger(displayValue) ? 0 : 2;
  const formattedResult = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(displayValue);
  const resultWithUnit = `${formattedResult}${resultUnit && resultUnit !== "%" ? " " + resultUnit : resultUnit === "%" ? "%" : ""}`;

  const userContent = [
    `Fórmula: ${formulaName}`,
    `tipo_operacao: ${tipoOperacao}`,
    formulaSymbolic ? `Expressão simbólica: ${formulaSymbolic}` : "",
    formulaSubstituted ? `Notação matemática (com valores): ${formulaSubstituted}` : "",
    `Expressão mathjs usada: ${expression}`,
    `Variável calculada (solveFor): ${solveFor} = ${resultLabel}`,
    varDesc ? `Variáveis numéricas extraídas: ${varDesc}` : "",
    varValDesc ? `Valores fornecidos pelo usuário: ${varValDesc}` : "",
    `Resultado final: ${solveFor} = ${resultWithUnit}`,
  ].filter(Boolean).join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 1500,
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
    return buildFallbackDesenvolvimento(tipoOperacao, formulaSymbolic, formulaSubstituted,
      expression, extracted, variableNames, variableValues,
      solveFor, computedValue, resultUnit, resultLabel);
  }
}

/* ── Fallback determinístico caso o LLM falhe ── */
function buildFallbackDesenvolvimento(
  tipoOperacao: string,
  formulaSymbolic: string,
  formulaSubstituted: string,
  expression: string,
  extracted: Record<string, number>,
  variableNames: Record<string, string>,
  variableValues: Record<string, string>,
  solveFor: string,
  computedValue: number,
  resultUnit: string,
  resultLabel: string
): DesenvolvimentoStep[] {
  const steps: DesenvolvimentoStep[] = [];

  let displayValue = computedValue;
  if (resultUnit === "%") displayValue = computedValue * 100;
  const decimals = Number.isInteger(displayValue) ? 0 : 2;
  const formattedResult = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(displayValue);
  const safeUnit2 = resultUnit.replace(/\$/g, "\\$");
  const unitSuffix = resultUnit && resultUnit !== "%" ? `\\;\\text{${safeUnit2}}` : resultUnit === "%" ? "\\%" : "";

  /* ── Operações de cálculo avançado: fallback genérico porém informativo ── */
  if (tipoOperacao !== "algebra") {
    const notacao = formulaSubstituted || expression;

    const labelByType: Record<string, string> = {
      integral: "integral definida",
      derivada: "derivada no ponto",
      somatorio: "somatório",
      limite: "limite",
      produto: "produto",
      matriz: "operação matricial",
    };

    steps.push({
      ordem: 1,
      descricao: `Escrever a ${labelByType[tipoOperacao] ?? tipoOperacao}`,
      latex: notacao || null,
      tipo: "teorema",
    });

    steps.push({
      ordem: 2,
      descricao: `Calcular ${labelByType[tipoOperacao] ?? tipoOperacao} com o motor matemático`,
      latex: null,
      tipo: "resolucao",
    });

    steps.push({
      ordem: 3,
      descricao: `Resultado: ${resultLabel || solveFor} = ${formattedResult}${resultUnit ? " " + resultUnit : ""}`,
      latex: `${solveFor} = ${formattedResult.replace(",", "{,}")}${unitSuffix}`,
      tipo: "resultado",
    });

    return steps;
  }

  /* ── Álgebra: fallback com substituição explícita ── */
  if (formulaSymbolic) {
    steps.push({
      ordem: 1,
      descricao: `Fórmula: ${formulaSymbolic}`,
      latex: formulaSymbolic,
      tipo: "teorema",
    });
  }

  const inputVars = Object.entries(extracted).filter(([sym]) => sym !== solveFor);
  if (inputVars.length > 0) {
    steps.push({
      ordem: steps.length + 1,
      descricao: `Substituir os valores na fórmula`,
      latex: inputVars
        .map(([sym]) => {
          const val = extracted[sym];
          return `${sym} = ${String(val).replace(".", "{,}")}`;
        })
        .join(",\\quad "),
      tipo: "substituicao",
    });
  }

  steps.push({
    ordem: steps.length + 1,
    descricao: `Resultado: ${resultLabel || solveFor} = ${formattedResult}${resultUnit ? " " + resultUnit : ""}`,
    latex: `${solveFor} = ${formattedResult.replace(",", "{,}")}${unitSuffix}`,
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
