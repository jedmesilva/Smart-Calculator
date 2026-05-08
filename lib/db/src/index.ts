import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function buildConnectionString(): string {
  if (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE) {
    const user = encodeURIComponent(process.env.PGUSER);
    const password = process.env.PGPASSWORD ? `:${encodeURIComponent(process.env.PGPASSWORD)}` : "";
    const port = process.env.PGPORT ?? "5432";
    return `postgresql://${user}${password}@${process.env.PGHOST}:${port}/${process.env.PGDATABASE}`;
  }
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  throw new Error(
    "Database connection not configured. Set PG* environment variables.",
  );
}

export const pool = new Pool({ connectionString: buildConnectionString() });

export const db = drizzle(pool, { schema });

export * from "./schema";
