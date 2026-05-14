import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { buildDesenvolvimento } from "../lib/explainBuilder";
import { logger } from "../lib/logger";

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

  try {
    const result = await buildDesenvolvimento({
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
    });
    res.json(result);
  } catch (err: any) {
    logger.warn({ err }, "desenvolvimento: failed");
    res.status(500).json({ error: "Falha ao gerar passo a passo" });
  }
});

export default router;
