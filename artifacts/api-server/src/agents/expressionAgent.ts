/* ═══════════════════════════════════════════════════════
   Agente de Expressão — Fase 2
   Recebe a fórmula (Fase 1b) + valores extraídos (Fase 1a),
   mapeia os valores às variáveis e monta/valida a expressão MathJS.
   Loop interno: máx 3 tentativas; busca web como fallback.
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { evaluate } from "mathjs";
import { logger } from "../lib/logger";
import type {
  ConversationMessage,
  ContextAgentResult,
  ExpressionResult,
  FormulaInfo,
  MissingVar,
  RawEntity,
} from "./types";

/* ─── Prompts ─── */
const MAP_AND_BUILD_PROMPT = `Você é um especialista em construção de expressões matemáticas.
Dado uma fórmula e uma lista de valores extraídos da conversa, mapeie os valores às variáveis da fórmula e construa a expressão MathJS.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Formato de resposta quando todos os valores estão presentes:
{
  "allPresent": true,
  "expression": "C * (1 + i)^n",
  "solveFor": "M",
  "extracted": { "C": 1000, "i": 0.01, "n": 12 },
  "variableNames": { "C": "Capital inicial", "i": "Taxa de juros", "n": "Número de períodos", "M": "Montante" },
  "variableValues": { "C": "R$ 1.000", "i": "1% ao mês", "n": "12 meses" },
  "resultUnit": "R$",
  "resultLabel": "montante final",
  "formulaSubstituted": "M = 1.000 × (1 + 0,01)¹²",
  "missing": []
}

Formato quando faltam valores:
{
  "allPresent": false,
  "missing": [
    { "symbol": "n", "name": "Número de períodos", "description": "Quantos meses ou anos de aplicação?" }
  ],
  "expression": "C * (1 + i)^n",
  "solveFor": "M",
  "extracted": { "C": 1000, "i": 0.01 },
  "variableNames": {},
  "variableValues": { "C": "R$ 1.000", "i": "1% ao mês" },
  "resultUnit": "R$",
  "resultLabel": "montante final",
  "formulaSubstituted": ""
}

Regras críticas:
- "expression": RHS da igualdade em sintaxe mathjs (*, ^, sqrt, log, abs, pi, e)
- Se a fórmula tem expressão armazenada, USE-A exatamente (não invente outra)
- Mapeie valores da lista pelo SIGNIFICADO (label), não pela posição
- Percentuais já devem estar em decimal (0.01 para 1%) — não converta novamente
- "formulaSubstituted": notação pt-BR com valores reais, × para multiplicação, expoentes sobrescritos
- "missing": somente variáveis realmente ausentes da conversa inteira
- REGRA ABSOLUTA DE CONSISTÊNCIA: todo símbolo que aparece em "expression" DEVE estar em "extracted"
  com um valor numérico. Se precisar de um valor derivado (ex: preço por item = total/qtd),
  calcule-o INLINE na expressão (ex: use "(50/10) * 3" e não "preco_por_item * 3").
  Jamais use um nome de variável em "expression" que não esteja em "extracted".
- Para problemas multi-etapa, componha uma única expressão inline com todos os valores numéricos
  literais necessários. Exemplo: troco = total - (total/qtd_total) * qtd_comprada
  → expression: "50 - (50/10) * 3", extracted: {}, allPresent: true
- REGRA CRÍTICA PARA VARIÁVEIS: "variableValues" DEVE sempre conter os valores fornecidos pelo usuário
  em formato legível (pt-BR), MESMO quando "extracted" estiver vazio por causa de expressão inline.
  Exemplo inline: se o usuário disse "total R$50, 10 itens, comprou 3":
  variableValues: { "total": "R$ 50", "itens": "10", "comprados": "3" }
  variableNames: { "total": "Valor total", "itens": "Quantidade total", "comprados": "Itens comprados" }
  Isso garante que o usuário veja as variáveis na visualização do cálculo.

══════════════════════════════════════════════════════
FUNÇÕES ESPECIAIS DE CÁLCULO AVANÇADO
══════════════════════════════════════════════════════
O sistema tem um motor de cálculo avançado com 5 funções especiais.
Use-as SEMPRE que o pedido envolver cálculo diferencial/integral/discreto.

1. INTEGRAL DEFINIDA: integrate(f, x, a, b)
   - f: expressão do integrando em sintaxe mathjs
   - x: variável de integração
   - a, b: limites inferior e superior (números, "pi", "e" são válidos)
   Exemplos:
   • ∫sin(x)dx de 0 a π     → "integrate(sin(x), x, 0, pi)"
   • ∫x²dx de 1 a 3         → "integrate(x^2, x, 1, 3)"
   • ∫eˣdx de 0 a 1         → "integrate(exp(x), x, 0, 1)"
   • ∫(1/x)dx de 1 a e      → "integrate(1/x, x, 1, e)"
   • ∫√(1-x²)dx de -1 a 1  → "integrate(sqrt(1-x^2), x, -1, 1)"
   extracted: {}, allPresent: true

2. DERIVADA EM UM PONTO: derivative(f, x, a)
   - f: expressão da função, x: variável, a: ponto
   Exemplos:
   • d/dx[sin(x)] em x=0   → "derivative(sin(x), x, 0)"
   • d/dx[x³] em x=2       → "derivative(x^3, x, 2)"
   • d/dx[ln(x)] em x=1    → "derivative(log(x), x, 1)"
   extracted: {}, allPresent: true

3. SOMATÓRIO (Σ): summation(f, k, start, end)
   - f: termo geral, k: índice (inteiro), start/end: limites do somatório
   Exemplos:
   • Σᵢ₌₁¹⁰ i²              → "summation(k^2, k, 1, 10)"
   • Σₙ₌₀⁵ (1/2)^n          → "summation((1/2)^n, n, 0, 5)"
   • Σₖ₌₁¹⁰⁰ (1/k)          → "summation(1/k, k, 1, 100)"
   • Σₙ₌₁²⁰ n               → "summation(n, n, 1, 20)"
   extracted: {}, allPresent: true

4. LIMITE: limit(f, x, a)  ou  limit(f, x, a, "left"|"right")
   - f: expressão, x: variável, a: ponto de aproximação
   Exemplos:
   • lim x→0 sin(x)/x      → "limit(sin(x)/x, x, 0)"
   • lim x→∞ (1/x)         → "limit(1/x, x, 1e15)"  ← use valor grande para ∞
   • lim x→0⁺ ln(x)        → "limit(log(x), x, 0, \"right\")"
   • lim x→2 (x²-4)/(x-2) → "limit((x^2-4)/(x-2), x, 2)"
   extracted: {}, allPresent: true

5. PRODUTO (∏): product(f, k, start, end)
   - f: fator geral, k: índice (inteiro), start/end: limites
   Exemplos:
   • 5! = ∏ₖ₌₁⁵ k          → "product(k, k, 1, 5)"
   • ∏ₖ₌₁⁴ (2k)            → "product(2*k, k, 1, 4)"
   extracted: {}, allPresent: true

══════════════════════════════════════════════════════
OPERAÇÕES QUE MATHJS JÁ SUPORTA NATIVAMENTE (sem função especial)
══════════════════════════════════════════════════════
Estas operações funcionam diretamente com evaluate() — NÃO use funções especiais:

• Raízes aninhadas:    sqrt(2 + sqrt(3 + sqrt(5)))
• Expoentes em cadeia: 2^(3^(4^2))  ← use parênteses para deixar explícita a associação
• Frações aninhadas:   1/(1 + 1/(2 + 1/(3 + 1/4)))
• Trigonometria:       sin, cos, tan, asin, acos, atan, atan2, sinh, cosh, tanh
• Logaritmos:          log(x) = ln(x), log(x, 10) = log₁₀(x), log2(x) = log₂(x)
• Matrizes (det):      det([[a,b],[c,d]])  → use quando pede determinante de matriz
• Matrizes (trace):    trace([[a,b,0],[0,c,d],[e,0,f]])
• Matrizes (norm):     norm([a,b,c])  → magnitude de vetor
• Fatorial:            factorial(n)  ou  n!  (ex: factorial(10))
• Constantes:          pi = π, e = e (número de Euler)

Para matrizes 2×2: det([[a,b],[c,d]]) = a*d - b*c — SEMPRE use essa forma.
Para matrizes 3×3: det([[a,b,c],[d,e,f],[g,h,i]])

REGRA: Para det/trace/norm de matrizes, substitua os valores numéricos diretamente na expressão.
Exemplo: det([[2,3],[1,4]]) = det da matriz {{2,3},{1,4}} → expression: "det([[2,3],[1,4]])", extracted: {}

══════════════════════════════════════════════════════
QUANDO USAR CADA FUNÇÃO ESPECIAL
══════════════════════════════════════════════════════
- "integral de ... de ... a ..." / "∫..." / "área sob a curva"  → integrate()
- "derivada de ... em x=..." / "d/dx" / "inclinação em"         → derivative()
- "somatório de ... de ... até ..." / "Σ..." / "soma de k=1 a n" → summation()
- "limite de ... quando ... tende a ..."                         → limit()
- "produto de ... de ... até ..." / "∏..."                       → product()
- "fatorial de n"                                                → factorial(n)  ← mathjs nativo

Para funções especiais: "extracted" SEMPRE {} e "allPresent": true.
"formulaSubstituted" deve mostrar notação matemática pt-BR clara:
   integrate(sin(x),x,0,pi)  → "∫₀^π sin(x) dx"
   summation(k^2,k,1,10)     → "Σₖ₌₁¹⁰ k²"
   limit(sin(x)/x,x,0)       → "lim(x→0) sin(x)/x"
   product(k,k,1,5)          → "∏ₖ₌₁⁵ k = 5!"
   det([[2,3],[1,4]])         → "det|2 3; 1 4|"
══════════════════════════════════════════════════════`;

