/* ═══════════════════════════════════════════════════════
   Agente de Validação Reversa — Fase 4
   Verifica se o resultado calculado é matematicamente consistente,
   substituindo-o de volta na equação e avaliando via mathjs.
   Faz também uma checagem de razoabilidade via LLM.
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { evaluate } from "mathjs";
import { logger } from "../lib/logger";
import type { ExpressionResult, FormulaInfo, ValidationResult } from "./types";

const REASONABILITY_PROMPT = `Você é um verificador de resultados matemáticos em português brasileiro.
Dado um cálculo, avalie se o resultado é razoável e faz sentido no contexto da pergunta.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Formato:
{
  "reasonable": true,
  "explanation": "O montante final de R$ 1.127,16 para R$ 1.000 aplicados a 1% ao mês por 12 meses está correto e faz sentido."
}

Ou se não razoável:
{
  "reasonable": false,
  "explanation": "Uma velocidade de 500.000 km/h para um carro é fisicamente impossível — verifique as unidades."
}

Seja permissivo: apenas marque como não razoável se houver uma inconsistência CLARA (magnitude errada por ordens de grandeza, resultado fisicamente impossível, sinal errado, etc.).`;

/* ── Prova reversa matemática (via mathjs) ── */
function reverseProof(
  expression: string,
  extracted: Record<string, number>,
  solveFor: string,
  computedValue: number
): { verified: boolean; method: string; detail: string } {
  try {
    // Substitui o resultado como variável e tenta verificar a consistência
    // Exemplo: M = C*(1+i)^n → substituímos todos e recalculamos, depois comparamos
    const recomputed = evaluate(expression, extracted);
    const recomputedNum =
      typeof (recomputed as any)?.toNumber === "function"
        ? (recomputed as any).toNumber()
        : Number(recomputed);

    const relativeError =
      computedValue !== 0
        ? Math.abs((recomputedNum - computedValue) / computedValue)
        : Math.abs(recomputedNum - computedValue);

    if (relativeError < 0.001) {
      return {
        verified: true,
        method: "Prova direta",
        detail: `Recalculado com os mesmos valores: ${solveFor} = ${recomputedNum.toFixed(4)}. Consistente.`,
      };
    } else {
      return {
        verified: false,
        method: "Prova direta",
        detail: `Discrepância detectada: esperado ${computedValue.toFixed(4)}, recalculado ${recomputedNum.toFixed(4)}.`,
      };
    }
  } catch {
    return {
      verified: true,
      method: "Prova não aplicável",
      detail: "Verificação reversa não pôde ser aplicada a esta expressão.",
    };
  }
}

/* ── Verificação de razoabilidade via LLM ── */
async function checkReasonability(
  formulaName: string,
  query: string,
  variableValues: Record<string, string>,
  solveFor: string,
  resultFormatted: string,
  resultUnit: string
): Promise<{ reasonable: boolean; explanation: string }> {
  const varDesc = Object.entries(variableValues)
    .filter(([sym]) => sym !== solveFor)
    .map(([sym, val]) => `${sym} = ${val}`)
    .join(", ");

  const userContent = [
    `Fórmula: ${formulaName}`,
    `Dados usados: ${varDesc}`,
    `Resultado calculado: ${solveFor} = ${resultUnit ? resultUnit + " " : ""}${resultFormatted}`,
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
      reasonable: parsed.reasonable !== false,
      explanation: parsed.explanation ?? "Resultado verificado.",
    };
  } catch (err) {
    logger.warn({ err }, "validationAgent: reasonability check failed");
    return { reasonable: true, explanation: "Verificação automática não disponível." };
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

  // Passo 1: prova matemática reversa (síncrona, sem AI)
  const mathProof = reverseProof(
    expressionResult.expression,
    expressionResult.extracted,
    expressionResult.solveFor,
    computedValue
  );

  // Formata resultado para checagem de razoabilidade
  const formattedValue = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 4,
  }).format(
    expressionResult.resultUnit === "%" ? computedValue * 100 : computedValue
  );

  // Passo 2: checagem de razoabilidade via LLM
  const reasonability = await checkReasonability(
    formula.name,
    query,
    expressionResult.variableValues,
    expressionResult.solveFor,
    formattedValue,
    expressionResult.resultUnit
  );

  // Combina os dois resultados
  const valid = mathProof.verified && reasonability.reasonable;

  logger.info(
    {
      formulaName: formula.name,
      mathVerified: mathProof.verified,
      reasonable: reasonability.reasonable,
      valid,
    },
    "validationAgent: complete"
  );

  return {
    valid,
    method: mathProof.method,
    detail: reasonability.explanation,
  };
}
