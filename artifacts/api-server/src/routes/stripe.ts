import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { getUncachableStripeClient, getStripeCredentials } from "../lib/stripeClient";
import {
  getOrCreateStripeCustomer,
  createCheckoutSession,
  createPortalSession,
} from "../lib/stripeService";
import { getUserProfile, getUserSubscription } from "../lib/stripeStorage";
import { logger } from "../lib/logger";

const router = Router();

/* GET /api/stripe/plans — planos e preços via Stripe API */
router.get("/stripe/plans", async (_req, res) => {
  try {
    const stripe = await getUncachableStripeClient();

    const products = await stripe.products.list({ active: true, limit: 20 });
    const prices = await stripe.prices.list({ active: true, limit: 50, expand: ["data.product"] });

    const plans = products.data
      .filter((p) => p.metadata?.plan_id)
      .map((product) => {
        const productPrices = prices.data
          .filter((pr) => {
            const prProduct = typeof pr.product === "string" ? pr.product : pr.product.id;
            return prProduct === product.id;
          })
          .map((pr) => ({
            id: pr.id,
            unit_amount: pr.unit_amount,
            currency: pr.currency,
            recurring: pr.recurring,
          }));

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          metadata: product.metadata,
          prices: productPrices,
        };
      })
      .sort((a, b) => {
        const aAmount = a.prices[0]?.unit_amount ?? 0;
        const bAmount = b.prices[0]?.unit_amount ?? 0;
        return aAmount - bAmount;
      });

    res.json({ data: plans });
  } catch (err: any) {
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