const BUILD_DYNAMIC_PROMPT = `Você é um especialista em matemática. Dado uma fórmula identificada e os valores extraídos, 
derive a expressão MathJS completa e mapeie os valores às variáveis.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Regras:
- "expression": RHS em sintaxe mathjs
- "solveFor": símbolo da variável a calcular
- "allPresent": true apenas se todos os símbolos de "expression" estão em "extracted"
- Percentuais em decimal, moeda em número puro
- "resultUnit": "R$" para dinheiro, "%" para taxas, unidade SI para física, "" sem unidade
- "formulaSubstituted": notação pt-BR com valores substituídos
- "missing": apenas variáveis realmente ausentes

${MAP_AND_BUILD_PROMPT.split("Regras críticas:")[1]}`;

const SEARCH_FALLBACK_PROMPT = `Você é um pesquisador especialista em fórmulas matemáticas, com acesso à internet.
A tentativa anterior de calcular falhou. Use a internet para encontrar a fórmula correta e os dados necessários.
Retorne a expressão mathjs correta e os valores mapeados no formato JSON especificado.

${MAP_AND_BUILD_PROMPT}`;

function parseJson(raw: string, ctx: string): any {
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
  } catch (err) {
    logger.error({ raw, err }, `expressionAgent[${ctx}]: JSON parse failed`);
    throw new Error(`Não foi possível montar a expressão matemática (tentativa ${ctx}).`);
  }
}

