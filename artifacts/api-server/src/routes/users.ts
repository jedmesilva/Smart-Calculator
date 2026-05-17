import { Router } from "express";
import { db } from "@workspace/db";
import { profiles } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function getAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Supabase admin credentials not configured");
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

/* ── GET /api/users/me ── */
router.get("/me", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const [profile] = await db
    .select({ id: profiles.id, full_name: profiles.full_name, avatar_url: profiles.avatar_url })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  res.json({ id: user.id, full_name: profile?.full_name ?? null, avatar_url: profile?.avatar_url ?? null });
});

/* ── PATCH /api/users/me ── */
router.patch("/me", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { full_name } = req.body;
  if (!full_name?.trim()) {
    res.status(400).json({ error: "full_name é obrigatório" });
    return;
  }
  await db
    .insert(profiles)
    .values({ id: user.id, full_name: full_name.trim() })
    .onConflictDoUpdate({ target: profiles.id, set: { full_name: full_name.trim() } });
  res.json({ ok: true, full_name: full_name.trim() });
});

/* ── DELETE /api/users/me — soft delete ── */
router.delete("/me", requireAuth, async (req, res) => {
  const user = (req as any).user;
  try {
    const admin = getAdminClient();
    await admin.auth.admin.updateUser(user.id, {
      user_metadata: { deleted: true, deleted_at: new Date().toISOString() },
      ban_duration: "876600h",
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[users] soft delete error:", err?.message);
    res.status(500).json({ error: "Não foi possível excluir a conta. Tente novamente." });
  }
});

export default router;
