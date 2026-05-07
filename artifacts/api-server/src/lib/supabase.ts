import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/* ── Busca mensagens de uma sessão (mais antigas primeiro) ── */
export async function fetchSessionMessages(
  sessionId: string,
  limit = 30
): Promise<Array<{ kind: string; text: string | null; result_data: any | null }>> {
  const { data, error } = await supabase
    .from("messages")
    .select("kind, text, result_data")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []).reverse();
}

/* ── Salva resumo LLM da sessão ── */
export async function updateSessionSummary(
  sessionId: string,
  summary: string,
  messageCount: number
): Promise<void> {
  await supabase
    .from("sessions")
    .update({ summary, summary_message_count: messageCount })
    .eq("id", sessionId);
}
