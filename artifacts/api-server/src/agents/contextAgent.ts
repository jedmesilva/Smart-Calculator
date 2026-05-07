/* ═══════════════════════════════════════════════════════
   Agente de Contexto — Fase 1a
   Extrai TODOS os valores numéricos mencionados na conversa,
   sem precisar conhecer a fórmula antecipadamente.
   Isso permite rodar em paralelo com o Agente de Fórmula.
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";
import type { ConversationMessage, ContextAgentResult, RawEntity } from "./types";

const CONTEXT_EXTRACT_PROMPT = `Você é um extrator de entidades numéricas para uma calculadora inteligente.
Leia a conversa e extraia TODOS os valores numéricos, quantidades e medidas mencionados.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Formato de resposta:
{
  "entities": [
    { "label": "capital inicial", "value": 1000, "humanReadable": "R$ 1.000", "unit": "R$" },
    { "label": "taxa de juros", "value": 0.01, "humanReadable": "1% ao mês", "unit": "%/mês" },
    { "label": "número de períodos", "value": 12, "humanReadable": "12 meses", "unit": "meses" }
  ]
}

Regras de conversão:
- Percentuais SEMPRE em decimal: "10%" → 0.1, "1,5% ao mês" → 0.015
- EXCETO quando claramente um número inteiro percentual (ex: "desconto de 15" para fórmula d/100): value = 15
- Moeda → número puro: "R$ 1.000" → 1000, "5 mil reais" → 5000
- Vírgula decimal pt-BR: "1,75" → 1.75
- "meia hora" → 0.5, "duas horas e meia" → 2.5
- Peso em kg se não especificado: "70 quilos" → 70
- Altura em metros se possível: "1 metro e 75" → 1.75, "175 cm" → 175 (unit: "cm")
- Se o valor é negativo (desconto, prejuízo), use valor negativo
- "label": nome descritivo do que esse valor representa, em português
- "humanReadable": como o usuário escreveu, formatado claramente
- Se não houver nenhum valor numérico na conversa, retorne { "entities": [] }
- Extraia valores de TODAS as mensagens da conversa, não só a última`;

function parseJson(raw: string): any {
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
  } catch (err) {
    logger.warn({ raw }, "contextAgent: JSON parse failed, returning empty");
    return { entities: [] };
  }
}

export async function runContextAgent(
  query: string,
  context: ConversationMessage[]
): Promise<ContextAgentResult> {
  const messages: any[] = [
    { role: "system", content: CONTEXT_EXTRACT_PROMPT },
    ...context.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: query },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 512,
      messages,
    } as any);

    const parsed = parseJson(response.choices[0]?.message?.content ?? "");
    const entities: RawEntity[] = (parsed.entities ?? []).map((e: any) => ({
      label: String(e.label ?? ""),
      value: Number(e.value ?? 0),
      humanReadable: String(e.humanReadable ?? e.value ?? ""),
      unit: String(e.unit ?? ""),
    }));

    logger.debug({ entityCount: entities.length }, "contextAgent: extracted entities");
    return { entities, rawText: query };
  } catch (err) {
    logger.warn({ err }, "contextAgent: failed, returning empty");
    return { entities: [], rawText: query };
  }
}
