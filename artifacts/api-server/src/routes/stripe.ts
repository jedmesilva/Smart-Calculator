import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  getOrCreateStripeCustomer,
  createCheckoutSession,
  createPortalSession,
} from "../lib/stripeService";
import {
  getUserProfile,
  listPlansWithPrices,
  getUserSubscription,
} from "../lib/stripeStorage";
import { logger } from "../lib/logger";

const router = Router();

/* GET /api/stripe/plans — planos e preços (público) */
router.get("/stripe/plans", async (_req, res) => {
  try {
    const rows = await listPlansWithPrices();

    const map = new Map<string, any>();
    for (const row of rows) {
      if (!map.has(row.product_id)) {
        map.set(row.product_id, {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          metadata: row.product_metadata ?? {},
          prices: [],
        });
      }
      if (row.price_id) {
        map.get(row.product_id).prices.push({
          id: row.price_id,
          unit_amount: row.unit_amount,
          currency: row.currency,
          recurring: row.recurring,
        });
      }
    }

    res.json({ data: Array.from(map.values()) });
  } catch (err) {
    logger.error({ err }, "stripe: erro ao listar planos");
    res.status(500).json({ error: "Falha ao buscar planos" });
  }
});

/* GET /api/stripe/subscription — assinatura ativa do usuário */
router.get("/stripe/subscription", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id as string;
    const profile = await getUserProfile(userId);

    if (!profile?.stripe_subscription_id) {
      res.json({ subscription: null, plano: profile?.plano ?? "free" });
      return;
    }

    const subscription = await getUserSubscription(profile.stripe_subscription_id);
    res.json({ subscription, plano: profile?.plano ?? "free" });
  } catch (err) {
    logger.error({ err }, "stripe: erro ao buscar assinatura");
    res.status(500).json({ error: "Falha ao buscar assinatura" });
  }
});

/* POST /api/stripe/checkout — cria sessão de checkout */
router.post("/stripe/checkout", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id as string;
    const { priceId, email } = req.body as { priceId: string; email?: string };

    if (!priceId) {
      res.status(400).json({ error: "priceId é obrigatório" });
      return;
    }

    // Usa o email fornecido pelo cliente, ou constrói um placeholder
    const customerEmail = email ?? `user-${userId.slice(0, 8)}@phormula.app`;

    const customerId = await getOrCreateStripeCustomer(userId, customerEmail);

    const checkoutUrl = await createCheckoutSession({ customerId, priceId, userId });

    res.json({ url: checkoutUrl });
  } catch (err: any) {
    logger.error({ err }, "stripe: erro ao criar checkout");
    res.status(500).json({ error: err?.message ?? "Falha ao criar sessão de pagamento" });
  }
});

/* POST /api/stripe/portal — portal de gerenciamento de assinatura */
router.post("/stripe/portal", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id as string;
    const profile = await getUserProfile(userId);

    if (!profile?.stripe_customer_id) {
      res.status(404).json({ error: "Nenhuma assinatura encontrada" });
      return;
    }

    const portalUrl = await createPortalSession(profile.stripe_customer_id);
    res.json({ url: portalUrl });
  } catch (err: any) {
    logger.error({ err }, "stripe: erro ao criar portal");
    res.status(500).json({ error: err?.message ?? "Falha ao abrir portal" });
  }
});

export default router;
