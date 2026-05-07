export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CalcRequest = {
  query: string;
  formulaId?: string;
  context?: ConversationMessage[];
};

export type ResultData = {
  formulaName: string;
  resultFormatted: string;
  resultUnit: string;
  resultLabel: string;
  formulaSymbolic: string;
  formulaSubstituted: string;
  variables: { symbol: string; name: string; value: string }[];
  steps: string[];
  note: string | null;
  warning?: string | null;
  searchUsed?: boolean;
};

export type MissingVariable = {
  symbol: string;
  name: string;
  description: string;
};

/**
 * Unified response discriminant from POST /api/calculate
 *
 * status "success"       → cálculo concluído; result sempre presente
 * status "needs_input"   → faltam variáveis; message explica, missing lista o que falta
 * status "formula_error" → fórmula inválida ou não encontrada; message explica
 */
export type CalcResponse =
  | { status: "success"; result: ResultData }
  | { status: "needs_input"; message: string; missing: MissingVariable[] }
  | { status: "formula_error"; message: string };

const API_BASE = process.env.EXPO_PUBLIC_API_URL
  ? process.env.EXPO_PUBLIC_API_URL
  : `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

export async function calculate(req: CalcRequest, accessToken: string): Promise<CalcResponse> {
  const res = await fetch(`${API_BASE}/calculate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Erro ${res.status}`);
  }

  return res.json();
}