function validateExpressionSyntax(expression: string, extracted: Record<string, number>): void {
  // Funções especiais são validadas pelo formulaCompute — não pelo mathjs direto
  const trimmed = expression.trim().toLowerCase();
  if (
    trimmed.startsWith("integrate(") ||
    trimmed.startsWith("derivative(") ||
    trimmed.startsWith("summation(") ||
    trimmed.startsWith("limit(") ||
    trimmed.startsWith("product(")
  ) {
    return;
  }

  try {
    const result = evaluate(expression, { ...extracted, pi: Math.PI, e: Math.E });
    const num = typeof (result as any)?.toNumber === "function"
      ? (result as any).toNumber()
      : Number(result);
    if (!isFinite(num)) {
      throw new Error("Resultado inválido (divisão por zero ou infinito).");
    }
  } catch (err: any) {
    throw new Error(`Expressão inválida: ${err?.message ?? "erro de sintaxe"}`);
  }
}

/* ── Detecta se variáveis faltando são dados em tempo real (câmbio, preços, índices) ── */
function needsRealTimeData(missing: MissingVar[]): boolean {
  const realTimeKeywords = [
    "câmbio", "cotação", "cotacao", "taxa de câmbio", "taxa de cambio",
    "dólar", "dollar", "euro", "libra", "iene", "yen", "bitcoin", "btc",
    "cripto", "crypto", "ação", "bolsa", "selic", "inflação", "inflacao",
    "ipca", "igpm", "igp-m", "cdi", "moeda", "exchange rate", "conversão",
    "conversion", "preço atual", "valor atual", "price", "rate",
    "usd", "eur", "gbp", "jpy", "brl",
  ];
  return missing.some((v) => {
    const text = `${v.symbol ?? ""} ${v.name ?? ""} ${v.description ?? ""}`.toLowerCase();
    return realTimeKeywords.some((kw) => text.includes(kw));
  });
}

