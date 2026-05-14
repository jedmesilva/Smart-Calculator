import { getUncachableStripeClient } from "./stripeClient";
import { getUserProfile, updateUserStripeCustomer } from "./stripeStorage";
import { logger } from "./logger";

const APP_SCHEME = "mobile";

export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  const profile = await getUserProfile(userId);

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  await updateUserStripeCustomer(userId, customer.id);
  logger.info({ userId, customerId: customer.id }, "stripe: customer criado");
  return customer.id;
}

export async function createCheckoutSession(opts: {
  customerId: string;
  priceId: string;
  userId: string;
}): Promise<string> {
  const stripe = await getUncachableStripeClient();

  const session = await stripe.checkout.sessions.create({
    customer: opts.customerId,
    payment_method_types: ["card"],
    line_items: [{ price: opts.priceId, quantity: 1 }],
    mode: "subscription",
    success_url: `${APP_SCHEME}://checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_SCHEME}://checkout/cancel`,
    metadata: { userId: opts.userId },
    subscription_data: {
      metadata: { userId: opts.userId },
    },
  });

  if (!session.url) throw new Error("Checkout URL não disponível");
  return session.url;
}

export async function createPortalSession(customerId: string): Promise<string> {
  const stripe = await getUncachableStripeClient();

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${APP_SCHEME}://checkout/portal-return`,
  });

  return session.url;
}
