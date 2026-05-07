import type { ConversationMessage, ResultData, MissingVariable } from "./apiClient";

const RECENT_WINDOW = 8;

type ChatItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "result"; id: string; result: ResultData }
  | { kind: "question"; id: string; message: string; missing: MissingVariable[] }
  | { kind: "error"; id: string; message: string };

function itemToMessage(item: ChatItem): ConversationMessage | null {
  switch (item.kind) {
    case "user":
      return { role: "user", content: item.text };

    case "assistant":
      return { role: "assistant", content: item.text };

    case "result": {
      const r = item.result;
      const unit = r.resultUnit ? ` ${r.resultUnit}` : "";
      const base = `Resultado: ${r.formulaName} = ${r.resultFormatted}${unit}`;

      // Inclui variáveis e expressão para que o contextAgent possa derivar
      // valores intermediários de cálculos anteriores (ex: preço por item = total/qtd)
      const vars = r.variables && r.variables.length > 0
        ? ` | Valores usados: ${r.variables.map((v) => `${v.name}=${v.value}`).join(", ")}`
        : "";
      const expr = r.formulaSubstituted ? ` | Expressão: ${r.formulaSubstituted}` : "";

      return { role: "assistant", content: `${base}${vars}${expr}` };
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