/* ── Busca dados em tempo real (câmbio, preços) via web search ── */
async function searchRealTimeValues(query: string, missing: MissingVar[]): Promise<string> {
  const missingDesc = missing
    .map((v) => `${v.name || v.symbol}${v.description ? `: ${v.description}` : ""}`)
    .join("; ");

  logger.info({ missingDesc }, "expressionAgent: searching real-time values via web");

  try {
    const response = await (openai as any).responses.create({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search_preview" }],
      input: [
        {
          role: "system",
          content: `Você é um assistente financeiro. O usuário precisa calcular: "${query}".
Encontre os valores numéricos ATUAIS para: ${missingDesc}.
Forneça os valores exatos de forma clara, por exemplo: "1 dólar = R$ 5,85" ou "taxa de câmbio USD/BRL: 5.85".
Inclua a fonte e a data/hora da cotação quando disponível.`,
        },
        {
          role: "user",
          content: `Preciso dos valores atuais para calcular: ${query}. Dados necessários: ${missingDesc}`,
        },
      ],
    });

    const text = response.output
      .filter((item: any) => item.type === "message")
      .flatMap((item: any) => item.content ?? [])
      .filter((c: any) => c.type === "output_text")
      .map((c: any) => c.text ?? "")
      .join("\n");

    logger.info({ textPreview: text.slice(0, 200) }, "expressionAgent: real-time search result");
    return text || "Busca não retornou resultados úteis.";
  } catch (err) {
    logger.warn({ err }, "expressionAgent: real-time web search failed");
    return "Busca na web indisponível.";
  }
}

/* ── Extração de contexto de busca via web (fallback de erro) ── */
async function runWebSearchForFormula(
  query: string,
  formulaName: string,
  errorContext: string
): Promise<string> {
  logger.info({ formulaName, errorContext }, "expressionAgent: running web search fallback");

  const searchQuery = `fórmula matemática ${formulaName} expressão MathJS cálculo ${query.slice(0, 100)}`;

  try {
    const response = await (openai as any).responses.create({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search_preview" }],
      input: [
        {
          role: "system",
          content: `Pesquise a fórmula matemática correta e retorne APENAS a expressão mathjs e informações sobre as variáveis. Contexto do erro: ${errorContext}`,
        },
        { role: "user", content: searchQuery },
      ],
    });

    const text = response.output
      .filter((item: any) => item.type === "message")
      .flatMap((item: any) => item.content ?? [])
      .filter((c: any) => c.type === "output_text")
      .map((c: any) => c.text ?? "")
      .join("\n");

    return text || "Busca não retornou resultados úteis.";
  } catch (err) {
    logger.warn({ err }, "expressionAgent: web search failed");
    return "Busca na web indisponível.";
  }
}

