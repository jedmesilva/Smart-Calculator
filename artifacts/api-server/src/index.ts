import app from "./app";
import { logger } from "./lib/logger";
import { atualizarCambio, recomputeSubsidio } from "./lib/billingService";

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

// ── Tarefas periódicas de billing ──
async function initBilling() {
  // Câmbio e subsídio na inicialização
  await Promise.allSettled([
    atualizarCambio(),
    recomputeSubsidio(),
  ]);

  // Câmbio: atualiza a cada 6 horas
  setInterval(() => atualizarCambio(), 6 * 60 * 60 * 1000);

  // Subsídio: recomputa a cada hora à medida que a base de usuários evolui
  setInterval(() => recomputeSubsidio(), 60 * 60 * 1000);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  initStripe();
  initBilling();
});
