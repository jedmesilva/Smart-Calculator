import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { atualizarCambio } from "./lib/billingService";
import { WebhookHandlers } from "./lib/webhookHandlers";

const app: Express = express();

// ── Webhook Stripe ANTES do express.json() ─────────────────────
// Crítico: o webhook precisa do Buffer raw, não do JSON parseado
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Assinatura stripe ausente" });
      return;
    }
    const sig = Array.isArray(signature) ? signature[0] : signature;
    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error({ err }, "stripe: erro no webhook");
      res.status(400).json({ error: "Erro ao processar webhook" });
    }
  }
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.use("/api", router);

// ── Câmbio: atualiza na inicialização e a cada hora ──────────────
atualizarCambio().catch(() => {});
setInterval(() => atualizarCambio().catch(() => {}), 60 * 60 * 1000);

export default app;
