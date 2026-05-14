import { pool } from "@workspace/db";

export interface UserStripeProfile {
  id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plano: string;
}

export async function getUserProfile(userId: string): Promise<UserStripeProfile | null> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, stripe_customer_id, stripe_subscription_id, COALESCE(plano, 'free') AS plano
       FROM profiles WHERE id = $1`,
      [userId]
    );
    return res.rows[0] ?? null;
  } finally {
    client.release();
  }
}

export async function updateUserStripeCustomer(userId: string, stripeCustomerId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE profiles SET stripe_customer_id = $1 WHERE id = $2`,
      [stripeCustomerId, userId]
    );
  } finally {
    client.release();
  }
}

export async function getUserSubscription(subscriptionId: string): Promise<any | null> {
  try {
    const { getUncachableStripeClient } = await import("./stripeClient");
    const stripe = await getUncachableStripeClient();
    return await stripe.subscriptions.retrieve(subscriptionId);
  } catch {
    return null;
  }
}
