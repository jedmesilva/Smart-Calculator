import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export type MissingVar = {
  symbol: string;
  name: string;
  description: string;
};

export type ExtractedVars = {
  expression: string;
  solveFor: string;
  allPresent: boolean;
  extracted: Record<string, number>;
  missing: MissingVar[];
  variableNames: Record<string, string>;
  variableValues: Record<string, string>;
  resultUnit: string;
  resultLabel: string;
  formulaSubstituted: string;
};

/* ─── PROMPT: derive expression + extract values (fallback for formulas without stored expression) ─── */
const DERIVE_AND_EXTRACT_PROMPT = `Você é um extrator de variáveis matemáticas para uma calculadora inteligente em português brasileiro.
Dado uma fórmula e uma conversa, derive a expressão mathjs e extraia os valores das variáveis.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Formato de resposta:
{
  "expression": "C * (1 + i)^n",
  "solveFor": "M",
  "allPresent": true,
  "extracted": { "C": 1000, "i": 0.01, "n": 12 },
  "missing": [],
  "variableNames": { "C": "Capital inicial", "i": "Taxa mensal", "n": "Número de períodos", "M": "Montante" },
  "variableValues": { "C": "R$ 1.000", "i": "1% ao mês", "n": "12 meses" },
  "resultUnit": "R$",
  "resultLabel": "montante final",
  "formulaSubstituted": "M = 1.000 × (1 + 0,01)¹²"
}

Regras:
- "expression": apenas o lado direito da igualdade, sintaxe mathjs (use *, ^, sqrt, log, abs, PI, E)
- "solveFor": variável do lado esquerdo (o que se quer calcular)
- "allPresent": true somente se TODOS os símbolos de "expression" estão em "extracted"
- Percentuais → decimal: "10%" = 0.1, "1,5%" = 0.015
- Moeda → número puro: "R$ 1.000" = 1000, "5 mil" = 5000
- Use mensagens anteriores da conversa para completar variáveis faltantes
- "formulaSubstituted": notação pt-BR com valores reais, × para multiplicação, expoentes sobrescritos
- "resultUnit": "R$" para dinheiro, "%" para taxas como resultado, unidade SI para física, "" sem unidade
- "missing": somente variáveis que realmente faltam na conversa`;

/* ─── PROMPT: extract values only (for formulas with stored expression) ─── */
const EXTRACT_VALUES_PROMPT = `Você é um extrator de valores para uma calculadora inteligente em português brasileiro.
A expressão matemática já é conhecida. Sua tarefa é extrair os valores numéricos das variáveis da conversa.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Formato de resposta:
{
  "allPresent": true,
  "extracted": { "C": 1000, "i": 0.01, "n": 12 },
  "missing": [],
  "variableValues": { "C": "R$ 1.000", "i": "1% ao mês", "n": "12 meses" },
  "resultUnit": "R$",
  "resultLabel": "montante final",
  "formulaSubstituted": "M = 1.000 × (1 + 0,01)¹²"
}

Regras:
- "allPresent": true somente se TODOS os símbolos da expressão fornecida estão em "extracted"
- Percentuais → decimal: "10%" = 0.1, "1,5%" = 0.015, "0,5% ao mês" = 0.005
- Moeda → número puro: "R$ 1.000" = 1000, "5 mil" = 5000
- Para Regra de Três com d/100: d é o percentual inteiro (15% → d=15, NÃO 0.15)
- Use mensagens anteriores da conversa para completar variáveis faltantes
- "variableValues": exiba valores de forma legível (ex: "R$ 1.000", "1% ao mês")
- "formulaSubstituted": substitua os valores na expressão simbólica no formato pt-BR
- "missing": descrição clara do que falta para o usuário entender`;

function parseJson(raw: string, ctx: string): any {
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
  } catch (err) {
    logger.error({ raw, err }, `varExtractor[${ctx}]: JSON parse failed`);
    throw new Error("Não foi possível interpretar os dados do cálculo. Tente reformular a pergunta.");
  }
}

/**
 * Full extraction: AI derives the mathjs expression AND extracts variable values.
 * Used when formula has no stored expression (e.g., Média Aritmética).
 */
export async function extractVariables(
  formula: { name: string; description: string; symbolic: string },
  query: string,
  context: { role: string; content: string }[]
): Promise<ExtractedVars> {
  const messages: any[] = [
    { role: "system", content: DERIVE_AND_EXTRACT_PROMPT },
    {
      role: "user",
      content: `Fórmula: ${formula.name}\nDescrição: ${formula.description}\nExpressão simbólica: ${formula.symbolic}`,
    },
    ...context.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: query },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1024,
    temperature: 0,
    messages,
  } as any);

  return parseJson(response.choices[0]?.message?.content ?? "", "derive+extract");
}

/**
 * Lightweight extraction: formula expression is already known (stored in DB).
 * AI only extracts numeric values for each variable — simpler, cheaper, more accurate.
 */
export async function extractVarValues(
  formula: {
    name: string;
    symbolic: string;
    expression: string;
    solveFor: string;
    variables: { symbol: string; name: string; description: string }[];
    resultUnit: string;
    resultLabel: string;
  },
  query: string,
  context: { role: string; content: string }[]
): Promise<ExtractedVars> {
  const varList = formula.variables
    .map((v) => `  - ${v.symbol}: ${v.name} — ${v.description}`)
    .join("\n");

  const systemContext = [
    `Fórmula: ${formula.name}`,
    `Expressão (mathjs): ${formula.expression}`,
    `Calcular: ${formula.solveFor}`,
    `Resultado esperado: ${formula.resultUnit || "sem unidade"} (${formula.resultLabel})`,
    `Variáveis a extrair:\n${varList}`,
    `Expressão simbólica para substituição: ${formula.symbolic}`,
  ].join("\n");

  const messages: any[] = [
    { role: "system", content: EXTRACT_VALUES_PROMPT },
    { role: "user", content: systemContext },
    ...context.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: query },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 768,
    temperature: 0,
    messages,
  } as any);

  const partial = parseJson(response.choices[0]?.message?.content ?? "", "extract-values");

  // Merge stored metadata with AI output
  const variableNames: Record<string, string> = {};
  for (const v of formula.variables) variableNames[v.symbol] = v.name;
  variableNames[formula.solveFor] = formula.name;

  return {
    expression: formula.expression,
    solveFor: formula.solveFor,
    allPresent: partial.allPresent ?? false,
    extracted: partial.extracted ?? {},
    missing: partial.missing ?? [],
    variableNames,
    variableValues: partial.variableValues ?? {},
    resultUnit: partial.resultUnit ?? formula.resultUnit,
    resultLabel: partial.resultLabel ?? formula.resultLabel,
    formulaSubstituted: partial.formulaSubstituted ?? formula.symbolic,
  };
}
