import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { runCalculationPipeline } from "../lib/orchestrator";

const router = Router();

const ConversationMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(2000),
});

const CalcBody = z.object({
  query: z.string().min(1).max(1000),
  formulaId: z.string().uuid().optional(),
  context: z.array(ConversationMessage).max(20).optional(),
});

router.post("/calculate", requireAuth, async (req, res) => {
  const parsed = CalcBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    return;
  }

  const { query, formulaId, context = [] } = parsed.data;

  try {
    const result = await runCalculationPipeline({ query, formulaId, context });
    res.json(result);
  } catch (err: any) {
    logger.error({ err }, "calculate route: unhandled error");

    const isUserFacing =
      typeof err?.message === "string" &&
      (err.message.startsWith("Não foi") ||
        err.message.startsWith("Erro ao") ||
        err.message.startsWith("O resultado") ||
        err.message.startsWith("Para calcular"));

    res.status(500).json({
      error: isUserFacing
        ? err.message
        : "Falha ao processar o cálculo. Tente novamente.",
    });
  }
});

export default router;
