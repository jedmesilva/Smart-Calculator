import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchFormulas,
  fetchSavedFormulaIds,
  saveFormulaById,
  removeSavedFormula,
  createFormulaFromResult,
  createSession,
  saveMessages,
  touchSession,
  fetchSessionSummary,
  fetchSessions,
  fetchFormulaVerifications,
  fetchFormulaNotes,
  upsertVerification,
  removeVerification,
  addNote,
  deleteNote,
  fetchCarteira,
  fetchCalculations,
} from "@/lib/apiClient";
import type { ResultData, CarteiraInfo, CalcRecord } from "@/lib/apiClient";

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
};

export type FormulaNote = {
  id: string;
  formula_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
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
    queryFn: fetchFormulas as () => Promise<DbFormula[]>,
  });
}

export function useSavedFormulaIds() {
  return useQuery({
    queryKey: ["saved_formulas"],
    queryFn: async () => {
      const ids = await fetchSavedFormulaIds();
      return new Set(ids);
    },
  });
}

export function useSessions() {
  return useQuery({
    queryKey: ["sessions"],
    queryFn: fetchSessions as () => Promise<DbSession[]>,
  });
}

export function useToggleSaveFormula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ formulaId, isSaved }: { formulaId: string; isSaved: boolean }) => {
      if (isSaved) {
        await removeSavedFormula(formulaId);
      } else {
        await saveFormulaById(formulaId);
      }
    },
    onMutate: async ({ formulaId, isSaved }) => {
      await qc.cancelQueries({ queryKey: ["saved_formulas"] });
      const previous = qc.getQueryData<Set<string>>(["saved_formulas"]);
      qc.setQueryData<Set<string>>(["saved_formulas"], (old) => {
        const next = new Set(old ?? []);
        if (isSaved) next.delete(formulaId);
        else next.add(formulaId);
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

export async function saveFormulaFromChat(result: ResultData): Promise<string> {
  let formulaId = result.formulaId ?? null;
  if (!formulaId) {
    formulaId = await createFormulaFromResult(result);
  }
  await saveFormulaById(formulaId);
  return formulaId;
}

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

export { createSession, saveMessages, touchSession, fetchSessionSummary };

export function useFormulaVerifications(formulaId: string | null) {
  return useQuery({
    queryKey: ["formula_verifications", formulaId],
    enabled: !!formulaId,
    queryFn: () => fetchFormulaVerifications(formulaId!) as Promise<FormulaVerification[]>,
  });
}

export function useFormulaNotes(formulaId: string | null) {
  return useQuery({
    queryKey: ["formula_notes", formulaId],
    enabled: !!formulaId,
    queryFn: () => fetchFormulaNotes(formulaId!) as Promise<FormulaNote[]>,
  });
}

export function useUpsertVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ formulaId, verdict, detail }: { formulaId: string; verdict: "approved" | "flagged"; detail?: string }) => {
      await upsertVerification(formulaId, verdict, detail);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["formula_verifications", vars.formulaId] });
    },
  });
}

export function useRemoveVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (formulaId: string) => {
      await removeVerification(formulaId);
    },
    onSuccess: (_d, formulaId) => {
      qc.invalidateQueries({ queryKey: ["formula_verifications", formulaId] });
    },
  });
}

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ formulaId, content }: { formulaId: string; content: string }) => {
      await addNote(formulaId, content);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["formula_notes", vars.formulaId] });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, formulaId }: { noteId: string; formulaId: string }) => {
      await deleteNote(noteId, formulaId);
      return formulaId;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["formula_notes", vars.formulaId] });
    },
  });
}

export function useInvalidateFormula() {
  const qc = useQueryClient();
  return (formulaId: string) => {
    qc.invalidateQueries({ queryKey: ["formulas"] });
    qc.invalidateQueries({ queryKey: ["formula_verifications", formulaId] });
    qc.invalidateQueries({ queryKey: ["formula_notes", formulaId] });
  };
}

export function useCarteira() {
  const { userId } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<CarteiraInfo | null>({
    queryKey: ["carteira", userId],
    queryFn: fetchCarteira,
    enabled: !!userId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`carteira_rt:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "carteira",
          filter: `usuario_id=eq.${userId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["carteira", userId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return query;
}

export function useInvalidateCarteira() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["carteira"], exact: false });
}

export function useCalculations() {
  const { userId } = useAuth();
  return useQuery<CalcRecord[]>({
    queryKey: ["calculations", userId],
    queryFn: fetchCalculations,
    enabled: !!userId,
    staleTime: 30_000,
    retry: 2,
  });
}

export type { CalcRecord };
