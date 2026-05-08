import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/*
 * IMPORTANTE: O Replit injeta automaticamente as variáveis PGHOST/PGUSER/PGDATABASE
 * apontando para o PostgreSQL do Replit. Essas variáveis devem ser IGNORADAS.
 * Usamos SEMPRE o Supabase via DATABASE_URL, conforme documentado em replit.md.
 */
function buildConnectionString(): string {
  const rawUrl = process.env.DATABASE_URL ?? "";
  if (!rawUrl) {
    throw new Error(
      "DATABASE_URL must be set (should point to Supabase PostgreSQL).",
    );
  }
  return rawUrl;
}

export const pool = new Pool({ connectionString: buildConnectionString() });

export const db = drizzle(pool, { schema });

export * from "./schema";
