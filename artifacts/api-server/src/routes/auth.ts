import { Router } from "express";
import { db } from "@workspace/db";
import { users, authSessions, profiles } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const router = Router();

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString("hex");
}

function verifyPassword(password: string, salt: string, hash: string): boolean {
  const derived = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/* ── POST /api/auth/register ── */
router.post("/register", async (req, res) => {
  const { email, password, full_name } = req.body;

  if (!email?.trim() || !password) {
    res.status(400).json({ error: "Email e senha são obrigatórios" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });
    return;
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Este e-mail já está cadastrado." });
    return;
  }

  const salt = randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  const passwordHash = `${salt}:${hash}`;

  const [user] = await db
    .insert(users)
    .values({ email: email.trim().toLowerCase(), password_hash: passwordHash })
    .returning({ id: users.id });

  if (full_name?.trim()) {
    await db
      .insert(profiles)
      .values({ id: user.id, full_name: full_name.trim() })
      .onConflictDoNothing();
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(authSessions).values({
    user_id: user.id,
    token,
    expires_at: expiresAt,
  });

  res.json({ token, user_id: user.id });
});

/* ── POST /api/auth/login ── */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email?.trim() || !password) {
    res.status(400).json({ error: "Email e senha são obrigatórios" });
    return;
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: "E-mail ou senha incorretos." });
    return;
  }

  const [salt, hash] = user.password_hash.split(":");
  if (!salt || !hash || !verifyPassword(password, salt, hash)) {
    res.status(401).json({ error: "E-mail ou senha incorretos." });
    return;
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(authSessions).values({
    user_id: user.id,
    token,
    expires_at: expiresAt,
  });

  res.json({ token, user_id: user.id });
});

/* ── POST /api/auth/logout ── */
router.post("/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    await db.delete(authSessions).where(eq(authSessions.token, token));
  }
  res.json({ ok: true });
});

export default router;
