import { db } from "@workspace/db";
import { messages, sessions } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

export async function fetchSessionMessages(
  sessionId: string,
  limit = 30
): Promise<Array<{ kind: string; text: string | null; result_data: any | null }>> {
  try {
    const rows = await db
      .select({ kind: messages.kind, text: messages.text, result_data: messages.result_data })
      .from(messages)
      .where(eq(messages.session_id, sessionId))
      .orderBy(desc(messages.created_at))
      .limit(limit);

    return rows.reverse();
  } catch {
    return [];
  }
}

export async function updateSessionSummary(
  sessionId: string,
  summary: string,
  messageCount: number
): Promise<void> {
  await db
    .update(sessions)
    .set({ summary, summary_message_count: messageCount, updated_at: new Date() })
    .where(eq(sessions.id, sessionId));
}
