import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { buildDesenvolvimento } from "../lib/explainBuilder";
import { logger } from "../lib/logger";
import { getFromDevCache, warmDevCache, devCacheKey } from "../lib/devCache";

const router = Router();

router.post("/desenvolvimento", requireAuth, async (req: any, res: any) => {
  const {
    formulaName,
    formulaSymbolic,
    formulaSubstituted,
    expression,
    extracted,
    variableNames,
    variableValues,
    solveFor,
    computedValue,
    resultUnit,
    resultLabel,
  } = req.body ?? {};

  if (!expression || !solveFor) {
    return res.status(400).json({ error: "Dados insuficientes para gerar passo a passo" });
  }

  const key = devCacheKey(expression, solveFor, computedValue ?? 0);

  // 1. Tenta retornar do cache (resultado já gerado em background pelo /calculate)
  const cached = await getFromDevCache(key);
  if (cached) {
    logger.info({ key }, "desenvolvimento: cache hit");
    return res.json(cached);
  }

  // 2. Cache miss — gera on-demand (fallback: servidor reiniciado, resultado antigo, etc.)
  logger.info({ key }, "desenvolvimento: cache miss, gerando on-demand");

  const input = {
    formulaName: formulaName ?? "Cálculo",
    formulaSymbolic: formulaSymbolic ?? "",
    formulaSubstituted: formulaSubstituted ?? "",
    expression,
    extracted: extracted ?? {},
    variableNames: variableNames ?? {},
    variableValues: variableValues ?? {},
    solveFor,
    computedValue: computedValue ?? 0,
    resultUnit: resultUnit ?? "",
    resultLabel: resultLabel ?? solveFor,
  };

  try {
    const result = await buildDesenvolvimento(input);
    // Armazena no cache para eventuais re-aberturas
    warmDevCache(key, input);
    res.json(result);
  } catch (err: any) {
    logger.warn({ err }, "desenvolvimento: failed");
    res.status(500).json({ error: "Falha ao gerar passo a passo" });
  }
});

export default router;
