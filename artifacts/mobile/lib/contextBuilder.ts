import type { ConversationMessage } from "./apiClient";

const RECENT_WINDOW = 8;

type ChatItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "result"; id: string; result: { formulaName: string; resultFormatted: string; resultUnit: string; conversationalResponse?: string } }
  | { kind: "question"; id: string; message: string }
  | { kind: "error"; id: string; message: string };

function itemToMessage(item: ChatItem): ConversationMessage | null {
  switch (item.kind) {
    case "user":
      return { role: "user", content: item.text };
    case "assistant":
      return { role: "assistant", content: item.text };
    case "result": {
      const unit = item.result.resultUnit ? ` ${item.result.resultUnit}` : "";
      const baseText = `Resultado: ${item.result.formulaName} = ${item.result.resultFormatted}${unit}`;
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

/**
 * Retorna as últimas RECENT_WINDOW mensagens do chat como ConversationMessage[].
 * O resumo da sessão (sessionSummary) é enviado separadamente no CalcRequest —
 * não é embutido aqui para não inflar o payload de contexto recente.
 */
export function buildContext(chat: ChatItem[]): ConversationMessage[] {
  return chat
    .slice(-RECENT_WINDOW)
    .flatMap((item) => {
      const msg = itemToMessage(item);
      return msg ? [msg] : [];
    });
}
