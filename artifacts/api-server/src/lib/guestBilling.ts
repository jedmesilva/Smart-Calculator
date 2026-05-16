import { pool } from "@workspace/db";
import { logger } from "./logger";

const GUEST_INITIAL_CREDITS = 3;

export async function checkGuestSaldo(guestId: string): Promise<number> {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT credits FROM guest_sessions WHERE id = $1`,
      [guestId]
    );
    if (res.rows.length === 0) return GUEST_INITIAL_CREDITS;
    return res.rows[0].credits as number;
  } catch {
    return GUEST_INITIAL_CREDITS;
  } finally {
    client.release();
  }
}

export async function debitGuestCredito(guestId: string): Promise<{ creditsLeft: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query(
      `SELECT credits FROM guest_sessions WHERE id = $1 FOR UPDATE`,
      [guestId]
    );
    if (res.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new Error("Guest session not found");
    }
    const current = res.rows[0].credits as number;
    if (current <= 0) {
      await client.query("ROLLBACK");
      throw new Error("saldo_insuficiente");
    }
    const newCredits = current - 1;
    await client.query(
      `UPDATE guest_sessions SET credits = $1 WHERE id = $2`,
      [newCredits, guestId]
    );
    await client.query("COMMIT");
    logger.info({ guestId, creditsLeft: newCredits }, "guestBilling: crédito debitado");
    return { creditsLeft: newCredits };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
