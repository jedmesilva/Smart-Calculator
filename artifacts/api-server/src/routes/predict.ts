import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { runSpeculativePipeline } from "../lib/orchestrator";

const router = Router();

const ConversationMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(2000),
});

const PredictBody = z.object({
  query: z.string().min(3).max(1000),
  formulaId: z.string().uuid().optional(),
  context: z.array(ConversationMessage).max(20).optional(),
  sessionId: z.string().uuid().optional(),
  sessionSummary: z.string().max(3000).optional(),
  messageCount: z.number().int().min(0).optional(),
  userName: z.string().max(100).optional(),
});

router.post("/predict", requireAuth, async (req, res) => {
  const parsed = PredictBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  const {
    query,
    formulaId,
    context = [],
    sessionId,
    sessionSummary,
    messageCount,
    userName,
  } = parsed.data;
  const userId = (req as any).user.id as string;

  res.status(202).json({ ok: true });

  runSpeculativePipeline({
    query,
    formulaId,
    context,
    sessionId,
    sessionSummary,
    messageCount,
    userName,
    userId,
  }).catch((err) =>
    logger.warn(
      { err: err?.message, query: query.slice(0, 80) },
      "predict: speculative pipeline error (silenced)"
    )
  );
});

export default router;
