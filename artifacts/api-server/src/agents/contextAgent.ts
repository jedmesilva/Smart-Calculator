/* ═══════════════════════════════════════════════════════
   Agente de Contexto — Fase 1a
   Extrai TODOS os valores numéricos mencionados na conversa,
   sem precisar conhecer a fórmula antecipadamente.
   Isso permite rodar em paralelo com o Agente de Fórmula.

   Se os valores parecem referir-se a contexto anterior
   não visível, retorna needsHistory: true para que o
   orquestrador busque o histórico completo no Supabase.
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";
import type { ConversationMessage, ContextAgentResult, RawEntity } from "./types";

const CONTEXT_EXTRACT_SYSTEM = `Você é Phormula, especialista em todas as estruturas matemáticas do universo.
Nesta etapa, sua função é extrair entidades numéricas da conversa com precisão máxima.
Leia a conversa e extraia TODOS os valores numéricos, quantidades e medidas mencionados — inclusive valores implícitos derivados de cálculos anteriores.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Formato de resposta:
{
  "entities": [
    { "label": "capital inicial", "value": 1000, "humanReadable": "R$ 1.000", "unit": "R$" },
    { "label": "taxa de juros", "value": 0.01, "humanReadable": "1% ao mês", "unit": "%/mês" },
    { "label": "número de períodos", "value": 12, "humanReadable": "12 meses", "unit": "meses" }
  ],
  "needsHistory": false
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
- Extraia valores de TODAS as mensagens da conversa, não só a última

IMPORTANTE — valores de resultados anteriores:
- Mensagens do assistente no formato "Resultado: X = Y | Valores usados: a=v1, b=v2 | Expressão: ..."
  contêm dados de cálculos anteriores — extraia esses valores também
- Derive valores intermediários quando possível:
  Ex: "Expressão: 50 - (50/10) * 3" → extraia também "preço por item = 5" (50/10)
  Ex: "Resultado: troco = 35 R$" → extraia "troco disponível = 35"
- Se o usuário continua uma compra ou operação da conversa anterior, o "resultado anterior"
  serve como ponto de partida (ex: "comprei mais 2 itens" → troco atual = resultado anterior)

Campo "needsHistory":
- Defina como true APENAS se o usuário mencionar claramente valores ou cálculos anteriores
  que não aparecem em nenhuma mensagem visível aqui (ex: "use o mesmo valor de antes",
  "com aquela taxa que calculamos", "os mesmos dados anteriores")
- Em qualquer outro caso, defina como false`;

function parseJson(raw: string): any {
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
  } catch {
    logger.warn({ raw }, "contextAgent: JSON parse failed, returning empty");
    return { entities: [], needsHistory: false };
  }
}

export async function runContextAgent(
  query: string,
  context: ConversationMessage[],
  sessionSummary?: string
): Promise<ContextAgentResult> {
  // Monta mensagens: summary (se houver) + contexto recente + query atual
  const messages: any[] = [{ role: "system", content: CONTEXT_EXTRACT_SYSTEM }];

  if (sessionSummary) {
    messages.push({
      role: "user",
      content: `[Contexto desta sessão até agora]\n${sessionSummary}`,
    });
    messages.push({
      role: "assistant",
      content: "Entendido. Tenho esse contexto histórico disponível.",
    });
  }

  for (const m of context) {
    messages.push({ role: m.role, content: m.content });
  }

  messages.push({ role: "user", content: query });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 600,
      messages,
    } as any);

    const parsed = parseJson(response.choices[0]?.message?.content ?? "");
    const entities: RawEntity[] = (parsed.entities ?? []).map((e: any) => ({
      label: String(e.label ?? ""),
      value: Number(e.value ?? 0),
      humanReadable: String(e.humanReadable ?? e.value ?? ""),
      unit: String(e.unit ?? ""),
    }));

    const needsHistory = parsed.needsHistory === true && entities.length === 0;

    logger.debug(
      { entityCount: entities.length, needsHistory },
      "contextAgent: extracted entities"
    );

    return { entities, rawText: query, needsHistory };
  } catch (err) {
    logger.warn({ err }, "contextAgent: failed, returning empty");
    return { entities: [], rawText: query };
  }
}
