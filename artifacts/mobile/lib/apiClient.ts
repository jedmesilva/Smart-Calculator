export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CalcRequest = {
  query: string;
  formulaId?: string;
  context?: ConversationMessage[];
  sessionId?: string;
  sessionSummary?: string;
  messageCount?: number;
};

export type ProofResult = {
  verified: boolean;
  method: string;
  detail: string;
};

export type ResultData = {
  formulaId?: string | null;
  formulaCategory?: string | null;
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
  proof: ProofResult;
  conversationalResponse: string;
};

export type MissingVariable = {
  symbol: string;
  name: string;
  description: string;
};

/**
 * Resposta discriminante do POST /api/calculate
 *
 * status "success"       → cálculo concluído; result sempre presente
 * status "needs_input"   → faltam variáveis; message explica, missing lista o que falta
 * status "formula_error" → fórmula inválida ou não encontrada
 * status "wrong_formula" → fórmula selecionada não é adequada; suggestion sugere outra
 */
export type CalcResponse =
  | { status: "success"; result: ResultData }
  | { status: "needs_input"; message: string; missing: MissingVariable[] }
  | { status: "formula_error"; message: string }
  | { status: "wrong_formula"; message: string; suggestion: string | null };

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
