/* ═══════════════════════════════════════════════════════
   objectiveAgent — Fase 5c
   Gera uma descrição objetiva e técnica do cálculo realizado,
   para exibir no overlay de detalhes acima da seção de fórmula.
   É diferente da resposta conversacional: é uma contextualização
   precisa do que foi calculado, com os valores envolvidos.
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";
import type { ExpressionResult, FormulaInfo } from "./types";

const SYSTEM_PROMPT = `Você é um motor de descrição matemática. Dada uma solicitação de cálculo e seus dados, escreva UMA FRASE que descreve objetivamente o que está sendo calculado.

REGRAS:
- Comece sempre com o VERBO no infinitivo: "Calcular", "Obter", "Determinar", "Encontrar", "Converter"
- Inclua os valores concretos envolvidos no cálculo
- Seja técnico e preciso, mas legível — como um enunciado de problema matemático
- Máximo 30 palavras
- Sem markdown, sem aspas, sem emojis, sem ponto final
- NÃO use "Objetivo:" como prefixo — apenas a frase em si
- NÃO mencione o nome da fórmula pelo nome técnico se ele não ajudar a entender
- NÃO repita a resposta conversacional — seja mais técnico e direto

EXEMPLOS CORRETOS:
- "Calcular o número de dias entre 08/05/2026 e 01/01/0001"
- "Obter o resultado de 1 multiplicado por 2"
- "Determinar a área de um círculo com raio de 5 cm"
- "Converter 100 km/h para metros por segundo"
- "Calcular o montante final de R$ 1.000,00 aplicados a 1% ao mês por 12 meses"
- "Encontrar a velocidade média percorrendo 120 km em 1,5 hora"
- "Calcular a força resultante sobre um objeto de 10 kg com aceleração de 3 m/s²"

EXEMPLOS ERRADOS:
- "Objetivo: Calcular..." (não use prefixo)
- "O usuário quer calcular..." (não fale do usuário)
- "A fórmula de juros compostos..." (não cite nome da fórmula como primazia)`;

export async function runObjectiveAgent(opts: {
  query: string;
  formula: FormulaInfo;
  expressionResult: ExpressionResult;
  computedValue: number;
}): Promise<string> {
  const { query, formula, expressionResult, computedValue } = opts;

  const isPercent = expressionResult.resultUnit === "%";
  const displayValue = isPercent ? computedValue * 100 : computedValue;
  const formattedResult = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 4,
  }).format(displayValue);
  const resultWithUnit = expressionResult.resultUnit
    ? `${formattedResult} ${expressionResult.resultUnit}`
    : formattedResult;

  const varDesc = Object.entries(expressionResult.variableValues)
    .filter(([sym]) => sym !== expressionResult.solveFor)
    .map(([sym, val]) => {
      const name = expressionResult.variableNames[sym] ?? sym;
      return `${name} = ${val}`;
    })
    .join(", ");

  const userContent = [
    `Solicitação original: ${query}`,
    `Fórmula/operação: ${formula.name}`,
    varDesc ? `Valores usados: ${varDesc}` : "",
    `Resultado: ${expressionResult.resultLabel || expressionResult.solveFor} = ${resultWithUnit}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 80,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    } as any);

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    if (!text) throw new Error("empty response");

    logger.debug({ formulaName: formula.name }, "objectiveAgent: objective generated");
    return text;
  } catch (err) {
    logger.warn({ err }, "objectiveAgent: failed, using fallback");
    return buildFallback(formula, expressionResult, resultWithUnit);
  }
}

function buildFallback(
  formula: FormulaInfo,
  expressionResult: ExpressionResult,
  resultWithUnit: string
): string {
  const varDesc = Object.entries(expressionResult.variableValues)
    .filter(([sym]) => sym !== expressionResult.solveFor)
    .map(([sym, val]) => {
      const name = expressionResult.variableNames[sym] ?? sym;
      return `${name} = ${val}`;
    })
    .join(", ");

  if (varDesc) {
    return `Calcular ${formula.name.toLowerCase()} com ${varDesc}`;
  }
  return `Calcular ${formula.name.toLowerCase()} — resultado: ${resultWithUnit}`;
}
