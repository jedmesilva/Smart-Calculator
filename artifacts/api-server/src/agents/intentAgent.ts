/* ═══════════════════════════════════════════════════════
   Agente de Intenção — roda em paralelo com a Fase 1
   Classifica a mensagem do usuário para rotear corretamente:

   "calculate"      → existe intenção clara de calcular um número
   "conversational" → pergunta, explicação, comentário, correção,
                       alerta, meta-pergunta sobre resultado anterior

   Roda em paralelo com formulaAgent + contextAgent para que
   NÃO adicione latência ao caminho crítico de cálculo.
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";
import type { ConversationMessage } from "./types";

export type MessageIntent = "calculate" | "conversational";

const INTENT_SYSTEM = `Você é Phormula, especialista em todas as estruturas matemáticas do universo.
Nesta etapa, classifique a intenção da mensagem do usuário para que o pipeline de cálculo seja roteado corretamente.
Dado o histórico da conversa e a mensagem atual, determine se o usuário quer:

- "calculate": calcular, obter ou estimar um valor numérico. Inclui OBRIGATORIAMENTE:
  • Perguntas com números explícitos ("10km em 1,5h, qual a velocidade?")
  • Perguntas que implicam cálculo ("quanto rende?", "qual o troco?", "qual a diferença?")
  • Perguntas de comparação que requerem cálculo ("quem é mais rápido?")
  • Conversas que continuam um cálculo anterior ("e se forem 3 itens?", "comprei mais 2")
  • CÁLCULO DIFERENCIAL E INTEGRAL — SEMPRE "calculate":
    - Integrais definidas ou indefinidas: "integral de ...", "∫...", "área sob a curva de ...",
      "calcule a integral", "integre", "primitiva de ...", "antiderivada de ..."
    - Derivadas: "derivada de ...", "d/dx de ...", "taxa de variação de ...", "f'(x) de ...",
      "diferencial de ...", "derive ..."
    - Limites: "limite de ... quando ... tende a ..."
    - Somatórios e produtos: "somatório de ...", "Σ ..."
    - Qualquer pedido que inclua "calcule", "compute", "avalie", "encontre o valor de"
      seguido de qualquer operação matemática

- "conversational": qualquer coisa que NÃO é um pedido de cálculo. Inclui:
  • Perguntas sobre um resultado anterior ("por que deu 20?", "não entendi", "explica melhor")
  • Pedidos de explicação PURAMENTE conceitual SEM pedir o resultado ("o que É uma integral?",
    "como FUNCIONA o cálculo diferencial?" — sem pedir que calcule algo específico)
  • Comentários e reações ("uau", "faz sentido", "obrigado", "errado")
  • Perguntas meta sobre o próprio app ("o que você pode calcular?", "quais valores faltam?")
  • Correções do usuário ("não, eram 5 itens, não 3")
  • Mensagens sociais ("olá", "tudo bem?")

ATENÇÃO: "calcule a integral de X de A a B" é SEMPRE "calculate" — nunca "conversational".
Se houver qualquer dúvida se é cálculo ou conceito, classifique como "calculate".

RETORNE APENAS UMA PALAVRA: "calculate" ou "conversational". Nada mais.`;

export async function classifyIntent(
  query: string,
  context: ConversationMessage[],
  sessionSummary?: string
): Promise<MessageIntent> {
  const messages: any[] = [{ role: "system", content: INTENT_SYSTEM }];

  if (sessionSummary) {
    messages.push({
      role: "user",
      content: `[Resumo da sessão]\n${sessionSummary}`,
    });
    messages.push({ role: "assistant", content: "Entendido." });
  }

  for (const m of context.slice(-4)) {
    messages.push({ role: m.role, content: m.content });
  }

  messages.push({ role: "user", content: query });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 5,
      temperature: 0,
      messages,
    } as any);

    const raw = (response.choices[0]?.message?.content ?? "").trim().toLowerCase();
    const intent: MessageIntent = raw.startsWith("conversational") ? "conversational" : "calculate";

    logger.debug({ intent, query: query.slice(0, 60) }, "intentAgent: classified");
    return intent;
  } catch (err) {
    logger.warn({ err }, "intentAgent: failed, defaulting to calculate");
    return "calculate";
  }
}
