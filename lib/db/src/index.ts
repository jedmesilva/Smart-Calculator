import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const rawUrl = process.env.DATABASE_URL ?? "";
const pgHost = process.env.PGHOST;
const pgPort = Number(process.env.PGPORT ?? 5432);
const pgUser = process.env.PGUSER;
const pgPassword = process.env.PGPASSWORD;
const pgDatabase = process.env.PGDATABASE;

// Prefer individual PG env vars (Replit managed) over DATABASE_URL when available.
// This ensures we always connect to the Replit PostgreSQL even if a stale
// DATABASE_URL secret from an external provider (e.g. Supabase) is present.
const useIndividualVars = !!(pgHost && pgUser && pgDatabase);

if (!useIndividualVars && !rawUrl) {
  throw new Error(
    "DATABASE_URL or PGHOST/PGUSER/PGDATABASE must be set. Did you forget to provision a database?",
  );
}

export const pool = useIndividualVars
  ? new Pool({ host: pgHost, port: pgPort, user: pgUser, password: pgPassword, database: pgDatabase })
  : new Pool({ connectionString: rawUrl });

export const db = drizzle(pool, { schema });

export * from "./schema";
