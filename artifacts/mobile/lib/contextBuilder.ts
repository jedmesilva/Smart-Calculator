import type { ConversationMessage } from "./apiClient";

const RECENT_WINDOW = 6;
const SUMMARY_THRESHOLD = 14;

type ChatItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "result"; id: string; result: { formulaName: string; resultFormatted: string; resultUnit: string; conversationalResponse?: string } }
  | { kind: "question"; id: string; message: string }
  | { kind: "error"; id: string; message: string };

function itemToSummaryLine(item: ChatItem): string | null {
  switch (item.kind) {
    case "user":
      return `• Usuário perguntou: "${item.text}"`;
    case "assistant":
      return `  → Sigma respondeu: "${item.text}"`;
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

function itemToMessage(item: ChatItem): ConversationMessage | null {
  switch (item.kind) {
    case "user":
      return { role: "user", content: item.text };
    case "assistant":
      return { role: "assistant", content: item.text };
    case "result": {
      const unit = item.result.resultUnit ? `${item.result.resultUnit} ` : "";
      const baseText = `Resultado calculado: ${item.result.formulaName} = ${unit}${item.result.resultFormatted}`;
      return {
        role: "assistant",
        content: item.result.conversationalResponse
          ? `${item.result.conversationalResponse} (${baseText})`
          : baseText,
      };
    }
    case "question":
      return { role: "assistant", content: item.message };
    case "error":
      return null;
    default:
      return null;
  }
}

export function buildContext(chat: ChatItem[]): ConversationMessage[] {
  if (chat.length === 0) return [];

  if (chat.length <= RECENT_WINDOW) {
    return chat.flatMap((item) => {
      const msg = itemToMessage(item);
      return msg ? [msg] : [];
    });
  }

  if (chat.length <= SUMMARY_THRESHOLD) {
    return chat.slice(-RECENT_WINDOW).flatMap((item) => {
      const msg = itemToMessage(item);
      return msg ? [msg] : [];
    });
  }

  const olderItems = chat.slice(0, chat.length - RECENT_WINDOW);
  const recentItems = chat.slice(-RECENT_WINDOW);

  const summaryLines = olderItems
    .map(itemToSummaryLine)
    .filter((line): line is string => line !== null);

  const summaryText = `Resumo da sessão até este ponto:\n` + summaryLines.join("\n");

  const recentMessages = recentItems.flatMap((item) => {
    const msg = itemToMessage(item);
    return msg ? [msg] : [];
  });

  return [{ role: "user", content: summaryText }, ...recentMessages];
}
