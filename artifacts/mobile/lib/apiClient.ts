import AsyncStorage from "@react-native-async-storage/async-storage";

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
  userName?: string;
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
  svgSymbolic?: string | null;
  svgSubstituted?: string | null;
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

export type CalcResponse =
  | { status: "success"; result: ResultData; capturedName?: string }
  | { status: "needs_input"; message: string; missing: MissingVariable[] }
  | { status: "conversational"; message: string; capturedName?: string }
  | { status: "formula_error"; message: string }
  | { status: "wrong_formula"; message: string; suggestion: string | null };

export type LlmVerifyResponse = {
  verdict: "approved" | "flagged";
  detail: string;
};

export type PublishResponse = {
  published: boolean;
  verdict: "approved" | "flagged";
  detail: string;
};

const USER_ID_KEY = "sigma_user_id";

export async function getUserId(): Promise<string> {
  let id = await AsyncStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = "user_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    await AsyncStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

const API_BASE = process.env.EXPO_PUBLIC_API_URL
  ? process.env.EXPO_PUBLIC_API_URL
  : `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const userId = await getUserId();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-user-id": userId,
    ...((options.headers as Record<string, string>) ?? {}),
  };
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

export async function calculate(req: CalcRequest): Promise<CalcResponse> {
  const res = await apiFetch("/calculate", {
    method: "POST",
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Erro ${res.status}`);
  }
  return res.json();
}

export async function requestLlmVerify(formulaId: string): Promise<LlmVerifyResponse> {
  const res = await apiFetch(`/formulas/${formulaId}/llm-verify`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Erro ${res.status}`);
  }
  return res.json();
}

export async function publishFormula(formulaId: string, forcePublish = false): Promise<PublishResponse> {
  const res = await apiFetch(`/formulas/${formulaId}/publish`, {
    method: "POST",
    body: JSON.stringify({ forcePublish }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Erro ${res.status}`);
  }
  return res.json();
}

export async function unpublishFormula(formulaId: string): Promise<void> {
  const res = await apiFetch(`/formulas/${formulaId}/unpublish`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Erro ${res.status}`);
  }
}

export async function fetchFormulas(): Promise<any[]> {
  const res = await apiFetch("/formulas");
  if (!res.ok) return [];
  return res.json();
}

export async function fetchSavedFormulaIds(): Promise<string[]> {
  const res = await apiFetch("/formulas/saved");
  if (!res.ok) return [];
  return res.json();
}

export async function saveFormulaById(formulaId: string): Promise<void> {
  await apiFetch(`/formulas/saved/${formulaId}`, { method: "POST" });
}

export async function removeSavedFormula(formulaId: string): Promise<void> {
  await apiFetch(`/formulas/saved/${formulaId}`, { method: "DELETE" });
}

export async function createFormulaFromResult(result: ResultData): Promise<string> {
  const res = await apiFetch("/formulas", {
    method: "POST",
    body: JSON.stringify({
      name: result.formulaName,
      category: result.formulaCategory ?? "Outro",
      description: `${result.formulaName} — salva do chat`,
      symbolic: result.formulaSymbolic || result.formulaName,
    }),
  });
  if (!res.ok) throw new Error("Falha ao criar fórmula");
  const data = await res.json();
  return data.id;
}

export async function fetchSessions(): Promise<any[]> {
  const res = await apiFetch("/sessions");
  if (!res.ok) return [];
  return res.json();
}

export async function createSession(title: string): Promise<string | null> {
  const res = await apiFetch("/sessions", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.id ?? null;
}

export async function touchSession(sessionId: string): Promise<void> {
  await apiFetch(`/sessions/${sessionId}/touch`, { method: "PATCH" });
}

export async function fetchSessionSummary(sessionId: string): Promise<string | null> {
  const res = await apiFetch(`/sessions/${sessionId}/summary`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.summary ?? null;
}

export async function saveMessages(sessionId: string, userText: string, resultData: ResultData): Promise<void> {
  await apiFetch(`/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ userText, resultData }),
  });
}

export async function fetchUserProfile(): Promise<{ id: string; full_name: string | null }> {
  const res = await apiFetch("/users/me");
  if (!res.ok) throw new Error("Falha ao buscar perfil");
  return res.json();
}

export async function updateUserProfile(full_name: string): Promise<void> {
  await apiFetch("/users/me", {
    method: "PATCH",
    body: JSON.stringify({ full_name }),
  });
}

export async function fetchFormulaVerifications(formulaId: string): Promise<any[]> {
  const res = await apiFetch(`/formulas/${formulaId}/verifications`);
  if (!res.ok) return [];
  return res.json();
}

export async function fetchFormulaNotes(formulaId: string): Promise<any[]> {
  const res = await apiFetch(`/formulas/${formulaId}/notes`);
  if (!res.ok) return [];
  return res.json();
}

export async function upsertVerification(formulaId: string, verdict: "approved" | "flagged", detail?: string): Promise<void> {
  await apiFetch(`/formulas/${formulaId}/verifications`, {
    method: "POST",
    body: JSON.stringify({ verdict, detail }),
  });
}

export async function removeVerification(formulaId: string): Promise<void> {
  await apiFetch(`/formulas/${formulaId}/verifications`, { method: "DELETE" });
}

export async function addNote(formulaId: string, content: string): Promise<void> {
  await apiFetch(`/formulas/${formulaId}/notes`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export async function deleteNote(noteId: string, formulaId: string): Promise<void> {
  await apiFetch(`/formulas/${formulaId}/notes/${noteId}`, { method: "DELETE" });
}
