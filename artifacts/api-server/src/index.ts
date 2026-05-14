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

// ── Verifica credenciais Stripe na inicialização (não-bloqueante) ──
async function initStripe() {
  try {
    const { getStripeCredentials } = await import("./lib/stripeClient");
    await getStripeCredentials();
    logger.info("stripe: credenciais OK");
  } catch (err: any) {
    logger.warn({ err: err?.message }, "stripe: credenciais não configuradas (pagamentos desativados)");
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
