import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Inicializa integração Stripe (não-bloqueante) ──────────────
async function initStripe() {
  try {
    const { runMigrations } = await import("stripe-replit-sync");
    const { getStripeSync } = await import("./lib/stripeClient");

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL ausente");

    logger.info("stripe: inicializando schema...");
    await runMigrations({ databaseUrl, schema: "stripe" });
    logger.info("stripe: schema pronto");

    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    logger.info("stripe: webhook configurado");

    stripeSync.syncBackfill()
      .then(() => logger.info("stripe: backfill concluído"))
      .catch((err) => logger.warn({ err }, "stripe: backfill falhou (não-fatal)"));
  } catch (err: any) {
    logger.warn({ err: err?.message }, "stripe: inicialização adiada (credenciais ainda não configuradas)");
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  initStripe();
});
