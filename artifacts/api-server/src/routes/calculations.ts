import { Router } from "express";
import { db } from "@workspace/db";
import { sessions, messages } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/calculations", requireAuth, async (req, res) => {
  const userId = (req as any).user.id as string;

  const data = await db
    .select({
      id: messages.id,
      result_data: messages.result_data,
      created_at: messages.created_at,
      session_id: messages.session_id,
    })
    .from(messages)
    .innerJoin(sessions, eq(messages.session_id, sessions.id))
    .where(and(eq(messages.kind, "result"), eq(sessions.user_id, userId)))
    .orderBy(desc(messages.created_at))
    .limit(100);

  res.json(data);
});

export default router;
