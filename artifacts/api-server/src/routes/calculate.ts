import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { runCalculationPipeline } from "../lib/orchestrator";
import { registerConsulta, checkSaldo } from "../lib/billingService";
import { warmDevCache, devCacheKey } from "../lib/devCache";

const router = Router();

const ConversationMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(2000),
});

const CalcBody = z.object({
  query: z.string().min(1).max(1000),
  formulaId: z.string().uuid().optional(),
  context: z.array(ConversationMessage).max(20).optional(),
  sessionId: z.string().uuid().optional(),
  sessionSummary: z.string().max(3000).optional(),
  messageCount: z.number().int().min(0).optional(),
  userName: z.string().max(100).optional(),
});

router.post("/calculate", requireAuth, async (req, res) => {
  const parsed = CalcBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    return;
  }

  const { query, formulaId, context = [], sessionId, sessionSummary, messageCount, userName } = parsed.data;
  const userId = (req as any).user.id as string;

  // Verificação prévia de saldo (sem lock — apenas para UX; o débito real usa FOR UPDATE)
  const saldo = await checkSaldo(userId);
  if (saldo <= 0) {
    res.status(402).json({ error: "saldo_insuficiente", message: "Você não tem créditos suficientes para continuar. Recarregue sua conta." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const emit = (message: string) => {
    try {
      res.write(`data: ${JSON.stringify({ type: "thinking", message })}\n\n`);
    } catch {
      // client disconnected
    }
  };

  try {
    const result = await runCalculationPipeline({
      query,
      formulaId,
      context,
      sessionId,
      sessionSummary,
      messageCount,
      userName,
      userId,
      emit,
    });

    // Débito de créditos — aguardado antes de enviar resposta ao cliente,
    // para garantir que o saldo esteja atualizado no banco quando o mobile
    // invalida a query de créditos logo após receber o resultado.
    if ((result.status === "success" || result.status === "conversational") && result.tokenUsage) {
      await registerConsulta({
        userId,
        modelo: result.tokenUsage.model,
        tipo: result.status === "success" ? "calculo" : "conversacional",
        sessionId: sessionId ?? null,
        tokenUsage: result.tokenUsage,
      }).catch((err) => logger.warn({ err }, "calculate: billing failed silently"));
    }

    // Aquece cache do desenvolvimento em background antes de enviar ao cliente
    if (result.status === "success" && result.result.desenvolvimentoInput) {
      const di = result.result.desenvolvimentoInput;
      const key = devCacheKey(di.expression, di.solveFor, di.computedValue);
      warmDevCache(key, di);
    }

    try {
      res.write(`data: ${JSON.stringify({ type: "result", data: result })}\n\n`);
    } catch (writeErr) {
      logger.warn({ writeErr }, "calculate: falha ao escrever resultado (cliente desconectou?)");
    }
  } catch (err: any) {
    logger.error({ err }, "calculate route: unhandled error");

    const isUserFacing =
      typeof err?.message === "string" &&
      (err.message.startsWith("Não foi") ||
        err.message.startsWith("Erro ao") ||
        err.message.startsWith("O resultado") ||
        err.message.startsWith("Para calcular"));

    try {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: isUserFacing
            ? err.message
            : "Falha ao processar o cálculo. Tente novamente.",
        })}\n\n`
      );
    } catch (writeErr) {
      logger.warn({ writeErr }, "calculate: falha ao escrever erro (cliente desconectou?)");
    }
  } finally {
    try { res.end(); } catch { /* already closed */ }
  }
});

export default router;
