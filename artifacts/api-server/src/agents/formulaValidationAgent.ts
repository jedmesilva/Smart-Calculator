/* ═══════════════════════════════════════════════════════
   Agente de Validação de Fórmula — fluxo separado
   Disparado ao criar/publicar uma nova fórmula.
   Testa a expressão MathJS com valores de exemplo e
   verifica se o resultado faz sentido.
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { evaluate } from "mathjs";
import { logger } from "../lib/logger";
import type { FormulaValidationResult } from "./types";

const GENERATE_TEST_VALUES_PROMPT = `Você é um especialista em matemática. Dado uma fórmula, gere valores de teste simples e conhecidos para verificar se a expressão mathjs está correta.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Formato:
{
  "testValues": { "C": 1000, "i": 0.01, "n": 1 },
  "expectedResult": 1010,
  "explanation": "Capital de 1000 a 1% por 1 período deve resultar em 1010"
}

Regras:
- Use valores SIMPLES que resultem em um número esperado fácil de verificar mentalmente
- "expectedResult": valor numérico exato esperado
- "testValues": objeto com os valores numéricos para cada variável da expressão`;

const EVALUATE_FORMULA_PROMPT = `Você é um especialista em verificação de fórmulas matemáticas.
Analise se a fórmula fornecida está correta, completa e bem definida.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Formato:
{
  "approved": true,
  "issues": [],
  "suggestions": ["Considere adicionar um exemplo de uso na descrição"]
}

Ou se houver problemas:
{
  "approved": false,
  "issues": [
    "A expressão usa 'x' mas as variáveis definem 'X' (maiúscula) — inconsistência de símbolo",
    "Falta a variável 'n' na lista de variáveis mas ela aparece na expressão"
  ],
  "suggestions": [
    "Corrija o símbolo 'x' para 'X' na expressão",
    "Adicione a variável 'n' com nome e descrição"
  ]
}

Verifique:
1. Todos os símbolos na expressão estão definidos nas variáveis
2. Não há símbolos undefined (exceto constantes mathjs: PI, E, sqrt, log, abs, etc.)
3. A expressão é sintaxe mathjs válida
4. O resultado esperado bate com a expressão
5. A unidade do resultado faz sentido para a fórmula`;

function parseJson(raw: string, ctx: string): any {
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
  } catch {
    logger.warn({ raw }, `formulaValidationAgent[${ctx}]: parse failed`);
    return null;
  }
}

export async function runFormulaValidationAgent(formula: {
  name: string;
  description: string;
  symbolic: string;
  category: string;
  expression: string;
  solveFor: string;
  resultUnit: string;
  resultLabel: string;
  variables: { symbol: string; name: string; description: string }[];
}): Promise<FormulaValidationResult> {
  const issues: string[] = [];
  const suggestions: string[] = [];

  /* ── Passo 1: verifica símbolos da expressão vs variáveis definidas ── */
  const MATHJS_BUILTINS = new Set([
    "PI", "E", "sqrt", "log", "log2", "log10", "abs", "sin", "cos", "tan",
    "asin", "acos", "atan", "atan2", "ceil", "floor", "round", "pow",
    "exp", "sign", "max", "min", "mod",
  ]);

  const definedSymbols = new Set([
    ...formula.variables.map((v) => v.symbol),
    formula.solveFor,
  ]);

  // Extrai identificadores da expressão (simplificado — exclui números e operadores)
  const identifiers = formula.expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
  for (const id of identifiers) {
    if (!definedSymbols.has(id) && !MATHJS_BUILTINS.has(id)) {
      issues.push(`Símbolo '${id}' usado na expressão mas não está definido nas variáveis.`);
    }
  }

  /* ── Passo 2: gera valores de teste via LLM ── */
  const varList = formula.variables
    .map((v) => `${v.symbol} (${v.name}): ${v.description}`)
    .join(", ");

  const testValuesResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 512,
    messages: [
      { role: "system", content: GENERATE_TEST_VALUES_PROMPT },
      {
        role: "user",
        content: `Fórmula: ${formula.name}\nExpressão mathjs: ${formula.expression}\nVariáveis: ${varList}\nResultado esperado (${formula.resultLabel}): em ${formula.resultUnit || "sem unidade"}`,
      },
    ],
  } as any);

  const testData = parseJson(
    testValuesResponse.choices[0]?.message?.content ?? "",
    "generate-test-values"
  );

  let testedValues: Record<string, number> | undefined;
  let testedResult: number | undefined;

  if (testData?.testValues) {
    testedValues = testData.testValues;

    /* ── Passo 3: executa expressão com valores de teste via mathjs ── */
    try {
      const raw = evaluate(formula.expression, testData.testValues);
      const num =
        typeof (raw as any)?.toNumber === "function"
          ? (raw as any).toNumber()
          : Number(raw);

      if (!isFinite(num)) {
        issues.push("A expressão produz resultado inválido (divisão por zero ou infinito) com valores de teste.");
      } else {
        testedResult = num;

        // Verifica se bate com o esperado (tolerância 0.1%)
        if (
          testData.expectedResult !== undefined &&
          Math.abs((num - testData.expectedResult) / (testData.expectedResult || 1)) > 0.001
        ) {
          issues.push(
            `Resultado com valores de teste: ${num.toFixed(4)}, mas esperado: ${testData.expectedResult}. Verifique a expressão.`
          );
        } else if (testData.expectedResult !== undefined) {
          logger.info(
            { expression: formula.expression, result: num, expected: testData.expectedResult },
            "formulaValidationAgent: test passed"
          );
        }
      }
    } catch (err: any) {
      issues.push(`Erro ao avaliar a expressão mathjs: ${err?.message ?? "sintaxe inválida"}`);
    }
  }

  /* ── Passo 4: avaliação qualitativa via LLM ── */
  const evalResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 512,
    messages: [
      { role: "system", content: EVALUATE_FORMULA_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          name: formula.name,
          description: formula.description,
          symbolic: formula.symbolic,
          expression: formula.expression,
          solveFor: formula.solveFor,
          resultUnit: formula.resultUnit,
          resultLabel: formula.resultLabel,
          variables: formula.variables,
          testValues: testedValues,
          testResult: testedResult,
        }),
      },
    ],
  } as any);

  const evalData = parseJson(
    evalResponse.choices[0]?.message?.content ?? "",
    "evaluate-formula"
  );

  if (evalData) {
    if (Array.isArray(evalData.issues)) issues.push(...evalData.issues);
    if (Array.isArray(evalData.suggestions)) suggestions.push(...evalData.suggestions);
  }

  const approved = issues.length === 0 && (evalData?.approved !== false);

  logger.info(
    { formulaName: formula.name, approved, issueCount: issues.length },
    "formulaValidationAgent: complete"
  );

  return { approved, issues, suggestions, testedValues, testedResult };
}
