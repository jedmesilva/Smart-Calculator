/* ═══════════════════════════════════════════════════════
   summaryBuilder — gera resumo LLM da sessão via gpt-4o-mini
   Chamado de forma fire-and-forget pelo orquestrador
   quando o número de mensagens atinge um limiar.
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";
import { fetchSessionMessages, updateSessionSummary } from "./supabase";

const SUMMARY_SYSTEM = `Você é Phormula, especialista em todas as estruturas matemáticas do universo.
Analise as mensagens desta sessão de cálculo e produza um resumo conciso mas completo em português do Brasil que inclua:
- Todos os valores numéricos mencionados (com unidades e contexto: ex: "capital inicial de R$ 5.000")
- Todos os cálculos realizados, fórmulas usadas e resultados obtidos
- O tema central e objetivo dos cálculos (ex: "o usuário está avaliando um financiamento imobiliário")
- Qualquer informação que possa ser relevante para dar continuidade à conversa

Escreva em formato narrativo e direto. Seja específico com todos os números e unidades. Máximo 350 palavras.`;

type MessageRow = {
  kind: string;
  text: string | null;
  result_data: any | null;
};

function messagesToText(messages: MessageRow[], existingSummary?: string): string {
  const parts: string[] = [];

  if (existingSummary) {
    parts.push(`[Resumo anterior]\n${existingSummary}\n\n[Mensagens novas]`);
  }

  for (const msg of messages) {
    if (msg.kind === "user" && msg.text) {
      parts.push(`Usuário: ${msg.text}`);
    } else if (msg.kind === "result" && msg.result_data) {
      const r = msg.result_data as any;
      const unit = r.resultUnit ? ` ${r.resultUnit}` : "";
      parts.push(`Phormula calculou: ${r.formulaName} = ${r.resultFormatted}${unit}`);
      if (r.conversationalResponse) {
        parts.push(`Phormula: ${r.conversationalResponse}`);
      }
    }
  }

  return parts.join("\n");
}

export async function generateSessionSummary(
  sessionId: string,
  messageCount: number,
  existingSummary?: string
): Promise<void> {
  try {
    const messages = await fetchSessionMessages(sessionId, 40);
    if (messages.length === 0) return;

    const content = messagesToText(messages, existingSummary);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 500,
      messages: [
        { role: "system", content: SUMMARY_SYSTEM },
        { role: "user", content: `Gere um resumo detalhado desta sessão:\n\n${content}` },
      ],
    } as any);

    const summary = response.choices[0]?.message?.content?.trim();
    if (summary) {
      await updateSessionSummary(sessionId, summary, messageCount);
      logger.info({ sessionId, messageCount }, "summaryBuilder: summary saved");
    }
  } catch (err) {
    logger.warn({ err, sessionId }, "summaryBuilder: failed to generate summary");
  }
}
