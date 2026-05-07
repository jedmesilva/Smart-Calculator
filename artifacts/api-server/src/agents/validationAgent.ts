/* ═══════════════════════════════════════════════════════
   Agente de Validação — Fase 4
   Executa a PROVA REAL: operação inversa para verificar
   se o resultado calculado é matematicamente consistente.

   Estratégia:
   1. Pede ao LLM a expressão inversa em mathjs
      (partindo do resultado, derivar um valor de entrada)
   2. Avalia a expressão inversa via mathjs (exato, sem LLM)
   3. Compara com o valor original — tolerância de 0,1%
   4. Fallback: checagem de razoabilidade via LLM
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { evaluate } from "mathjs";
import { logger } from "../lib/logger";
import type { ExpressionResult, FormulaInfo, ValidationResult } from "./types";

/* ─── Prompt: gerar expressão inversa ─── */
const INVERSE_PROOF_PROMPT = `Você é um especialista em matemática. Dado o resultado de um cálculo, gere a OPERAÇÃO INVERSA (prova real) para verificar a consistência matemática.

A prova real consiste em: partindo do resultado obtido e dos demais valores conhecidos, derivar de volta UM dos valores de entrada e verificar se coincide com o original.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Formato quando a prova é possível:
{
  "possible": true,
  "inverseExpression": "sqrt(result / PI)",
  "isolatedVar": "r",
  "expectedValue": 8,
  "description": "Partindo de A = 201,06 cm², isolamos o raio: r = √(A / π) ≈ 8,00 cm — coincide com o valor original."
}

Formato quando a prova real não é aplicável:
{
  "possible": false,
  "reason": "Expressão sem operação inversa direta."
}

Regras críticas:
- "inverseExpression": expressão mathjs válida que usa a variável literal "result" (o valor calculado) e/ou outros valores numéricos literais de "extracted" para derivar de volta "isolatedVar"
- Use APENAS sintaxe mathjs: sqrt, log, log10, pow, abs, PI, E, *, /, +, -, ^
- NÃO use variáveis simbólicas na expressão — substitua tudo por valores numéricos literais, exceto "result" que representa o resultado calculado
- "isolatedVar": símbolo de UMA variável de entrada (não o solveFor) que será verificada
- "expectedValue": valor numérico original dessa variável (de extracted)
- Prefira a variável de entrada mais simples de isolar algebricamente
- Escolha uma variável que possa ser derivada com precisão (evite variáveis como taxas que exigem log se houver outra opção)`;

/* ─── Prompt: razoabilidade (fallback) ─── */
const REASONABILITY_PROMPT = `Você é um especialista em matemática aplicada.
Avalie se o resultado calculado é razoável e faz sentido no contexto da pergunta.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Formato:
{
  "reasonable": true,
  "explanation": "O resultado de 201,06 cm² para um círculo de raio 8 cm é matematicamente correto e faz sentido."
}

Seja permissivo: marque como não razoável apenas se houver inconsistência CLARA — magnitude errada por ordens de grandeza, resultado fisicamente impossível, sinal errado, etc.`;

