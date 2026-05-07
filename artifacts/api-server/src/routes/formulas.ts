/* ═══════════════════════════════════════════════════════
   Rotas de fórmulas — verificação LLM + publicação
   POST /api/formulas/:id/llm-verify  → verifica com IA (owner only)
   POST /api/formulas/:id/publish     → publica (verificação obrigatória)
   POST /api/formulas/:id/unpublish   → despublica
   ═══════════════════════════════════════════════════════ */

import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "../middlewares/auth";
import { runFormulaLlmVerify } from "../agents/formulaLlmVerifyAgent";
import { logger } from "../lib/logger";

const router = Router();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

function userClient(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/* ── POST /api/formulas/:id/llm-verify ── */
router.post("/:id/llm-verify", requireAuth, async (req, res) => {
  const { id } = req.params;
  const user = (req as any).user;
  const token = req.headers.authorization!.slice(7);
  const sb = userClient(token);

  const { data: formula, error } = await sb
    .from("formulas")
    .select("id, name, description, symbolic, category, expression, expression_meta, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !formula) {
    res.status(404).json({ error: "Fórmula não encontrada ou sem permissão" });
    return;
  }

  try {
    const result = await runFormulaLlmVerify(formula as any);

    await sb
      .from("formulas")
      .update({
        llm_verdict: result.verdict,
        llm_verdict_detail: result.detail,
        llm_verified_at: new Date().toISOString(),
      })
      .eq("id", id);

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
  const token = req.headers.authorization!.slice(7);
  const sb = userClient(token);

  const { data: formula, error } = await sb
    .from("formulas")
    .select("id, name, description, symbolic, category, expression, expression_meta, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !formula) {
    res.status(404).json({ error: "Fórmula não encontrada ou sem permissão" });
    return;
  }

  try {
    const result = await runFormulaLlmVerify(formula as any);
    const willPublish = result.verdict === "approved" || forcePublish;

    await sb
      .from("formulas")
      .update({
        llm_verdict: result.verdict,
        llm_verdict_detail: result.detail,
        llm_verified_at: new Date().toISOString(),
        ...(willPublish ? { is_public: true } : {}),
      })
      .eq("id", id);

    logger.info(
      { formulaId: id, verdict: result.verdict, published: willPublish },
      "formulas: publish done"
    );

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
  const token = req.headers.authorization!.slice(7);
  const sb = userClient(token);

  const { error } = await sb
    .from("formulas")
    .update({ is_public: false })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    res.status(400).json({ error: "Falha ao despublicar fórmula" });
    return;
  }

  res.json({ unpublished: true });
});

export default router;
