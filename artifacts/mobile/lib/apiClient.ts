import { supabase } from "@/lib/supabase";

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

export type DesenvolvimentoStep = {
  ordem: number;
  descricao: string;
  latex: string | null;
  tipo: "enunciado" | "substituicao" | "simplificacao" | "teorema" | "aplicacao" | "resolucao" | "resultado";
  justificativa?: string | null;
};

export type ResultData = {
  formulaId?: string | null;
  searchUsed?: boolean;
  warning?: string | null;
  conversationalResponse: string;
  objetivo?: string | null;

  dominio?: string;

  operacao?: {
    tipo: string;
    nome_formal: string;
    referencia: string;
  };

  meta: {
    titulo: string;
    categoria: string;
    subcategoria: string;
    responsavel: string;
    timestamp: string;
  };

  formula: {
    abstrata: string;
    latex: string | null;
    referencia: string | null;
  };

  variaveis: {
    simbolo: string;
    papel?: string;
    descricao: string;
    valor: string;
    unidade: string;
  }[];

  desenvolvimento: DesenvolvimentoStep[];

  desenvolvimentoInput?: {
    formulaName: string;
    formulaSymbolic: string;
    formulaSubstituted: string;
    expression: string;
    extracted: Record<string, number>;
    variableNames: Record<string, string>;
    variableValues: Record<string, string>;
    solveFor: string;
    computedValue: number;
    resultUnit: string;
    resultLabel: string;
  };

  resultado: {
    valor: string;
    latex: string | null;
    unidade: string;
    resultUnitType?: string;
    interpretacao?: string | null;
  };

  prova: {
    tipo: "inversa" | "derivacao" | "substituicao" | "razoabilidade";
    descricao: string;
    latex: string | null;
    valido: boolean;
    steps?: { latex: string }[] | null;
  };
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

const API_BASE = process.env.EXPO_PUBLIC_API_URL
  ? process.env.EXPO_PUBLIC_API_URL
  : `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

export async function calculateStream(
  req: CalcRequest,
  onThinking: (message: string) => void,
): Promise<CalcResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${API_BASE}/calculate`, {
    method: "POST",
    headers,
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Erro ${res.status}`);
  }

  function parseSSEBlocks(text: string): CalcResponse | null {
    const blocks = text.split("\n\n");
    for (const block of blocks) {
      for (const line of block.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const event = JSON.parse(raw);
          if (event.type === "thinking" && typeof event.message === "string") {
            onThinking(event.message);
          } else if (event.type === "result") {
            return event.data as CalcResponse;
          } else if (event.type === "error") {
            throw new Error(event.message ?? "Erro no servidor");
          }
        } catch (parseErr: any) {
          // Só suprime SyntaxError real do JSON.parse — re-lança qualquer outro erro (ex: evento de erro do servidor)
          if (!(parseErr instanceof SyntaxError)) throw parseErr;
        }
      }
    }
    return null;
  }

  const reader = res.body?.getReader();

  // React Native (Hermes/Expo Go) não suporta ReadableStream — lê tudo de uma vez
  if (!reader) {
    const text = await res.text();
    const result = parseSSEBlocks(text);
    if (result) return result;
    throw new Error("Stream encerrado sem resultado");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    const result = parseSSEBlocks(events.join("\n\n"));
    if (result) return result;
  }

  throw new Error("Stream encerrado sem resultado");
}

export async function predictQuery(req: CalcRequest): Promise<void> {
  try {
    await apiFetch("/predict", {
      method: "POST",
      body: JSON.stringify(req),
    });
  } catch {
    // silencioso — pré-computação é best-effort
  }
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
      name: result.meta.titulo,
      category: result.meta.categoria ?? "Outro",
      description: `${result.meta.titulo} — salva do chat`,
      symbolic: result.formula.abstrata || result.meta.titulo,
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

export async function fetchSessionMessages(sessionId: string): Promise<Array<{
  id: string;
  session_id: string;
  kind: "user" | "result";
  text: string | null;
  result_data: ResultData | null;
  created_at: string;
}>> {
  const res = await apiFetch(`/sessions/${sessionId}/messages`);
  if (!res.ok) return [];
  return res.json();
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

export type CalcRecord = {
  id: string;
  result_data: ResultData;
  created_at: string;
  session_id: string;
};

export async function fetchCalculations(): Promise<CalcRecord[]> {
  try {
    const res = await apiFetch("/calculations");
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export type CarteiraInfo = {
  saldo: number;
  totalConsultas: number;
  totalGastoBrl: number;
};

export async function fetchDesenvolvimento(
  input: ResultData["desenvolvimentoInput"]
): Promise<{ steps: DesenvolvimentoStep[]; interpretacao: string | null }> {
  if (!input) return { steps: [], interpretacao: null };
  const res = await apiFetch("/desenvolvimento", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error("Falha ao carregar passo a passo");
  return res.json();
}

export async function fetchCarteira(): Promise<CarteiraInfo | null> {
  try {
    const res = await apiFetch("/credits");
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export type Transacao = {
  tipo: string;
  creditos: number;
  saldo_anterior: number;
  saldo_posterior: number;
  descricao: string | null;
  criado_em: string;
};

export async function fetchTransacoes(limit = 20): Promise<Transacao[]> {
  try {
    const res = await apiFetch(`/credits/historico?limit=${limit}`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}
