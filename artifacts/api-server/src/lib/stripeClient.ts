import Stripe from "stripe";

export async function getStripeCredentials(): Promise<{ secretKey: string; webhookSecret?: string }> {
  if (process.env.STRIPE_SECRET_KEY) {
    return {
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    };
  }

  throw new Error(
    "Credenciais Stripe não configuradas. " +
    "Defina STRIPE_SECRET_KEY nos secrets do projeto."
  );
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}
