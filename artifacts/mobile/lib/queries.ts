import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ResultData } from "@/lib/apiClient";

export type FormulaVariableDef = {
  symbol: string;
  name: string;
  description: string;
};

export type FormulaExpressionMeta = {
  solveFor: string;
  resultUnit: string;
  resultLabel: string;
  variables: FormulaVariableDef[];
};

export type DbFormula = {
  id: string;
  name: string;
  category: string;
  description: string;
  symbolic: string;
  is_system: boolean;
  is_public: boolean;
  user_id: string | null;
  created_at: string;
  expression: string | null;
  expression_meta: FormulaExpressionMeta | null;
  llm_verdict: "approved" | "flagged" | null;
  llm_verified_at: string | null;
  llm_verdict_detail: string | null;
};

export type FormulaVerification = {
  id: string;
  formula_id: string;
  user_id: string;
  verdict: "approved" | "flagged";
  detail: string | null;
  created_at: string;
  profiles?: { full_name: string | null } | null;
};

export type FormulaNote = {
  id: string;
  formula_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string | null } | null;
};

export type DbSession = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type DbMessage = {
  id: string;
  session_id: string;
  kind: "user" | "result";
  text: string | null;
  result_data: ResultData | null;
  created_at: string;
};

export function useFormulas() {
  return useQuery({
    queryKey: ["formulas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formulas")
        .select("*")
        .order("category")
        .order("name");
      if (error) throw error;
      return (data ?? []) as DbFormula[];
    },
  });
}

export function useSavedFormulaIds() {
  return useQuery({
    queryKey: ["saved_formulas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_formulas")
        .select("formula_id");
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.formula_id as string));
    },
  });
}

export function useSessions() {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as DbSession[];
    },
  });
}

export function useToggleSaveFormula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ formulaId, isSaved }: { formulaId: string; isSaved: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      if (isSaved) {
        const { error } = await supabase
          .from("saved_formulas")
          .delete()
          .eq("formula_id", formulaId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("saved_formulas")
          .insert({ formula_id: formulaId, user_id: user.id });
        if (error) throw error;
      }
    },
    onMutate: async ({ formulaId, isSaved }) => {
      await qc.cancelQueries({ queryKey: ["saved_formulas"] });
      const previous = qc.getQueryData<Set<string>>(["saved_formulas"]);
      qc.setQueryData<Set<string>>(["saved_formulas"], (old) => {
        const next = new Set(old ?? []);
        if (isSaved) {
          next.delete(formulaId);
        } else {
          next.add(formulaId);
        }
        return next;
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(["saved_formulas"], context.previous);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["saved_formulas"] }),
  });
}

export async function createSession(title: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("sessions")
    .insert({ title: title.slice(0, 100), user_id: user.id })
    .select("id")
    .single();
  if (error) return null;
  return data.id;
}

export async function saveMessages(
  sessionId: string,
  userText: string,
  resultData: ResultData
): Promise<void> {
  await supabase.from("messages").insert([
    { session_id: sessionId, kind: "user", text: userText },
    { session_id: sessionId, kind: "result", result_data: resultData },
  ]);
}

export async function touchSession(sessionId: string): Promise<void> {
  await supabase
    .from("sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);
}

export async function fetchSessionSummary(sessionId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("summary")
    .eq("id", sessionId)
    .single();
  if (error || !data) return null;
  return (data as any).summary as string | null;
}

/* ── Salva fórmula a partir de um resultado do chat ── */
export async function saveFormulaFromChat(result: ResultData): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não autenticado");

  let formulaId = result.formulaId ?? null;

  if (!formulaId) {
    // Fórmula dinâmica: cria entrada real na tabela formulas
    const { data, error } = await supabase
      .from("formulas")
      .insert({
        name: result.formulaName,
        category: result.formulaCategory ?? "Outro",
        description: `${result.formulaName} — salva do chat`,
        symbolic: result.formulaSymbolic || result.formulaName,
        is_system: false,
        user_id: user.id,
        expression: null,
        expression_meta: null,
      })
      .select("id")
      .single();
    if (error) throw error;
    formulaId = data.id as string;
  }

  // Verifica duplicata antes de inserir
  const { data: existing } = await supabase
    .from("saved_formulas")
    .select("formula_id")
    .eq("formula_id", formulaId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase
      .from("saved_formulas")
      .insert({ formula_id: formulaId, user_id: user.id });
    if (error) throw error;
  }

  return formulaId;
}

/* ── Hook para salvar fórmula do chat com invalidação automática ── */
export function useSaveFormulaFromChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (result: ResultData) => saveFormulaFromChat(result),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved_formulas"] });
      qc.invalidateQueries({ queryKey: ["formulas"] });
    },
  });
}

/* ── Usuário atual ── */
export function useCurrentUser() {
  return useQuery({
    queryKey: ["current_user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/* ── Verificações de uma fórmula ── */
export function useFormulaVerifications(formulaId: string | null) {
  return useQuery({
    queryKey: ["formula_verifications", formulaId],
    enabled: !!formulaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formula_verifications")
        .select("*, profiles(full_name)")
        .eq("formula_id", formulaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FormulaVerification[];
    },
  });
}

/* ── Notas de uma fórmula ── */
export function useFormulaNotes(formulaId: string | null) {
  return useQuery({
    queryKey: ["formula_notes", formulaId],
    enabled: !!formulaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formula_notes")
        .select("*, profiles(full_name)")
        .eq("formula_id", formulaId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FormulaNote[];
    },
  });
}

/* ── Adicionar ou atualizar verificação (upsert por user+formula) ── */
export function useUpsertVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      formulaId,
      verdict,
      detail,
    }: {
      formulaId: string;
      verdict: "approved" | "flagged";
      detail?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // Remove voto anterior se existir
      await supabase
        .from("formula_verifications")
        .delete()
        .eq("formula_id", formulaId)
        .eq("user_id", user.id);

      const { error } = await supabase
        .from("formula_verifications")
        .insert({ formula_id: formulaId, user_id: user.id, verdict, detail: detail ?? null });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["formula_verifications", vars.formulaId] });
    },
  });
}

/* ── Remover verificação própria ── */
export function useRemoveVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (formulaId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("formula_verifications")
        .delete()
        .eq("formula_id", formulaId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: (_d, formulaId) => {
      qc.invalidateQueries({ queryKey: ["formula_verifications", formulaId] });
    },
  });
}

/* ── Adicionar nota ── */
export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ formulaId, content }: { formulaId: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("formula_notes")
        .insert({ formula_id: formulaId, user_id: user.id, content });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["formula_notes", vars.formulaId] });
    },
  });
}

/* ── Deletar nota própria ── */
export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, formulaId }: { noteId: string; formulaId: string }) => {
      const { error } = await supabase
        .from("formula_notes")
        .delete()
        .eq("id", noteId);
      if (error) throw error;
      return formulaId;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["formula_notes", vars.formulaId] });
    },
  });
}

/* ── Invalidar cache de uma fórmula específica ── */
export function useInvalidateFormula() {
  const qc = useQueryClient();
  return (formulaId: string) => {
    qc.invalidateQueries({ queryKey: ["formulas"] });
    qc.invalidateQueries({ queryKey: ["formula_verifications", formulaId] });
    qc.invalidateQueries({ queryKey: ["formula_notes", formulaId] });
  };
}
