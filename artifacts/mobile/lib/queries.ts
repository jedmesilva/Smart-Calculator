import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ResultData } from "@/lib/apiClient";

export type DbFormula = {
  id: string;
  name: string;
  category: string;
  description: string;
  symbolic: string;
  is_system: boolean;
  user_id: string | null;
  created_at: string;
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved_formulas"] }),
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
