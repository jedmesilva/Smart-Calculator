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

export async function listPlansWithPrices(): Promise<any[]> {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT
        p.id          AS product_id,
        p.name        AS product_name,
        p.description AS product_description,
        p.metadata    AS product_metadata,
        pr.id         AS price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring,
        pr.active     AS price_active
      FROM stripe.products p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
      ORDER BY pr.unit_amount ASC
    `);
    return res.rows;
  } catch {
    return [];
  } finally {
    client.release();
  }
}

export async function getUserSubscription(subscriptionId: string): Promise<any | null> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT * FROM stripe.subscriptions WHERE id = $1`,
      [subscriptionId]
    );
    return res.rows[0] ?? null;
  } catch {
    return null;
  } finally {
    client.release();
  }
}
