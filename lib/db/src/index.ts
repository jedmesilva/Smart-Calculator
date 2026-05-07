import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function buildConnectionString(): string {
  if (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE) {
    const user = process.env.PGUSER;
    const password = process.env.PGPASSWORD ?? "";
    const host = process.env.PGHOST;
    const port = process.env.PGPORT ?? "5432";
    const database = process.env.PGDATABASE;
    return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }

  const rawUrl = process.env.DATABASE_URL ?? "";
  if (!rawUrl) {
    throw new Error(
      "DATABASE_URL must be set, or PGHOST/PGUSER/PGPASSWORD/PGDATABASE must be provided.",
    );
  }
  return rawUrl;
}

export const pool = new Pool({ connectionString: buildConnectionString() });

export const db = drizzle(pool, { schema });

export * from "./schema";
