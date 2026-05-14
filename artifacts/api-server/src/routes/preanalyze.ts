import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { runIntentAgent } from "../lib/orchestrator";

const router = Router();

const PreanalyzeBody = z.object({
  query: z.string().min(1).max(1000),
  formulaId: z.string().uuid().optional(),
  formulaHint: z.string().max(200).optional(),
  context: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).max(20).optional(),
  sessionSummary: z.string().max(3000).optional(),
});

router.post("/preanalyze", requireAuth, async (req, res) => {
  const parsed = PreanalyzeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  const { query, formulaHint, context = [], sessionSummary } = parsed.data;

  try {
    const intent = await runIntentAgent({ query, context, sessionSummary, formulaHint });
    res.json(intent);
  } catch (err: any) {
    logger.warn({ err }, "preanalyze: intent agent failed");
    res.json({ status: "conversational" });
  }
});

export default router;
