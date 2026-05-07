/* ═══════════════════════════════════════════════════════
   Rotas de fórmulas — verificação LLM + publicação + listagem
   POST /api/formulas/:id/llm-verify  → verifica com IA (owner only)
   POST /api/formulas/:id/publish     → publica (verificação obrigatória)
   POST /api/formulas/:id/unpublish   → despublica
   GET  /api/formulas                 → lista todas as fórmulas
   POST /api/formulas                 → cria nova fórmula
   GET  /api/formulas/saved           → fórmulas salvas do usuário
   POST /api/formulas/saved/:id       → salva fórmula
   DELETE /api/formulas/saved/:id     → remove fórmula salva
   ═══════════════════════════════════════════════════════ */

import { Router } from "express";
import { db } from "@workspace/db";
import { formulas, savedFormulas, formulaVerifications, formulaNotes, profiles } from "@workspace/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { runFormulaLlmVerify } from "../agents/formulaLlmVerifyAgent";
import { logger } from "../lib/logger";

const router = Router();

/* ── GET /api/formulas ── */
router.get("/", async (_req, res) => {
  const data = await db
    .select()
    .from(formulas)
    .orderBy(asc(formulas.category), asc(formulas.name));
  res.json(data);
});

/* ── POST /api/formulas ── */
router.post("/", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { name, category, description, symbolic } = req.body;
  if (!name || !category || !description || !symbolic) {
    res.status(400).json({ error: "Campos obrigatórios ausentes" });
    return;
  }
  const [created] = await db.insert(formulas).values({
    name,
    category,
    description,
    symbolic,
    is_system: false,
    is_public: false,
    user_id: user.id,
    expression: req.body.expression ?? null,
    expression_meta: req.body.expression_meta ?? null,
  }).returning();
  res.json(created);
});

/* ── GET /api/formulas/saved ── */
router.get("/saved", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const data = await db
    .select({ formula_id: savedFormulas.formula_id })
    .from(savedFormulas)
    .where(eq(savedFormulas.user_id, user.id));
  res.json(data.map((r) => r.formula_id));
});

/* ── POST /api/formulas/saved/:id ── */
router.post("/saved/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const existing = await db
    .select()
    .from(savedFormulas)
    .where(and(eq(savedFormulas.formula_id, id), eq(savedFormulas.user_id, user.id)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(savedFormulas).values({ formula_id: id, user_id: user.id });
  }
  res.json({ saved: true });
});

/* ── DELETE /api/formulas/saved/:id ── */
router.delete("/saved/:id", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  await db
    .delete(savedFormulas)
    .where(and(eq(savedFormulas.formula_id, id), eq(savedFormulas.user_id, user.id)));
  res.json({ removed: true });
});

/* ── GET /api/formulas/:id/verifications ── */
router.get("/:id/verifications", async (req, res) => {
  const { id } = req.params;
  const data = await db
    .select()
    .from(formulaVerifications)
    .where(eq(formulaVerifications.formula_id, id))
    .orderBy(desc(formulaVerifications.created_at));
  res.json(data);
});

/* ── GET /api/formulas/:id/notes ── */
router.get("/:id/notes", async (req, res) => {
  const { id } = req.params;
  const data = await db
    .select()
    .from(formulaNotes)
    .where(eq(formulaNotes.formula_id, id))
    .orderBy(asc(formulaNotes.created_at));
  res.json(data);
});

/* ── POST /api/formulas/:id/verifications ── */
router.post("/:id/verifications", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { verdict, detail } = req.body;
  await db
    .delete(formulaVerifications)
    .where(and(eq(formulaVerifications.formula_id, id), eq(formulaVerifications.user_id, user.id)));
  await db.insert(formulaVerifications).values({ formula_id: id, user_id: user.id, verdict, detail: detail ?? null });
  res.json({ ok: true });
});

/* ── DELETE /api/formulas/:id/verifications ── */
router.delete("/:id/verifications", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  await db
    .delete(formulaVerifications)
    .where(and(eq(formulaVerifications.formula_id, id), eq(formulaVerifications.user_id, user.id)));
  res.json({ ok: true });
});

/* ── POST /api/formulas/:id/notes ── */
router.post("/:id/notes", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { id } = req.params;
  const { content } = req.body;
  await db.insert(formulaNotes).values({ formula_id: id, user_id: user.id, content });
  res.json({ ok: true });
});

/* ── DELETE /api/formulas/:id/notes/:noteId ── */
router.delete("/:id/notes/:noteId", requireAuth, async (req, res) => {
  const { noteId } = req.params;
  await db.delete(formulaNotes).where(eq(formulaNotes.id, noteId));
  res.json({ ok: true });
});

/* ── POST /api/formulas/:id/llm-verify ── */
router.post("/:id/llm-verify", requireAuth, async (req, res) => {
  const { id } = req.params;
  const user = (req as any).user;

  const [formula] = await db
    .select()
    .from(formulas)
    .where(and(eq(formulas.id, id), eq(formulas.user_id, user.id)))
    .limit(1);

  if (!formula) {
    res.status(404).json({ error: "Fórmula não encontrada ou sem permissão" });
    return;
  }

  try {
    const result = await runFormulaLlmVerify(formula as any);
    await db.update(formulas).set({
      llm_verdict: result.verdict,
      llm_verdict_detail: result.detail,
      llm_verified_at: new Date(),
    }).where(eq(formulas.id, id));

    logger.info({ formulaId: id, verdict: result.verdict }, "formulas: llm-verify done");
    res.json(result);
  } catch (err: any) {
    logger.error({ err }, "formulas: llm-verify failed");
    res.status(500).json({ error: "Falha na verificação automática. Tente novamente." });
  }
});

/* ── POST /api/formulas/:id/publish ── */
router.post("/:id/publish", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { forcePublish = false } = req.body as { forcePublish?: boolean };
  const user = (req as any).user;

  const [formula] = await db
    .select()
    .from(formulas)
    .where(and(eq(formulas.id, id), eq(formulas.user_id, user.id)))
    .limit(1);

  if (!formula) {
    res.status(404).json({ error: "Fórmula não encontrada ou sem permissão" });
    return;
  }

  try {
    const result = await runFormulaLlmVerify(formula as any);
    const willPublish = result.verdict === "approved" || forcePublish;

    await db.update(formulas).set({
      llm_verdict: result.verdict,
      llm_verdict_detail: result.detail,
      llm_verified_at: new Date(),
      ...(willPublish ? { is_public: true } : {}),
    }).where(eq(formulas.id, id));

    logger.info({ formulaId: id, verdict: result.verdict, published: willPublish }, "formulas: publish done");
    res.json({ published: willPublish, verdict: result.verdict, detail: result.detail });
  } catch (err: any) {
    logger.error({ err }, "formulas: publish failed");
    res.status(500).json({ error: "Falha ao publicar fórmula. Tente novamente." });
  }
});

/* ── POST /api/formulas/:id/unpublish ── */
router.post("/:id/unpublish", requireAuth, async (req, res) => {
  const { id } = req.params;
  const user = (req as any).user;

  await db.update(formulas).set({ is_public: false })
    .where(and(eq(formulas.id, id), eq(formulas.user_id, user.id)));

  res.json({ unpublished: true });
});

export default router;
