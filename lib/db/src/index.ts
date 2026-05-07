import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const rawUrl = process.env.DATABASE_URL ?? "";

if (!rawUrl) {
  throw new Error(
    "DATABASE_URL must be set. It should point to your Supabase PostgreSQL connection string.",
  );
}

export const pool = new Pool({ connectionString: rawUrl });

export const db = drizzle(pool, { schema });

export * from "./schema";