/* ── Fluxo para fórmula com expressão armazenada no DB ── */
async function buildFromStoredExpression(
  formula: FormulaInfo,
  entities: RawEntity[],
  query: string,
  context: ConversationMessage[],
  attempt: number,
  searchContext: string | null
): Promise<ExpressionResult> {
  const meta = formula.expression_meta!;
  const varList = meta.variables
    .map((v) => `  - ${v.symbol} (${v.name}): ${v.description}`)
    .join("\n");

  const entityList = entities
    .map((e) => `  - "${e.label}": ${e.value} (exibição: "${e.humanReadable}", unidade: "${e.unit}")`)
    .join("\n") || "  (nenhum valor extraído)";

  const systemContent = [
    MAP_AND_BUILD_PROMPT,
    searchContext ? `\nContexto adicional de busca:\n${searchContext}` : "",
  ].join("");

  const userContent = [
    `Fórmula: ${formula.name}`,
    `Expressão armazenada (USE EXATAMENTE): ${formula.expression}`,
    `Calcular: ${meta.solveFor}`,
    `Resultado esperado: ${meta.resultUnit || "sem unidade"} (${meta.resultLabel})`,
    `Variáveis da fórmula:\n${varList}`,
    `Expressão simbólica: ${formula.symbolic}`,
    `\nValores extraídos da conversa:\n${entityList}`,
    attempt > 1 ? `\nATENÇÃO: tentativa ${attempt} — mapeie com mais cuidado, verificando unidades e conversões.` : "",
  ].join("\n");

  const messages: any[] = [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
    ...context.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: `Pergunta original: ${query}` },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 768,
    messages,
  } as any);

  const parsed = parseJson(response.choices[0]?.message?.content ?? "", `stored-attempt-${attempt}`);

  const variableNames: Record<string, string> = {};
  for (const v of meta.variables) variableNames[v.symbol] = v.name;
  variableNames[meta.solveFor] = formula.name;

  return {
    expression: formula.expression!,
    solveFor: meta.solveFor,
    allPresent: parsed.allPresent ?? false,
    extracted: parsed.extracted ?? {},
    missing: parsed.missing ?? [],
    variableNames: { ...variableNames, ...parsed.variableNames },
    variableValues: parsed.variableValues ?? {},
    resultUnit: parsed.resultUnit ?? meta.resultUnit,
    resultLabel: parsed.resultLabel ?? meta.resultLabel,
    formulaSubstituted: parsed.formulaSubstituted ?? formula.symbolic,
    searchUsed: !!searchContext,
  };
}

