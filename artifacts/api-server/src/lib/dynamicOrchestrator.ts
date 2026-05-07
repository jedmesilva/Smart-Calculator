import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export type DynamicFormulaResult = {
  name: string;
  description: string;
  symbolic: string;
  category: string;
  expression: string;
  solveFor: string;
  allPresent: boolean;
  extracted: Record<string, number>;
  missing: { symbol: string; name: string; description: string }[];
  variableNames: Record<string, string>;
  variableValues: Record<string, string>;
  resultUnit: string;
  resultLabel: string;
  formulaSubstituted: string;
  searchUsed: boolean;
};

const SCHEMA_EXAMPLE = `{
  "name": "Juros Compostos",
  "description": "Calcula o montante acumulado com juros compostos",
  "symbolic": "M = C × (1 + i)ⁿ",
  "category": "Finanças",
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
}`;

const SHARED_RULES = `Regras:
- "expression": APENAS o lado direito da igualdade, sintaxe mathjs (use *, ^, sqrt, log, abs, PI, E)
- "solveFor": variável resultado (lado esquerdo da igualdade)
- "allPresent": true somente se TODOS os símbolos de "expression" estão em "extracted"
- Percentuais → decimal: "10%" = 0.1, "1,5%" = 0.015
- Moeda → número puro: "R$ 1.000" = 1000, "5 mil" = 5000
- "formulaSubstituted": notação pt-BR com valores reais, × para multiplicação, expoentes sobrescritos quando possível
- "resultUnit": "R$" para dinheiro, "%" se resultado é percentual, unidade SI para física, "" se adimensional
- "missing": somente variáveis que o usuário não forneceu, com description clara
- RETORNE APENAS JSON VÁLIDO — sem markdown, sem texto antes ou depois`;

const EXPERT_PROMPT = `Você é um especialista em matemática, física e finanças. Dado um problema em linguagem natural, identifique a fórmula canônica mais adequada, extraia todos os valores fornecidos e prepare o cálculo.

${SHARED_RULES}

Formato de resposta:
${SCHEMA_EXAMPLE}`;

const RESEARCHER_PROMPT = `Você é um pesquisador matemático. Use a busca na internet para encontrar e verificar a fórmula correta para o cálculo descrito. Priorize fontes confiáveis como livros-texto, Wikipedia e portais científicos. Em seguida, extraia os valores fornecidos na conversa.

${SHARED_RULES}

Formato de resposta:
${SCHEMA_EXAMPLE}`;

function extractTextAndSearchUsed(output: any[]): { text: string; searchUsed: boolean } {
  const searchUsed = output.some((item: any) => item.type === "web_search_call");
  const text = output
    .filter((item: any) => item.type === "message")
    .flatMap((msg: any) => (Array.isArray(msg.content) ? msg.content : []))
    .filter((c: any) => c.type === "output_text")
    .map((c: any) => c.text as string)
    .join("");
  return { text, searchUsed };
}

function parseAgentResponse(raw: string, searchUsed: boolean): DynamicFormulaResult {
  const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
  return { ...parsed, searchUsed };
}

async function runExpertAgent(
  query: string,
  context: { role: string; content: string }[]
): Promise<DynamicFormulaResult> {
  const messages: any[] = [
    { role: "system", content: EXPERT_PROMPT },
    ...context,
    { role: "user", content: query },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    temperature: 0,
    messages,
  } as any);

  const content = response.choices[0]?.message?.content ?? "";
  try {
    return parseAgentResponse(content, false);
  } catch (err) {
    logger.error({ content, err }, "expertAgent: JSON parse failed");
    throw new Error("expert_failed");
  }
}

async function runResearcherAgent(
  query: string,
  context: { role: string; content: string }[]
): Promise<DynamicFormulaResult> {
  const response = await (openai as any).responses.create({
    model: "gpt-5.1",
    max_output_tokens: 1024,
    tools: [{ type: "web_search_preview" }],
    input: [
      { role: "system", content: RESEARCHER_PROMPT },
      ...context,
      { role: "user", content: query },
    ],
  });

  const { text, searchUsed } = extractTextAndSearchUsed(response.output ?? []);
  try {
    return parseAgentResponse(text, searchUsed);
  } catch (err) {
    logger.error({ text, err }, "researcherAgent: JSON parse failed");
    throw new Error("researcher_failed");
  }
}

/**
 * Runs Expert and Researcher agents in parallel.
 * Reconciles both results: prefers expert but uses researcher data
 * when it completes missing variables that the expert couldn't fill.
 */
export async function runDynamicOrchestrator(
  query: string,
  context: { role: string; content: string }[]
): Promise<DynamicFormulaResult> {
  const [expertSettled, researcherSettled] = await Promise.allSettled([
    runExpertAgent(query, context),
    runResearcherAgent(query, context),
  ]);

  const expert =
    expertSettled.status === "fulfilled" ? expertSettled.value : null;
  const researcher =
    researcherSettled.status === "fulfilled" ? researcherSettled.value : null;

  if (!expert && !researcher) {
    throw new Error(
      "Não foi possível identificar a fórmula para este cálculo. Tente descrever com mais detalhes ou selecione uma fórmula na lista."
    );
  }

  // Only one succeeded → use it
  if (!expert) return researcher!;
  if (!researcher) return expert;

  const searchUsed = researcher.searchUsed;

  // Researcher completes what expert couldn't → use researcher result
  if (!expert.allPresent && researcher.allPresent) {
    logger.info("orchestrator: researcher completed missing variables — using researcher");
    return { ...researcher, searchUsed: true };
  }

  // Both complete → prefer expert (faster, no web latency), mark searchUsed
  if (expert.allPresent) {
    return { ...expert, searchUsed };
  }

  // Neither complete → return expert's needs_input (researcher's missing may be more detailed)
  // Merge missing arrays and deduplicate by symbol
  const mergedMissing = [
    ...expert.missing,
    ...researcher.missing.filter(
      (rm) => !expert.missing.some((em) => em.symbol === rm.symbol)
    ),
  ];
  return { ...expert, missing: mergedMissing, searchUsed };
}
