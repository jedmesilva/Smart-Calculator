import { defineConfig } from "drizzle-kit";
import path from "path";

function getDbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE) {
    const password = process.env.PGPASSWORD ? `:${process.env.PGPASSWORD}` : "";
    const port = process.env.PGPORT ?? "5432";
    return `postgresql://${process.env.PGUSER}${password}@${process.env.PGHOST}:${port}/${process.env.PGDATABASE}`;
  }
  throw new Error("Database connection not configured.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: getDbUrl(),
  },
});
