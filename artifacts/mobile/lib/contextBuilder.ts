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

      const titulo = r.meta?.titulo ?? "";
      const valor = r.resultado?.valor ?? "";
      const unidade = r.resultado?.unidade ?? "";
      const unit = unidade ? ` ${unidade}` : "";
      const base = `Resultado: ${titulo} = ${valor}${unit}`;

      const varList = r.variaveis ?? [];
      const vars = varList.length > 0
        ? ` | Valores usados: ${varList.map((v) => `${v.descricao}=${v.valor}`).join(", ")}`
        : "";

      const formulaText = r.formula?.abstrata ?? "";
      const expr = formulaText ? ` | Fórmula: ${formulaText}` : "";

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
