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

const SYSTEM_PROMPT = `Você é um extrator de variáveis matemáticas para uma calculadora inteligente em português brasileiro.
Dado uma fórmula e uma conversa, extraia os valores das variáveis e prepare o cálculo.

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

Regras obrigatórias:
- "expression": apenas o lado direito da igualdade, em sintaxe mathjs (use *, ^, sqrt, log, abs, PI, etc)
- "solveFor": variável do lado esquerdo da igualdade (o que se quer calcular)
- "allPresent": true somente se TODOS os símbolos de "expression" estão presentes em "extracted"
- Percentuais → número decimal: "10%" = 0.1, "1,5%" = 0.015, "0,5% ao mês" = 0.005
- Valores monetários → número puro: "R$ 1.000" = 1000, "5 mil" = 5000, "1,5 milhão" = 1500000
- Tempo → use a mesma escala da taxa (se taxa mensal, n = meses; se anual, n = anos)
- Se a conversa tiver mensagens anteriores com valores, use-os para completar variáveis faltantes
- "formulaSubstituted": notação pt-BR com valores reais (vírgula decimal, × para multiplicação, expoentes sobrescritos)
- "resultUnit": "R$" para dinheiro, "%" para taxas como resultado, unidade SI para física, "" se sem unidade
- "missing": somente variáveis que realmente faltam; inclua description explicativa para o usuário`;

export async function extractVariables(
  formula: { name: string; description: string; symbolic: string },
  query: string,
  context: { role: string; content: string }[]
): Promise<ExtractedVars> {
  const messages: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
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

  const content = response.choices[0]?.message?.content ?? "";
  try {
    return JSON.parse(content.replace(/```json\n?|\n?```/g, "").trim()) as ExtractedVars;
  } catch (err) {
    logger.error({ content, err }, "varExtractor: JSON parse failed");
    throw new Error("Não foi possível interpretar os dados do cálculo. Tente reformular a pergunta.");
  }
}
