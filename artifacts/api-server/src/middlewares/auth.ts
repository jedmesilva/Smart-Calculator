import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { authSessions } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "Usuário não autenticado" });
    return;
  }

  try {
    const [session] = await db
      .select({ user_id: authSessions.user_id })
      .from(authSessions)
      .where(and(eq(authSessions.token, token), gt(authSessions.expires_at, new Date())))
      .limit(1);

    if (!session) {
      res.status(401).json({ error: "Sessão inválida ou expirada" });
      return;
    }

    (req as any).user = { id: session.user_id };
    next();
  } catch {
    res.status(401).json({ error: "Erro ao validar sessão" });
  }
}
