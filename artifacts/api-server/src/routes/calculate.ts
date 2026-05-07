import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";
import { extractVariables } from "../lib/varExtractor";
import { computeFormula } from "../lib/formulaCompute";
import { buildResult } from "../lib/explainBuilder";
import { runDynamicOrchestrator } from "../lib/dynamicOrchestrator";

const router = Router();

const ConversationMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(2000),
});

const CalcBody = z.object({
  query: z.string().min(1).max(1000),
  formulaId: z.string().uuid().optional(),
  context: z.array(ConversationMessage).max(20).optional(),
});

router.post("/calculate", requireAuth, async (req, res) => {
  const parsed = CalcBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    return;
  }

  const { query, formulaId, context = [] } = parsed.data;

  try {
    /* ─── KNOWN FORMULA ─── */
    if (formulaId) {
      const { data: formula, error } = await supabase
        .from("formulas")
        .select("name, description, symbolic, category")
        .eq("id", formulaId)
        .single();

      if (error || !formula) {
        logger.warn({ formulaId, error }, "Formula not found");
        res.json({
          status: "formula_error",
          message:
            "Fórmula não encontrada. Ela pode ter sido removida. Tente selecionar outra ou use o modo dinâmico.",
        });
        return;
      }

      // Step 1: AI extracts variables (cheap gpt-4o-mini call)
      const extracted = await extractVariables(formula, query, context);

      if (!extracted.allPresent) {
        res.json({
          status: "needs_input",
          message: `Para calcular ${formula.name}, preciso de mais alguns dados:`,
          missing: extracted.missing,
        });
        return;
      }

      // Step 2: Compute locally with mathjs
      const computed = computeFormula(extracted.expression, extracted.extracted);

      // Step 3: Build response (pure code, no AI)
      const result = buildResult(formula.name, formula.symbolic, extracted, computed);
      res.json({ status: "success", result });
      return;
    }

    /* ─── DYNAMIC MODE ─── */
    // Parallel: Expert agent (gpt-4o) + Researcher agent (gpt-5.1 + web_search_preview)
    const dynamic = await runDynamicOrchestrator(query, context);

    if (!dynamic.allPresent) {
      res.json({
        status: "needs_input",
        message: `Para calcular ${dynamic.name || "este valor"}, preciso de mais alguns dados:`,
        missing: dynamic.missing,
      });
      return;
    }

    if (!dynamic.expression || !dynamic.solveFor) {
      res.json({
        status: "formula_error",
        message:
          "Não foi possível identificar a fórmula correta. Tente descrever com mais detalhes ou selecione uma fórmula específica.",
      });
      return;
    }

    // Compute locally
    const computed = computeFormula(dynamic.expression, dynamic.extracted);

    // Build response
    const result = buildResult(dynamic.name, dynamic.symbolic, dynamic, computed, {
      searchUsed: dynamic.searchUsed,
    });
    res.json({ status: "success", result });
  } catch (err: any) {
    logger.error({ err }, "calculate route error");

    // Propagate user-friendly messages
    const isUserFacing =
      typeof err?.message === "string" &&
      (err.message.startsWith("Não foi") ||
        err.message.startsWith("Erro ao") ||
        err.message.startsWith("O resultado"));

    res.status(500).json({
      error: isUserFacing
        ? err.message
        : "Falha ao processar o cálculo. Tente novamente.",
    });
  }
});

export default router;
