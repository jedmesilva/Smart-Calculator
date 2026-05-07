import type { ConversationMessage } from "./apiClient";

/**
 * Itens recentes enviados como mensagens completas.
 * Itens mais antigos são comprimidos em um resumo textual.
 */
const RECENT_WINDOW = 6;
const SUMMARY_THRESHOLD = 14;

type ChatItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "result"; id: string; result: { formulaName: string; resultFormatted: string; resultUnit: string } }
  | { kind: "question"; id: string; message: string }
  | { kind: "error"; id: string; message: string };

/**
 * Converte um item do chat para texto legível para o resumo.
 */
function itemToSummaryLine(item: ChatItem): string | null {
  switch (item.kind) {
    case "user":
      return `• Usuário perguntou: "${item.text}"`;
    case "result": {
      const unit = item.result.resultUnit ? `${item.result.resultUnit} ` : "";
      return `  → ${item.result.formulaName} = ${unit}${item.result.resultFormatted}`;
    }
    case "question":
      return `  → Sigma pediu mais dados: "${item.message}"`;
    case "error":
      return `  → Erro: "${item.message}"`;
    default:
      return null;
  }
}

/**
 * Converte um item do chat para ConversationMessage (janela recente).
 */
function itemToMessage(item: ChatItem): ConversationMessage | null {
  switch (item.kind) {
    case "user":
      return { role: "user", content: item.text };
    case "result": {
      const unit = item.result.resultUnit ? `${item.result.resultUnit} ` : "";
      return {
        role: "assistant",
        content: `Resultado calculado: ${item.result.formulaName} = ${unit}${item.result.resultFormatted}`,
      };
    }
    case "question":
      return { role: "assistant", content: item.message };
    case "error":
      return null; // erros não precisam de contexto para o próximo cálculo
    default:
      return null;
  }
}

/**
 * Constrói o array de ConversationMessage para enviar ao servidor.
 *
 * Estratégia:
 *  - Se chat ≤ RECENT_WINDOW: todos os itens como mensagens completas
 *  - Se chat > SUMMARY_THRESHOLD: itens antigos → resumo textual + últimos RECENT_WINDOW como mensagens
 *  - Entre RECENT_WINDOW e SUMMARY_THRESHOLD: janela deslizante dos últimos RECENT_WINDOW
 */
export function buildContext(chat: ChatItem[]): ConversationMessage[] {
  if (chat.length === 0) return [];

  // Pequena conversa: envia tudo como mensagens completas
  if (chat.length <= RECENT_WINDOW) {
    return chat.flatMap((item) => {
      const msg = itemToMessage(item);
      return msg ? [msg] : [];
    });
  }

  // Conversa média: janela deslizante (sem resumo ainda)
  if (chat.length <= SUMMARY_THRESHOLD) {
    return chat.slice(-RECENT_WINDOW).flatMap((item) => {
      const msg = itemToMessage(item);
      return msg ? [msg] : [];
    });
  }

  // Conversa longa: resumo dos itens antigos + janela recente completa
  const olderItems = chat.slice(0, chat.length - RECENT_WINDOW);
  const recentItems = chat.slice(-RECENT_WINDOW);

  const summaryLines = olderItems
    .map(itemToSummaryLine)
    .filter((line): line is string => line !== null);

  const summaryText =
    `Resumo da sessão até este ponto:\n` + summaryLines.join("\n");

  const recentMessages = recentItems.flatMap((item) => {
    const msg = itemToMessage(item);
    return msg ? [msg] : [];
  });

  return [{ role: "user", content: summaryText }, ...recentMessages];
}
