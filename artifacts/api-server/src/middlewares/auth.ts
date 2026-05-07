import { type Request, type Response, type NextFunction } from "express";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.headers["x-user-id"] as string | undefined;

  if (!userId || !userId.trim()) {
    res.status(401).json({ error: "Usuário não autenticado" });
    return;
  }

  (req as any).user = { id: userId.trim() };
  next();
}
