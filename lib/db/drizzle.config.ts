import { defineConfig } from "drizzle-kit";
import path from "path";

/*
 * IMPORTANTE: Ignorar PGHOST/PGUSER/PGDATABASE (Replit PostgreSQL).
 * Usar SEMPRE DATABASE_URL (Supabase), conforme replit.md.
 */
export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? (() => { throw new Error("DATABASE_URL must be set"); })(),
  },
});
