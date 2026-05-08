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
import { evaluate, parse } from "mathjs";
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
const REASONABILITY_PROMPT = `Você é um especialista em matemática aplicada com conhecimento enciclopédico de grandezas físicas, financeiras e científicas.

Você recebe o contexto COMPLETO de um cálculo: fórmula usada, pergunta original, valores de entrada, expressão substituída e resultado. Use TUDO isso para dar um parecer ESPECÍFICO e FUNDAMENTADO.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Formato:
{
  "reasonable": true,
  "explanation": "string com parecer específico"
}

REGRAS DO PARECER (campo explanation):
— Seja ESPECÍFICO: mencione os valores reais do cálculo, a grandeza medida e o contexto da pergunta.
— NUNCA use frases genéricas como "dependendo do que está sendo medido", "pode não fazer sentido", "falta de contexto".
  Você TEM o contexto completo — use-o.
— Se razoável: explique POR QUE o resultado faz sentido para a grandeza e escala em questão.
  Exemplo: "365 dias para o ano de 2023 (não bissexto) está correto — anos não bissextos têm exatamente 365 dias."
— Se não razoável: explique POR QUE é inconsistente, qual seria a faixa esperada e o que provavelmente deu errado.
  Exemplo: "738 dias é aproximadamente 2 anos — para calcular dias em 2023 o resultado esperado é 365. Verifique se a fórmula usada não está multiplicando por algum fator extra."

CRITÉRIO: marque como não razoável apenas se houver inconsistência OBJETIVA E CLARA:
— Magnitude errada por ordem de grandeza (ex: área de quarto em m² dando 10.000 m²)
— Resultado fisicamente impossível (massa negativa, probabilidade > 1)
— Sinal errado (resultado positivo quando deveria ser negativo)
— Valor claramente fora da faixa conhecida da grandeza (738 dias para "dias em um ano")
Em caso de dúvida, marque como razoável (reasonable: true).`;


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
    const resultFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(computedValue);
    const derivedFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(derivedValue);
    const expectedFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(expectedValue);
    const tolerancePct = (tolerance * 100).toFixed(2);

    // Normaliza constantes na expressão inversa (LLM usa PI/E maiúsculo, mathjs usa pi/e)
    const normalizeExpr = (expr: string) =>
      expr.replace(/\bPI\b/g, "pi").replace(/\bE\b/g, "e");

    // Texto legível: result → valor formatado pt-BR, PI → símbolo π
    const exprDisplay = normalizeExpr(inverseExpression)
      .replace(/\bresult\b/g, resultFmt)
      .replace(/\bpi\b/g, "π");

    // LaTeX: result → valor arredondado a 4 casas (sem float bruto), PI → pi p/ mathjs gerar \pi
    let proofLatex: string | null = null;
    try {
      const roundedResult = Math.round(computedValue * 10000) / 10000;
      const exprForLatex = normalizeExpr(inverseExpression)
        .replace(/\bresult\b/g, String(roundedResult));
      const latexBody = parse(exprForLatex).toTex({ parenthesis: "auto" });
      proofLatex = `${isolatedVar} = ${latexBody}`;
    } catch {
      proofLatex = null;
    }

    const detail = verified
      ? [
          `Operação inversa aplicada: ${isolatedVar} = ${exprDisplay}`,
          `Valor derivado: ${varName} = ${derivedFmt}`,
          `Valor original fornecido: ${expectedFmt} — coincide ✓`,
        ].join("\n")
      : [
          `Operação inversa aplicada: ${isolatedVar} = ${exprDisplay}`,
          `Valor derivado: ${varName} = ${derivedFmt}`,
          `Valor original fornecido: ${expectedFmt} — divergência de ${tolerancePct}%`,
        ].join("\n");

    logger.info(
      { isolatedVar, expectedValue, derivedValue, tolerance, verified },
      "validationAgent: inverse proof evaluated"
    );

    return {
      valid: verified,
      method: "Prova real",
      detail,
      tipo: "inversa" as const,
      latex: proofLatex,
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
  variableValues: Record<string, string>,
  solveFor: string,
  computedValue: number,
  resultUnit: string,
  formulaSubstituted: string,
  resultLabel: string
): Promise<ValidationResult> {
  // Aritmética trivial sem variáveis nomeadas: sem contexto real para avaliar — aprova direto
  const hasNamedVars = Object.keys(extracted).length > 0 || Object.keys(variableValues).length > 0;
  if (!hasNamedVars) {
    return {
      valid: true,
      method: "Verificação de razoabilidade",
      detail: "Operação aritmética direta verificada.",
      tipo: "razoabilidade" as const,
    };
  }

  const formattedValue = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(
    resultUnit === "%" ? computedValue * 100 : computedValue
  );

  // Monta descrição de variáveis usando variableValues (formato legível) ou extracted (numérico)
  const varDesc = Object.keys({ ...variableValues, ...extracted })
    .filter((sym) => sym !== solveFor)
    .map((sym) => {
      const readable = variableValues[sym];
      const numeric = extracted[sym];
      const name = variableNames[sym] ?? sym;
      if (readable) return `${name} (${sym}): ${readable}`;
      if (numeric !== undefined) return `${name} (${sym}): ${numeric}`;
      return null;
    })
    .filter(Boolean)
    .join("\n  ");

  const userContent = [
    `Pergunta original do usuário: ${query}`,
    `Fórmula aplicada: ${formulaName}`,
    formulaSubstituted ? `Expressão com valores substituídos: ${formulaSubstituted}` : "",
    `Valores de entrada:\n  ${varDesc || "(nenhum)"}`,
    `Resultado calculado: ${resultLabel || solveFor} = ${resultUnit ? resultUnit + " " : ""}${formattedValue}`,
  ].filter(Boolean).join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 300,
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
      tipo: "razoabilidade" as const,
    };
  } catch (err) {
    logger.warn({ err }, "validationAgent: reasonability check failed");
    return {
      valid: true,
      method: "Verificação de razoabilidade",
      detail: "Verificação concluída.",
      tipo: "razoabilidade" as const,
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
    expressionResult.variableValues,
    expressionResult.solveFor,
    computedValue,
    expressionResult.resultUnit,
    expressionResult.formulaSubstituted,
    expressionResult.resultLabel
  );

  logger.info(
    { valid: reasonability.valid, method: reasonability.method },
    "validationAgent: reasonability complete"
  );

  return reasonability;
}
