import { type Request, type Response, type NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  throw new Error("SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL must be set");
}

const supabase = createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY!);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireAuthOrGuest(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({ error: "Sessão inválida ou expirada" });
      return;
    }
    (req as any).user = { id: user.id, isGuest: false };
    next();
    return;
  }

  const guestId = req.headers["x-guest-id"] as string | undefined;
  if (guestId && UUID_RE.test(guestId)) {
    (req as any).user = { id: guestId, isGuest: true };
    next();
    return;
  }

  res.status(401).json({ error: "Usuário não autenticado" });
}
