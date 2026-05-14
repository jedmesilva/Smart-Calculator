import Stripe from "stripe";
import { getStripeCredentials } from "./stripeClient";
import { pool } from "@workspace/db";
import { logger } from "./logger";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
};

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload deve ser um Buffer. " +
        "Certifique-se que a rota webhook está registrada ANTES do express.json()."
      );
    }

    const { secretKey, webhookSecret } = await getStripeCredentials();
    if (!webhookSecret) {
      logger.warn("stripe: STRIPE_WEBHOOK_SECRET não configurado — webhook ignorado");
      return;
    }

    const stripe = new Stripe(secretKey);
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    await handleStripeEvent(stripe, event);
  }
}

async function handleStripeEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
  logger.info({ type: event.type }, "stripe: webhook recebido");

  switch (event.type) {
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id;
      if (!subscriptionId) return;
      await onPaymentSucceeded(stripe, invoice, subscriptionId);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await onSubscriptionDeleted(sub);
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await onSubscriptionUpdated(stripe, sub);
      break;
    }
  }
}

async function onPaymentSucceeded(
  stripe: Stripe,
  invoice: Stripe.Invoice,
  subscriptionId: string
): Promise<void> {
  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : (invoice.customer as any)?.id;
  if (!customerId) return;

  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price.product"],
  });

  const product = sub.items.data[0]?.price?.product as Stripe.Product | undefined;
  const planId = product?.metadata?.plan_id ?? "";
  const credits = parseInt(product?.metadata?.credits ?? "0", 10);

  if (!credits || !planId) {
    logger.warn({ customerId, planId }, "stripe: produto sem metadata de créditos");
    return;
  }

  const client = await pool.connect();
  try {
    const userRes = await client.query(
      "SELECT id FROM profiles WHERE stripe_customer_id = $1",
      [customerId]
    );
    if (!userRes.rows.length) {
      logger.warn({ customerId }, "stripe: usuário não encontrado para customer");
      return;
    }
    const userId = userRes.rows[0].id;

    await client.query("BEGIN");

    await client.query(
      `INSERT INTO carteira (usuario_id, saldo_creditos, total_gasto_brl, total_consultas)
       VALUES ($1, 0, 0, 0) ON CONFLICT (usuario_id) DO NOTHING`,
      [userId]
    );

    const balRes = await client.query(
      "SELECT saldo_creditos FROM carteira WHERE usuario_id = $1 FOR UPDATE",
      [userId]
    );
    const saldoAnterior = balRes.rows[0]?.saldo_creditos ?? 0;
    const saldoPosterior = saldoAnterior + credits;

    await client.query(
      "UPDATE carteira SET saldo_creditos = $1, atualizado_em = now() WHERE usuario_id = $2",
      [saldoPosterior, userId]
    );

    await client.query(
      `INSERT INTO transacoes (usuario_id, tipo, creditos, saldo_anterior, saldo_posterior, descricao)
       VALUES ($1, 'recarga', $2, $3, $4, $5)`,
      [
        userId,
        credits,
        saldoAnterior,
        saldoPosterior,
        `Recarga ${PLAN_LABELS[planId] ?? planId} — ${credits} créditos`,
      ]
    );

    await client.query(
      "UPDATE profiles SET plano = $1, stripe_subscription_id = $2 WHERE id = $3",
      [planId, subscriptionId, userId]
    );

    await client.query("COMMIT");
    logger.info({ userId, credits, planId, saldoPosterior }, "stripe: créditos adicionados");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error({ err, customerId }, "stripe: erro ao adicionar créditos");
    throw err;
  } finally {
    client.release();
  }
}

async function onSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : (sub.customer as any)?.id;
  if (!customerId) return;

  const client = await pool.connect();
  try {
    await client.query(
      "UPDATE profiles SET plano = $1, stripe_subscription_id = NULL WHERE stripe_customer_id = $2",
      ["free", customerId]
    );
    logger.info({ customerId }, "stripe: assinatura cancelada, plano resetado para free");
  } finally {
    client.release();
  }
}

async function onSubscriptionUpdated(stripe: Stripe, sub: Stripe.Subscription): Promise<void> {
  if (sub.status !== "active") return;

  const customerId = typeof sub.customer === "string" ? sub.customer : (sub.customer as any)?.id;
  if (!customerId) return;

  const subFull = await stripe.subscriptions.retrieve(sub.id, {
    expand: ["items.data.price.product"],
  });
  const product = subFull.items.data[0]?.price?.product as Stripe.Product | undefined;
  const planId = product?.metadata?.plan_id ?? "";
  if (!planId) return;

  const client = await pool.connect();
  try {
    await client.query(
      "UPDATE profiles SET plano = $1, stripe_subscription_id = $2 WHERE stripe_customer_id = $3",
      [planId, sub.id, customerId]
    );
    logger.info({ customerId, planId }, "stripe: plano atualizado");
  } finally {
    client.release();
  }
}
