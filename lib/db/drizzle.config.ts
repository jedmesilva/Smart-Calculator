import { defineConfig } from "drizzle-kit";
import path from "path";

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
    throw new Error("DATABASE_URL, ensure the database is provisioned");
  }
  return rawUrl;
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: buildConnectionString(),
  },
});
