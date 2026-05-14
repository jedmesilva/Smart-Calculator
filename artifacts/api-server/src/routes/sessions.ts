import { Router } from "express";
import { db } from "@workspace/db";
import { sessions, messages, profiles } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

/* ── GET /api/sessions ── */
router.get("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const data = await db
    .select()
    .from(sessions)
    .where(eq(sessions.user_id, user.id))
    .orderBy(desc(sessions.updated_at))
    .limit(50);
  res.json(data);
});

/* ── POST /api/sessions ── */
router.post("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { title } = req.body;
  if (!title) {
    res.status(400).json({ error: "title é obrigatório" });
    return;
  }
  const [created] = await db.insert(sessions).values({
    user_id: user.id,
    title: String(title).slice(0, 100),
  }).returning();
  res.json(created);
});

/* ── PATCH /api/sessions/:id/touch ── */
router.patch("/:id/touch", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  await db.update(sessions).set({ updated_at: new Date() })
    .where(and(eq(sessions.id, id), eq(sessions.user_id, user.id)));
  res.json({ ok: true });
});

/* ── GET /api/sessions/:id/summary ── */
router.get("/:id/summary", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const [session] = await db
    .select({ summary: sessions.summary })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.user_id, user.id)))
    .limit(1);
  res.json({ summary: session?.summary ?? null });
});

/* ── GET /api/sessions/:id/messages ── */
router.get("/:id/messages", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  // Verifica que a sessão pertence ao usuário
  const [session] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.user_id, user.id)))
    .limit(1);
  if (!session) {
    res.status(404).json({ error: "Sessão não encontrada" });
    return;
  }
  const data = await db
    .select()
    .from(messages)
    .where(eq(messages.session_id, id))
    .orderBy(messages.created_at)
    .limit(200);
  res.json(data);
});

/* ── POST /api/sessions/:id/messages ── */
router.post("/:id/messages", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { userText, resultData } = req.body;
  await db.insert(messages).values([
    { session_id: id, kind: "user", text: userText },
    { session_id: id, kind: "result", result_data: resultData },
  ]);
  res.json({ ok: true });
});

export default router;
