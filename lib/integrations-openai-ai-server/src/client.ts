import OpenAI from "openai";

// Suporta Replit AI Integration (proxy) e OpenAI padrão (Railway, produção)
// - Replit: AI_INTEGRATIONS_OPENAI_BASE_URL + AI_INTEGRATIONS_OPENAI_API_KEY (auto-provisionados)
// - Railway/prod: OPENAI_API_KEY + base URL padrão da OpenAI
const baseURL =
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1";

const apiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error(
    "OpenAI API key não configurada. Defina AI_INTEGRATIONS_OPENAI_API_KEY (Replit) ou OPENAI_API_KEY (Railway/produção).",
  );
}

export const openai = new OpenAI({
  apiKey,
  baseURL,
});
