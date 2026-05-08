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
  objetivo?: string | null;

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
   Helper: calcula sub-expressões intermediárias com mathjs
   para fornecer ao LLM valores concretos em cada etapa
   ═══════════════════════════════════════════════════════ */

function buildSubExpressionHints(
  expression: string,
  extracted: Record<string, number>,
  solveFor: string,
): string {
  try {
    const { evaluate } = require("mathjs") as typeof import("mathjs");
    const scope = { ...extracted };

    // Remove a variável sendo calculada do scope
    delete scope[solveFor];

    const hints: string[] = [];

    // Extrai sub-expressões candidatas via regex simples:
    // parênteses, potências, raízes, divisões, etc.
    const candidates = new Set<string>();

    // Grupos entre parênteses (depth=1)
    const parenRe = /\(([^()]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = parenRe.exec(expression)) !== null) {
      candidates.add(m[1].trim());
    }

    // Também extrai partes antes de "^" (base da potência)
    const powRe = /([a-zA-Z_][a-zA-Z0-9_]*|\([^)]+\)|\d+(?:\.\d+)?)\s*\^\s*([a-zA-Z_][a-zA-Z0-9_]*|\d+(?:\.\d+)?)/g;
    while ((m = powRe.exec(expression)) !== null) {
      candidates.add(`(${m[1].trim()})^(${m[2].trim()})`);
      candidates.add(m[1].trim());
    }

    // Avalia cada sub-expressão candidata
    for (const sub of candidates) {
      try {
        // Substitui símbolos de variáveis conhecidas
        const raw = evaluate(sub, scope);
        if (typeof raw === "number" && isFinite(raw)) {
          const fmt = new Intl.NumberFormat("pt-BR", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 6,
          }).format(raw);
          hints.push(`  ${sub} = ${fmt}`);
        }
      } catch {
        // ignora subexpressões que não conseguimos avaliar
      }
    }

    return hints.length > 0 ? hints.join("\n") : "";
  } catch {
    return "";
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

const DESENVOLV_SYSTEM = `Você é um professor de matemática que explica cálculos passo a passo para qualquer pessoa, incluindo leigos.
Retorne APENAS um objeto JSON válido, sem markdown, sem texto fora do JSON.

MISSÃO: Decompor o cálculo em TODAS as operações intermediárias, mostrando cada etapa com valores concretos e uma explicação humana do que está sendo feito e por quê. Uma pessoa sem conhecimento matemático deve conseguir acompanhar e verificar cada passo.

FORMATO:
{
  "interpretacao": "frase curta do significado prático do resultado (máx 15 palavras)",
  "passos": [
    {
      "ordem": 1,
      "tipo": "enunciado",
      "descricao": "Explicação em português do que este passo faz — sempre com os valores reais",
      "latex": "LaTeX KaTeX válido (ou null se desnecessário)",
      "justificativa": "obrigatório APENAS quando tipo=teorema: citar a regra/propriedade/teorema"
    }
  ]
}

TIPOS DE PASSO:
- enunciado: fórmula simbólica de partida
- substituicao: mostrar a fórmula com todos os símbolos trocados pelos valores numéricos reais
- resolucao: calcular UMA subexpressão intermediária, mostrando o resultado parcial numérico
- simplificacao: simplificar ou reorganizar sem novo cálculo
- teorema: invocar propriedade/regra matemática — justificativa OBRIGATÓRIA
- aplicacao: aplicar o teorema ao caso concreto
- resultado: passo final com o valor numérico completo — SEMPRE o último passo

══════════════════════════════════════
ROTEIRO DETALHADO — ÁLGEBRA (tipo_operacao = "algebra")
══════════════════════════════════════
Decomponha a expressão na ORDEM DE PRECEDÊNCIA MATEMÁTICA (parênteses → potências → multiplicação/divisão → adição/subtração).
Cada operação intermediária é UM passo separado, com seu resultado numérico.

EXEMPLO — Juros Compostos: M = C × (1 + i)^n, com C=5000, i=0,01, n=12:
  Passo 1 [enunciado]: Escrever a fórmula simbólica
    descricao: "Partimos da fórmula do montante em juros compostos"
    latex: "M = C \\times (1 + i)^{n}"
  Passo 2 [substituicao]: Substituir todos os valores
    descricao: "Substituímos o capital C = R$ 5.000, a taxa i = 0,01 e o número de períodos n = 12"
    latex: "M = 5000 \\times (1 + 0{,}01)^{12}"
  Passo 3 [resolucao]: Resolver a soma dentro dos parênteses
    descricao: "Calculamos a soma dentro dos parênteses: 1 + 0,01 = 1,01"
    latex: "M = 5000 \\times (1{,}01)^{12}"
  Passo 4 [resolucao]: Calcular a potência
    descricao: "Elevamos 1,01 à décima segunda potência: (1,01)^12 ≈ 1,1268"
    latex: "M = 5000 \\times 1{,}1268"
  Passo 5 [resolucao]: Multiplicar o capital pelo fator
    descricao: "Multiplicamos o capital inicial R$ 5.000 pelo fator de crescimento 1,1268"
    latex: "M = 5000 \\times 1{,}1268 = 5634{,}13"
  Passo 6 [resultado]: Resultado final
    descricao: "O montante final após 12 meses é R$ 5.634,13"
    latex: "M = 5{.}634{,}13\\;\\text{R\\$}"

EXEMPLO — Área do Círculo: A = π × r², com r=7:
  Passo 1 [enunciado]: "A = \\pi \\times r^{2}"
  Passo 2 [substituicao]: "A = \\pi \\times 7^{2}" (substituímos r=7)
  Passo 3 [resolucao]: "Calculamos 7² = 49" → "A = \\pi \\times 49"
  Passo 4 [resolucao]: "Multiplicamos π ≈ 3,1416 por 49" → "A = 3{,}1416 \\times 49 = 153{,}94"
  Passo 5 [resultado]: "A = 153{,}94\\;\\text{cm}^{2}"

══════════════════════════════════════
ROTEIRO — INTEGRAL DEFINIDA (tipo_operacao = "integral")
══════════════════════════════════════
  Passo 1 [enunciado]: Escrever \\int_a^b f(x)\\,dx
  Passo 2 [teorema]: Regra de integração aplicada (justificativa obrigatória)
  Passo 3 [aplicacao]: Calcular a primitiva F(x)
  Passo 4 [teorema]: Teorema Fundamental do Cálculo — justificativa: "TFC: \\int_a^b f = F(b) - F(a)"
  Passo 5 [substituicao]: Substituir os limites: F(b) - F(a) com valores reais
  Passo 6 [resolucao]: Calcular F(b), depois F(a), depois a diferença
  Passo 7 [resultado]: Valor final

ROTEIRO — DERIVADA (tipo_operacao = "derivada")
  Passo 1 [enunciado]: \\frac{d}{dx}[f(x)]
  Passo 2 [teorema]: Regra de derivação (potência, produto, cadeia...) com justificativa
  Passo 3 [aplicacao]: Aplicar a regra — calcular f'(x) simbolicamente
  Passo 4 [substituicao]: Substituir x = valor real
  Passo 5 [resolucao]: Calcular o valor numérico de f'(a)
  Passo 6 [resultado]: f'(a) = valor

ROTEIRO — SOMATÓRIO (tipo_operacao = "somatorio")
  Passo 1 [enunciado]: \\sum_{k=a}^{b} f(k)
  Passo 2 [teorema ou resolucao]: Fórmula fechada (se existir) ou expandir os primeiros termos
  Passo 3 [resolucao]: Calcular o valor da soma
  Passo 4 [resultado]: Valor final

══════════════════════════════════════
REGRAS OBRIGATÓRIAS
══════════════════════════════════════
1. NUNCA agrupe duas operações num só passo — cada operação matemática tem seu passo próprio
2. NUNCA escreva "Identificamos as variáveis" — isso não é passo matemático
3. NUNCA salte da fórmula simbólica direto para o resultado — sempre mostre os intermediários
4. A descrição de cada passo DEVE mencionar os valores numéricos concretos envolvidos
5. O passo "resultado" é OBRIGATÓRIO e SEMPRE o último
6. Use QUANTOS PASSOS FOREM NECESSÁRIOS para o cálculo — não há limite mínimo nem máximo. Um cálculo simples pode ter 3 passos; uma fórmula complexa pode ter 15. Você decide com base na complexidade real do cálculo.
7. LaTeX compatível com KaTeX (sem \\begin{equation}, sem align — apenas inline)
8. Decimais pt-BR no LaTeX: vírgula com chaves — ex: 1{,}5 ou 5{.}634{,}13
9. Separador de milhar: ponto com chaves — ex: 5{.}000 ou 1{.}126{,}83
10. Unidades no LaTeX: \\text{m}, \\text{kg}, \\text{R\\$}, \\text{cm}^2, \\text{anos}
11. justificativa: obrigatória quando tipo="teorema"; null em todos os outros tipos
12. interpretacao: frase curta e objetiva sobre o significado prático do resultado`;

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

  /* ── Monta dicas de sub-expressões para ajudar o LLM a decompor ── */
  const subExpressionHints = buildSubExpressionHints(expression, extracted, solveFor);

  const userContent = [
    `=== DADOS DO CÁLCULO ===`,
    `Fórmula: ${formulaName}`,
    `tipo_operacao: ${tipoOperacao}`,
    formulaSymbolic ? `Expressão simbólica: ${formulaSymbolic}` : "",
    formulaSubstituted ? `Expressão com valores substituídos: ${formulaSubstituted}` : "",
    `Expressão mathjs (para referência): ${expression}`,
    `Variável calculada: ${solveFor} = ${resultLabel}`,
    varDesc ? `Valores numéricos: ${varDesc}` : "",
    varValDesc ? `Valores como fornecidos pelo usuário: ${varValDesc}` : "",
    subExpressionHints ? `=== RESULTADOS INTERMEDIÁRIOS (calculados pelo servidor) ===\n${subExpressionHints}` : "",
    `=== RESULTADO FINAL ===`,
    `${solveFor} = ${resultWithUnit}`,
    ``,
    `=== INSTRUÇÃO ===`,
    `Trace o caminho completo de ${formulaSymbolic || expression} até ${solveFor} = ${resultWithUnit}.`,
    `Para cada operação na expressão (parênteses, potência, multiplicação, divisão, etc.), crie um passo "resolucao" mostrando o resultado parcial numérico.`,
    `Use os resultados intermediários acima para garantir precisão numérica em cada passo.`,
    `Quantidade de passos: decida você com base na complexidade real deste cálculo.`,
  ].filter(Boolean).join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 4000,
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
        latex: options.proof.latex ?? null,
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