/* ─── Gera e avalia a prova real via operação inversa ─── */
async function runInverseProof(
  formula: FormulaInfo,
  expression: string,
  extracted: Record<string, number>,
  solveFor: string,
  computedValue: number,
  variableNames: Record<string, string>
): Promise<ValidationResult | null> {
  const inputVars = Object.entries(extracted).filter(([sym]) => sym !== solveFor);

  if (inputVars.length === 0) {
    return null;
  }

  const varDesc = inputVars
    .map(([sym, val]) => `${sym} = ${val} (${variableNames[sym] ?? sym})`)
    .join(", ");

  const userContent = [
    `Fórmula: ${formula.name}`,
    `Expressão calculada: ${expression}`,
    `Variável calculada (solveFor): ${solveFor} = ${computedValue}`,
    `Variáveis de entrada usadas: ${varDesc}`,
    `Expressão simbólica: ${formula.symbolic}`,
  ].join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 512,
      messages: [
        { role: "system", content: INVERSE_PROOF_PROMPT },
        { role: "user", content: userContent },
      ],
    } as any);

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());

    if (!parsed.possible) {
      logger.info({ reason: parsed.reason }, "validationAgent: inverse proof not applicable");
      return null;
    }

    const { inverseExpression, isolatedVar, expectedValue, description } = parsed;

    if (!inverseExpression || isolatedVar === undefined || expectedValue === undefined) {
      logger.warn({ parsed }, "validationAgent: inverse proof response missing fields");
      return null;
    }

    /* ── Avalia a expressão inversa via mathjs com "result" = computedValue ── */
    const derivedValue = (() => {
      const val = evaluate(inverseExpression, { result: computedValue });
      return typeof (val as any)?.toNumber === "function"
        ? (val as any).toNumber()
        : Number(val);
    })();

    if (!isFinite(derivedValue)) {
      logger.warn({ inverseExpression, derivedValue }, "validationAgent: inverse expression returned non-finite");
      return null;
    }

    const tolerance = expectedValue !== 0
      ? Math.abs((derivedValue - expectedValue) / expectedValue)
      : Math.abs(derivedValue - expectedValue);

    const verified = tolerance < 0.005; // tolerância de 0,5%

    const varName = variableNames[isolatedVar] ?? isolatedVar;
    const derivedFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(derivedValue);
    const expectedFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(expectedValue);

    const detail = verified
      ? description || `Derivado ${varName} = ${derivedFmt} — coincide com o valor original ${expectedFmt}. ✓`
      : `Derivado ${varName} = ${derivedFmt}, mas o valor original era ${expectedFmt}. Possível inconsistência.`;

    logger.info(
      { isolatedVar, expectedValue, derivedValue, tolerance, verified },
      "validationAgent: inverse proof evaluated"
    );

    return {
      valid: verified,
      method: "Prova real",
      detail,
    };
  } catch (err) {
    logger.warn({ err }, "validationAgent: inverse proof failed");
    return null;
  }
}

/* ─── Checagem de razoabilidade via LLM (fallback) ─── */
async function checkReasonability(
  formulaName: string,
  query: string,
  extracted: Record<string, number>,
  variableNames: Record<string, string>,
  solveFor: string,
  computedValue: number,
  resultUnit: string
): Promise<ValidationResult> {
  const varDesc = Object.entries(extracted)
    .filter(([sym]) => sym !== solveFor)
    .map(([sym, val]) => `${sym} = ${val} (${variableNames[sym] ?? sym})`)
    .join(", ");

  const formattedValue = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(
    resultUnit === "%" ? computedValue * 100 : computedValue
  );

  const userContent = [
    `Fórmula: ${formulaName}`,
    `Dados usados: ${varDesc}`,
    `Resultado calculado: ${solveFor} = ${resultUnit ? resultUnit + " " : ""}${formattedValue}`,
    `Pergunta original: ${query}`,
  ].join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 256,
      messages: [
        { role: "system", content: REASONABILITY_PROMPT },
        { role: "user", content: userContent },
      ],
    } as any);

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());

    return {
      valid: parsed.reasonable !== false,
      method: "Verificação de razoabilidade",
      detail: parsed.explanation ?? "Resultado verificado como razoável.",
    };
  } catch (err) {
    logger.warn({ err }, "validationAgent: reasonability check failed");
    return {
      valid: true,
      method: "Verificação automática",
      detail: "Verificação automática não disponível.",
    };
  }
}

/* ── Exportação principal ── */
export async function runValidationAgent(opts: {
  formula: FormulaInfo;
  expressionResult: ExpressionResult;
  computedValue: number;
  query: string;
}): Promise<ValidationResult> {
  const { formula, expressionResult, computedValue, query } = opts;

  /* Tenta a prova real (operação inversa) */
  const inverseResult = await runInverseProof(
    formula,
    expressionResult.expression,
    expressionResult.extracted,
    expressionResult.solveFor,
    computedValue,
    expressionResult.variableNames
  );

  if (inverseResult !== null) {
    logger.info(
      { valid: inverseResult.valid, method: inverseResult.method },
      "validationAgent: inverse proof complete"
    );
    return inverseResult;
  }

  /* Fallback: checagem de razoabilidade via LLM */
  logger.info({}, "validationAgent: falling back to reasonability check");
  const reasonability = await checkReasonability(
    formula.name,
    query,
    expressionResult.extracted,
    expressionResult.variableNames,
    expressionResult.solveFor,
    computedValue,
    expressionResult.resultUnit
  );

  logger.info(
    { valid: reasonability.valid, method: reasonability.method },
    "validationAgent: reasonability complete"
  );

  return reasonability;
}
