import { Router } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import {
  ensureGuestTables,
  checkGuestSaldo,
  GUEST_QUOTA_CREDITS,
} from "../lib/guestBilling";

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Garante tabelas ao iniciar o servidor */
ensureGuestTables();

/* ══════════════════════════════════════════════════════
   POST /api/guest/init
   Cria ou recupera sessão de visitante.
   Retorna créditos restantes (quota − gastos).
   ══════════════════════════════════════════════════════ */
router.post("/guest/init", async (req, res) => {
  const { guestId } = req.body ?? {};
  if (!guestId || !UUID_RE.test(guestId)) {
    res.status(400).json({ error: "guestId inválido" });
    return;
  }

  const client = await pool.connect();
  try {
    /* Cria sessão se não existir — não sobrescreve gastos existentes */
    await client.query(
      `INSERT INTO guest_sessions (id, creditos_gastos, creditos_quota)
       VALUES ($1, 0, $2)
       ON CONFLICT (id) DO NOTHING`,
      [guestId, GUEST_QUOTA_CREDITS]
    );

    const creditsLeft = await checkGuestSaldo(guestId);
    res.json({ guestId, credits: creditsLeft, quota: GUEST_QUOTA_CREDITS });
  } catch (err) {
    logger.error({ err }, "guest/init: erro");
    res.status(500).json({ error: "Erro ao inicializar sessão de visitante" });
  } finally {
    client.release();
  }
});

/* ══════════════════════════════════════════════════════
   GET /api/guest/credits
   Retorna créditos restantes em tempo real.
   ══════════════════════════════════════════════════════ */
router.get("/guest/credits", async (req, res) => {
  const guestId = req.headers["x-guest-id"] as string | undefined;
  if (!guestId || !UUID_RE.test(guestId)) {
    res.status(400).json({ error: "x-guest-id header inválido" });
    return;
  }

  try {
    const creditsLeft = await checkGuestSaldo(guestId);
    res.json({ credits: creditsLeft, quota: GUEST_QUOTA_CREDITS });
  } catch (err) {
    logger.error({ err }, "guest/credits: erro");
    res.status(500).json({ error: "Erro ao buscar créditos" });
  }
});

/* ══════════════════════════════════════════════════════
   PATCH /api/guest/name
   Atualiza nome do visitante (informado após 1º cálculo).
   ══════════════════════════════════════════════════════ */
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
