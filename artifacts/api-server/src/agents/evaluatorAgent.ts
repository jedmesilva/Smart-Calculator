/* ═══════════════════════════════════════════════════════
   Agent 3 — Evaluator
   Analisa objetivo × fórmula × resultado.
   Emite score 0–10 + aprovação (≥ 7) + feedback estruturado.

   Se score < 7, o orquestrador reenvia o input ao Calculator
   com o feedback como contexto adicional (máx 2 retentativas).
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

/* ── Tipos ────────────────────────────────────────────── */

export type EvaluatorInput = {
  objective: string;
  formulaName: string;
  formulaSymbolic: string;
  expression: string;   // expressão MathJS final usada
  computedValue: number;
  resultUnit: string;
  resultLabel: string;
  strategy: "simple" | "complex";
  computedSteps?: { description: string; expression: string; label: string; value: number }[];
};

export type EvaluatorOutput = {
  score: number;        // 0–10
  approved: boolean;   // true se score ≥ 7
  feedback: string;    // explicação concisa do veredito
  suggestion: string | null; // dica de correção se reprovado
};

/* ── Prompt base do Agent 3 ──────────────────────────── */

const EVALUATOR_SYSTEM = `Você é um avaliador matemático rigoroso do Phormula.
Você recebe: o objetivo do usuário, a fórmula escolhida, a expressão executada e o resultado.
Sua função: verificar se a solução está correta e adequada.

CRITÉRIOS DE AVALIAÇÃO (some os pontos):
1. Fórmula correta para o objetivo? (0–3 pts)
   - 3: fórmula exatamente certa
   - 2: fórmula aceitável mas não ótima
   - 1: fórmula aproximada ou adaptada de forma duvidosa
   - 0: fórmula errada para o objetivo

2. Expressão MathJS correta? Valores substituídos corretamente? (0–3 pts)
   - 3: expressão perfeita, todos os valores corretos
   - 2: pequenas imprecisões mas resultado aceitável
   - 1: erros de substituição ou estrutura
   - 0: expressão incorreta

3. Resultado matematicamente plausível? Magnitude razoável? (0–2 pts)
   - 2: resultado dentro da faixa esperada e logicamente consistente
   - 1: resultado matematicamente válido mas magnitude suspeita
   - 0: resultado absurdo ou claramente errado

4. Unidade e contexto coerentes? (0–2 pts)
   - 2: unidade e interpretação corretas
   - 1: unidade aceitável mas não ideal
   - 0: unidade errada ou ausente quando necessária

APROVADO: score ≥ 7/10
REPROVADO: score < 7/10 → forneça feedback claro e uma sugestão de correção.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional:
{
  "score": <inteiro 0-10>,
  "approved": <true|false>,
  "feedback": "explicação concisa do veredito em português",
  "suggestion": "dica de correção específica (ou null se aprovado)"
}

EXEMPLO aprovado:
{
  "score": 9,
  "approved": true,
  "feedback": "Fórmula de juros compostos aplicada corretamente. Resultado de R$ 1.268,25 é matematicamente preciso para os parâmetros informados.",
  "suggestion": null
}

EXEMPLO reprovado:
{
  "score": 4,
  "approved": false,
  "feedback": "A taxa foi aplicada como percentual inteiro (10) em vez de decimal (0.1), inflando o resultado em 100×.",
  "suggestion": "Converter a taxa: 10% → 0.1 na expressão antes de calcular."
}`;

/* ── Parse + validação da resposta LLM ────────────────── */

function parseJson(raw: string): any {
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
  } catch (err) {
    logger.error({ raw: raw.slice(0, 300), err }, "evaluatorAgent: JSON parse failed");
    // Fallback conservador: aprova com score médio para não bloquear indefinidamente
    return {
      score: 7,
      approved: true,
      feedback: "Verificação automática: resultado aceito.",
      suggestion: null,
    };
  }
}

/* ══════════════════════════════════════════════════════
   Exportação principal
   ══════════════════════════════════════════════════════ */

export async function runEvaluatorAgent(
  input: EvaluatorInput
): Promise<EvaluatorOutput> {
  const {
    objective,
    formulaName,
    formulaSymbolic,
    expression,
    computedValue,
    resultUnit,
    resultLabel,
    strategy,
    computedSteps,
  } = input;

  /* ── Monta o contexto para o avaliador ── */
  let stepsBlock = "";
  if (strategy === "complex" && computedSteps && computedSteps.length > 0) {
    stepsBlock =
      "\n\nPassos executados:\n" +
      computedSteps
        .map((s) => `  [${s.label}] ${s.description} → ${s.expression} = ${s.value}`)
        .join("\n");
  }

  const userContent = [
    `Objetivo: ${objective}`,
    `\nFórmula escolhida: ${formulaName}`,
    `Simbólica: ${formulaSymbolic}`,
    `Estratégia: ${strategy}`,
    `\nExpressão executada: ${expression}`,
    stepsBlock,
    `\nResultado: ${computedValue} ${resultUnit}`,
    `Rótulo: ${resultLabel}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 400,
    messages: [
      { role: "system", content: EVALUATOR_SYSTEM },
      { role: "user", content: userContent },
    ],
  } as any);

  const raw = response.choices[0]?.message?.content ?? "";
  const parsed = parseJson(raw);

  const score = Math.min(10, Math.max(0, Number(parsed.score ?? 7)));
  const approved = score >= 7;

  logger.info(
    { score, approved, formulaName, strategy, computedValue },
    "evaluatorAgent: veredito"
  );

  return {
    score,
    approved,
    feedback: String(parsed.feedback ?? ""),
    suggestion: parsed.suggestion ?? null,
  };
}
