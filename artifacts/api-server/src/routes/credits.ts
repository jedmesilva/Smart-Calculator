import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { getCarteira, getTransacoes } from "../lib/billingService";

const router = Router();

/* GET /api/credits — saldo e resumo da carteira */
router.get("/credits", requireAuth, async (req, res) => {
  const userId = (req as any).user.id as string;
  const carteira = await getCarteira(userId);
  if (!carteira) {
    res.status(500).json({ error: "Falha ao buscar carteira" });
    return;
  }
  res.json(carteira);
});

/* GET /api/credits/historico — últimas transações */
router.get("/credits/historico", requireAuth, async (req, res) => {
  const userId = (req as any).user.id as string;
  const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10), 100);
  const transacoes = await getTransacoes(userId, limit);
  res.json(transacoes);
});

export default router;
