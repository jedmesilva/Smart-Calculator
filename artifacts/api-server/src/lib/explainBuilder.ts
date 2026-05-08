import { parse } from "mathjs";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { ExpressionResult, ValidationResult, FormulaExpressionMeta } from "../agents/types";
import { logger } from "./logger";

/* ═══════════════════════════════════════════════════════
   Schema Universal de Resultado
   ═══════════════════════════════════════════════════════ */

export type DesenvolvimentoStep = {
  ordem: number;
  descricao: string;
  latex: string | null;
  tipo: "enunciado" | "substituicao" | "simplificacao" | "teorema" | "aplicacao" | "resolucao" | "resultado";
  justificativa?: string | null;
};

export type ResultData = {
  formulaId?: string | null;
  searchUsed?: boolean;
  warning?: string | null;
  conversationalResponse: string;

  dominio: string;

  operacao: {
    tipo: string;
    nome_formal: string;
    referencia: string;
  };

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
    papel: string;
    descricao: string;
    valor: string;
    unidade: string;
  }[];

  desenvolvimento: DesenvolvimentoStep[];

  resultado: {
    valor: string;
    latex: string | null;
    unidade: string;
    interpretacao?: string | null;
  };

  prova: {
    tipo: "inversa" | "derivacao" | "substituicao" | "razoabilidade";
    descricao: string;
    latex: string | null;
    valido: boolean;
  };
};

/* ── Metadados de operação por tipo de expressão ── */
const OPERACAO_META: Record<string, { tipo: string; nome_formal: string; referencia: string }> = {
  integral:  { tipo: "integracao_definida",  nome_formal: "Integral de Riemann",    referencia: "Teorema Fundamental do Cálculo" },
  derivada:  { tipo: "derivacao",            nome_formal: "Derivada",               referencia: "Cálculo Diferencial" },
  limite:    { tipo: "limite",               nome_formal: "Limite",                 referencia: "Análise Real" },
  somatorio: { tipo: "somatorio",            nome_formal: "Somatório",              referencia: "Séries e Sequências" },
  produto:   { tipo: "produto_notacao",      nome_formal: "Produto",                referencia: "Séries e Sequências" },
  matriz:    { tipo: "algebra_linear",       nome_formal: "Operação Matricial",     referencia: "Álgebra Linear" },
  algebra:   { tipo: "algebra",              nome_formal: "Álgebra",                referencia: "Álgebra Elementar" },
};

/* ── Mapeamento categoria da fórmula → domínio matemático ── */
const CATEGORIA_TO_DOMINIO: Record<string, string> = {
  "Financeiro":    "aritmetica",
  "Financeira":    "aritmetica",
  "Física":        "fisica",
  "Fisica":        "fisica",
  "Geometria":     "geometria",
  "Estatística":   "estatistica",
  "Estatistica":   "estatistica",
  "Química":       "quimica",
  "Quimica":       "quimica",
  "Trigonometria": "analise",
  "Cálculo":       "analise",
  "Calculo":       "analise",
  "Álgebra":       "algebra",
  "Algebra":       "algebra",
};

