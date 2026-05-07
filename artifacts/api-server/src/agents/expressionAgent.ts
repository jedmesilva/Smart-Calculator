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
- "expression": RHS da igualdade em sintaxe mathjs (*, ^, sqrt, log, abs, PI, E)
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
  → expression: "50 - (50/10) * 3", extracted: {}, allPresent: true`;

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
  try {
    const result = evaluate(expression, extracted);
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

/* ── Extração de contexto de busca via web ── */
async function runWebSearchForFormula(
  query: string,
  formulaName: string,
  errorContext: string
): Promise<string> {
  logger.info({ formulaName, errorContext }, "expressionAgent: running web search fallback");

  const searchQuery = `fórmula matemática ${formulaName} expressão MathJS cálculo ${query.slice(0, 100)}`;

  try {
    const response = await (openai as any).responses.create({
      model: "gpt-5.1",
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

  // Merge com metadados armazenados (a expressão deve ser a do DB)
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

/* ── Exportação principal — com loop de retry ── */
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

      // Não valida sintaxe se variáveis estão faltando
      if (!result.allPresent) {
        return result;
      }

      // Valida sintaxe da expressão com os valores extraídos
      if (result.expression && Object.keys(result.extracted).length > 0) {
        validateExpressionSyntax(result.expression, result.extracted);
      }

      logger.info({ attempt, expression: result.expression }, "expressionAgent: success");
      return result;
    } catch (err: any) {
      lastError = err?.message ?? "Erro desconhecido";
      logger.warn({ attempt, lastError }, "expressionAgent: attempt failed");

      if (attempt < maxAttempts) {
        // Busca web para contexto adicional
        searchContext = await runWebSearchForFormula(query, formula.name, lastError);
        logger.info({ searchContext: searchContext.slice(0, 100) }, "expressionAgent: got search context");
      }
    }
  }

  throw new Error(
    `Não foi possível montar a expressão para "${formula.name}" após ${maxAttempts} tentativas. ${lastError ?? ""}`
  );
}
