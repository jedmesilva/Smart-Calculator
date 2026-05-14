import { type Request, type Response, type NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  throw new Error("SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL must be set");
}

const supabase = createClient(
  supabaseUrl,
  process.env.SUPABASE_ANON_KEY!
);

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Usuário não autenticado" });
    return;
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.error("[auth] getUser failed:", {
      error: error?.message,
      status: error?.status,
      supabaseUrl,
      tokenPrefix: token.slice(0, 20),
    });
    res.status(401).json({ error: "Sessão inválida ou expirada" });
    return;
  }

  (req as any).user = { id: user.id };
  next();
}
