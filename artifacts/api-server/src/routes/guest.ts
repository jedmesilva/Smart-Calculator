import { Router } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

const GUEST_INITIAL_CREDITS = 3;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ensureGuestTable() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS guest_sessions (
        id UUID PRIMARY KEY,
        credits INTEGER NOT NULL DEFAULT ${GUEST_INITIAL_CREDITS},
        guest_name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (err) {
    logger.warn({ err }, "guest: falha ao criar tabela guest_sessions");
  } finally {
    client.release();
  }
}

ensureGuestTable();

/* POST /api/guest/init — cria ou busca sessão de visitante */
router.post("/guest/init", async (req, res) => {
  const { guestId } = req.body ?? {};
  if (!guestId || !UUID_RE.test(guestId)) {
    res.status(400).json({ error: "guestId inválido" });
    return;
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO guest_sessions (id, credits)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
       RETURNING credits`,
      [guestId, GUEST_INITIAL_CREDITS]
    );
    res.json({ guestId, credits: result.rows[0].credits as number });
  } catch (err) {
    logger.error({ err }, "guest/init: erro");
    res.status(500).json({ error: "Erro ao inicializar sessão de visitante" });
  } finally {
    client.release();
  }
});

/* GET /api/guest/credits — retorna créditos restantes */
router.get("/guest/credits", async (req, res) => {
  const guestId = req.headers["x-guest-id"] as string | undefined;
  if (!guestId || !UUID_RE.test(guestId)) {
    res.status(400).json({ error: "x-guest-id header inválido" });
    return;
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT credits FROM guest_sessions WHERE id = $1`,
      [guestId]
    );
    const credits = result.rows.length > 0 ? (result.rows[0].credits as number) : GUEST_INITIAL_CREDITS;
    res.json({ credits });
  } catch (err) {
    logger.error({ err }, "guest/credits: erro");
    res.status(500).json({ error: "Erro ao buscar créditos" });
  } finally {
    client.release();
  }
});

/* PATCH /api/guest/name — atualiza nome do visitante */
router.patch("/guest/name", async (req, res) => {
  const guestId = req.headers["x-guest-id"] as string | undefined;
  const { name } = req.body ?? {};
  if (!guestId || !UUID_RE.test(guestId) || !name || typeof name !== "string") {
    res.status(400).json({ error: "Parâmetros inválidos" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE guest_sessions SET guest_name = $1 WHERE id = $2`,
      [name.trim().slice(0, 100), guestId]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "guest/name: erro");
    res.status(500).json({ error: "Erro ao atualizar nome" });
  } finally {
    client.release();
  }
});

export default router;