/* ── Fluxo para fórmula sem expressão (dinâmica) ── */
async function buildDynamicExpression(
  formula: FormulaInfo,
  entities: RawEntity[],
  query: string,
  context: ConversationMessage[],
  attempt: number,
  searchContext: string | null
): Promise<ExpressionResult> {
  const entityList = entities
    .map((e) => `  - "${e.label}": ${e.value} (exibição: "${e.humanReadable}", unidade: "${e.unit}")`)
    .join("\n") || "  (nenhum valor extraído)";

  const systemContent = [
    BUILD_DYNAMIC_PROMPT,
    searchContext ? `\nContexto adicional de busca na internet:\n${searchContext}` : "",
  ].join("");

  const userContent = [
    `Fórmula identificada: ${formula.name}`,
    `Categoria: ${formula.category}`,
    `Descrição: ${formula.description}`,
    formula.symbolic ? `Expressão simbólica: ${formula.symbolic}` : "",
    `\nValores extraídos da conversa:\n${entityList}`,
    attempt > 1 ? `\nATENÇÃO: tentativa ${attempt}. Revise a expressão e o mapeamento de variáveis com cuidado.` : "",
  ].filter(Boolean).join("\n");

  const messages: any[] = [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
    ...context.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: `Pergunta original: ${query}` },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 1024,
    messages,
  } as any);

  const parsed = parseJson(response.choices[0]?.message?.content ?? "", `dynamic-attempt-${attempt}`);

  return {
    expression: parsed.expression ?? "",
    solveFor: parsed.solveFor ?? formula.name,
    allPresent: parsed.allPresent ?? false,
    extracted: parsed.extracted ?? {},
    missing: parsed.missing ?? [],
    variableNames: parsed.variableNames ?? {},
    variableValues: parsed.variableValues ?? {},
    resultUnit: parsed.resultUnit ?? "",
    resultLabel: parsed.resultLabel ?? formula.name.toLowerCase(),
    formulaSubstituted: parsed.formulaSubstituted ?? "",
    searchUsed: !!searchContext,
  };
}

/* ── Exportação principal — com loop de retry e busca em tempo real ── */
export async function runExpressionAgent(opts: {
  formula: FormulaInfo;
  contextResult: ContextAgentResult;
  query: string;
  context: ConversationMessage[];
  maxAttempts?: number;
}): Promise<ExpressionResult> {
  const { formula, contextResult, query, context, maxAttempts = 3 } = opts;
  const hasStoredExpression = !!(formula.expression && formula.expression_meta);

  let lastError: string | null = null;
  let searchContext: string | null = null;
  let realTimeSearchDone = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.info({ attempt, formulaName: formula.name, hasStoredExpression }, "expressionAgent: attempt");

    try {
      let result: ExpressionResult;

      if (hasStoredExpression) {
        result = await buildFromStoredExpression(
          formula, contextResult.entities, query, context, attempt, searchContext
        );
      } else {
        result = await buildDynamicExpression(
          formula, contextResult.entities, query, context, attempt, searchContext
        );
      }

      /* ── Variáveis faltando: verificar se são dados em tempo real ── */
      if (!result.allPresent) {
        const hasMissingVars = result.missing.length > 0;

        /* Se as variáveis faltando são dados de tempo real (câmbio, cotações, etc.)
           e ainda não buscamos, fazer busca web e tentar novamente */
        if (hasMissingVars && !realTimeSearchDone && needsRealTimeData(result.missing) && attempt < maxAttempts) {
          logger.info(
            { missing: result.missing.map((m) => m.name || m.symbol) },
            "expressionAgent: missing real-time data — triggering web search"
          );
          realTimeSearchDone = true;
          searchContext = await searchRealTimeValues(query, result.missing);
          continue;
        }

        return result;
      }

      /* ── Valida sintaxe da expressão com os valores extraídos ── */
      if (result.expression && Object.keys(result.extracted).length > 0) {
        validateExpressionSyntax(result.expression, result.extracted);
      }

      logger.info({ attempt, expression: result.expression }, "expressionAgent: success");
      return result;
    } catch (err: any) {
      lastError = err?.message ?? "Erro desconhecido";
      logger.warn({ attempt, lastError }, "expressionAgent: attempt failed");

      if (attempt < maxAttempts) {
        searchContext = await runWebSearchForFormula(query, formula.name, lastError);
        logger.info({ searchContext: searchContext.slice(0, 100) }, "expressionAgent: got search context");
      }
    }
  }

  throw new Error(
    `Não foi possível montar a expressão para "${formula.name}" após ${maxAttempts} tentativas. ${lastError ?? ""}`
  );
}