/* ── Domínio base por tipo de operação (override por categoria se disponível) ── */
const DOMINIO_FROM_TIPO: Record<string, string> = {
  integral:  "analise",
  derivada:  "analise",
  limite:    "analise",
  somatorio: "algebra",
  produto:   "algebra",
  matriz:    "algebra_linear",
  algebra:   "algebra",
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

const DESENVOLV_SYSTEM = `Você é um motor matemático. Dado qualquer cálculo, retorne APENAS um objeto JSON válido, sem markdown.

FORMATO DE RETORNO:
{
  "interpretacao": "frase curta explicando o significado do resultado (ex: Área sob sin(x) de 0 a π)",
  "passos": [
    {
      "ordem": 1,
      "tipo": "enunciado",
      "descricao": "descrição em português do que este passo faz",
      "latex": "expressão LaTeX KaTeX (ou null)",
      "justificativa": "obrigatório quando tipo=teorema: citar o teorema ou regra usada"
    }
  ]
}

TIPOS DE PASSO:
- enunciado: escrever a expressão de partida (integral, derivada, fórmula, etc.)
- teorema: invocar propriedade, identidade, regra ou teorema matemático — justificativa obrigatória
- aplicacao: aplicar o teorema ao caso concreto
- substituicao: substituir valores numéricos
- simplificacao: simplificar ou reorganizar algebricamente
- resolucao: calcular subexpressão intermediária
- resultado: passo final com o valor numérico (SEMPRE o último, obrigatório)

══════════════════════════════════════
ROTEIRO POR TIPO DE OPERAÇÃO
══════════════════════════════════════

INTEGRAL DEFINIDA (tipo_operacao = "integral"):
1. Escrever \\int_a^b f(x)\\,dx  →  "enunciado"
2. Identificar e enunciar a regra de integração  →  "teorema" + justificativa
3. Calcular a primitiva F(x)  →  "aplicacao"
4. Enunciar o Teorema Fundamental do Cálculo  →  "teorema" + justificativa: "TFC: \\int_a^b f = F(b)-F(a)"
5. Substituir os limites  →  "substituicao"
6. Calcular F(b) − F(a)  →  "resultado"

DERIVADA EM UM PONTO (tipo_operacao = "derivada"):
1. Escrever \\frac{d}{dx}[f(x)]  →  "enunciado"
2. Enunciar a regra de derivação  →  "teorema" + justificativa
3. Calcular f'(x)  →  "aplicacao"
4. Substituir x = a  →  "substituicao"
5. Valor numérico  →  "resultado"

SOMATÓRIO (tipo_operacao = "somatorio"):
1. Escrever \\sum_{k=a}^{b} f(k)  →  "enunciado"
2. Fórmula fechada (se existir) ou expandir termos  →  "teorema" + justificativa (ou "resolucao")
3. Calcular cada termo / aplicar fórmula  →  "resolucao"
4. Somar → "resultado"

LIMITE (tipo_operacao = "limite"):
1. Escrever \\lim_{x \\to a} f(x)  →  "enunciado"
2. Substituição direta; se indeterminado, indicar forma (0/0, ∞/∞)  →  "resolucao"
3. Técnica aplicada (L'Hôpital, fatoração, identidade)  →  "teorema" + justificativa
4. Simplificar → "resultado"

PRODUTO / FATORIAL (tipo_operacao = "produto"):
1. Escrever \\prod_{k=a}^{b} f(k)  →  "enunciado"
2. Expandir fatores  →  "resolucao"
3. Calcular produto  →  "resultado"

ÁLGEBRA / FÓRMULAS (tipo_operacao = "algebra"):
1. Fórmula simbólica  →  "enunciado"
2. Invocar propriedade relevante (se houver)  →  "teorema" + justificativa
3. Substituir valores  →  "substituicao"
4. Resolver intermediários (raiz, potência, divisão)  →  "resolucao"
5. Resultado final  →  "resultado"

══════════════════════════════════════
REGRAS CRÍTICAS
══════════════════════════════════════
- PROIBIDO escrever "Identificamos as variáveis" — isso não é um passo matemático
- Nunca agrupe dois passos distintos em um
- O passo "resultado" é obrigatório e sempre o último
- Mínimo 3 passos, máximo 8
- LaTeX compatível com KaTeX (sem \\begin{equation}, inline apenas)
- Decimais pt-BR no LaTeX: {,} — ex: 1{,}5 (nunca 1.5)
- Unidades: \\text{m}, \\text{kg}, \\text{R\\$}, \\text{cm}^2
- justificativa é obrigatória quando tipo = "teorema"; null nos demais
- interpretacao: frase curta e objetiva (max 15 palavras)`;

export type DesenvolvimentoResult = {
  steps: DesenvolvimentoStep[];
  interpretacao: string | null;
};

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
}): Promise<DesenvolvimentoResult> {
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
      max_completion_tokens: 1800,
      messages: [
        { role: "system", content: DESENVOLV_SYSTEM },
        { role: "user", content: userContent },
      ],
    } as any);

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());

    const passos: any[] = Array.isArray(parsed) ? parsed : (parsed.passos ?? []);
    if (passos.length === 0) throw new Error("LLM returned empty steps");

    const interpretacao: string | null = typeof parsed.interpretacao === "string"
      ? parsed.interpretacao
      : null;

    return {
      interpretacao,
      steps: passos.map((step: any, idx: number) => ({
        ordem: step.ordem ?? idx + 1,
        descricao: step.descricao ?? "",
        latex: step.latex ?? null,
        tipo: step.tipo ?? "resolucao",
        justificativa: step.justificativa ?? null,
      })),
    };
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
): DesenvolvimentoResult {
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

    return { steps, interpretacao: null };
  }

  /* ── Álgebra: fallback com substituição explícita ── */
  if (formulaSymbolic) {
    steps.push({
      ordem: 1,
      descricao: `Fórmula: ${formulaSymbolic}`,
      latex: formulaSymbolic,
      tipo: "enunciado",
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

  return { steps, interpretacao: null };
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
    formulaMeta?: FormulaExpressionMeta | null;
    interpretacao?: string | null;
  } = {}
): Omit<ResultData, "conversationalResponse" | "desenvolvimento"> {
  const formatted = formatPtBR(computedValue, vars.resultUnit);

  /* ── Determina tipo de operação e preenche dominio + operacao ── */
  const tipoOp = detectExpressionType(vars.expression);
  const opMeta = OPERACAO_META[tipoOp] ?? OPERACAO_META.algebra;

  /* Categoria sobrescreve domínio base se mapeada */
  const catKey = options.formulaCategory ?? "";
  const dominio = CATEGORIA_TO_DOMINIO[catKey] ?? DOMINIO_FROM_TIPO[tipoOp] ?? "algebra";

  /* ── Monta mapa de papel a partir do formulaMeta ── */
  const papelMap: Record<string, string> = {};
  if (options.formulaMeta?.variables) {
    for (const v of options.formulaMeta.variables) {
      papelMap[v.symbol] = v.description || v.name;
    }
  }

  const allSymbols = new Set([
    ...Object.keys(vars.variableValues),
    ...Object.keys(vars.extracted),
  ]);

  const variaveis = [...allSymbols]
    .filter((sym) => sym !== vars.solveFor)
    .map((sym) => ({
      simbolo: sym,
      papel: papelMap[sym] ?? vars.variableNames[sym] ?? sym,
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

    dominio,

    operacao: {
      tipo: opMeta.tipo,
      nome_formal: opMeta.nome_formal,
      referencia: opMeta.referencia,
    },

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
      interpretacao: options.interpretacao ?? null,
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
