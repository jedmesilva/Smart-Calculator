import Stripe from "stripe";

/**
 * Script helper: cria client Stripe a partir de variável de ambiente.
 * Para uso nos scripts (seed, migrações), configure STRIPE_SECRET_KEY.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY não configurada. " +
      "Para rodar scripts localmente, defina a variável de ambiente STRIPE_SECRET_KEY com a chave de teste (sk_test_...)."
    );
  }
  return new Stripe(secretKey);
}
