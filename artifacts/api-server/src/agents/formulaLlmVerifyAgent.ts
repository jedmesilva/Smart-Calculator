/* ═══════════════════════════════════════════════════════
   formulaLlmVerifyAgent
   Verifica qualquer fórmula (com ou sem expressão mathjs).
   - Com expressão: teste numérico + avaliação qualitativa
   - Sem expressão: avaliação qualitativa da notação simbólica
   Retorna { verdict, detail }
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { evaluate } from "mathjs";
import { logger } from "../lib/logger";

const VERIFY_PROMPT = `Você é um especialista em matemática, física e finanças.
Analise a fórmula fornecida e determine se está correta, bem definida e útil.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Formato quando aprovada:
{ "verdict": "approved", "detail": "Fórmula clássica, matematicamente correta e amplamente usada." }

Formato quando sinalizada:
{ "verdict": "flagged", "detail": "A notação usa 'r' mas essa variável não está definida no simbólico." }

Verifique:
1. A notação simbólica é coerente com o nome e a categoria
2. Não há contradições ou inconsistências óbvias
3. A fórmula faz sentido matematicamente para o domínio indicado
4. Se expressão mathjs fornecida: os símbolos batem com o simbólico

Responda em português brasileiro. "detail" deve ter 1–2 frases concisas.`;

const TEST_VALUES_PROMPT = `Dado uma expressão mathjs, gere valores simples para testar numericamente.
RETORNE APENAS JSON VÁLIDO.
Formato: { "testValues": { "variavel": valor }, "expectedResult": numero }
Use valores que resultem em um número esperado simples e verificável mentalmente.`;

function safeParseJson(raw: string, fallback: any): any {
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
  } catch {
    return fallback;
  }
}

export async function runFormulaLlmVerify(formula: {
  name: string;
  description: string;
  symbolic: string;
  category: string;
  expression: string | null;
  expression_meta: any | null;
}): Promise<{ verdict: "approved" | "flagged"; detail: string }> {
  const numericIssues: string[] = [];

  /* ── Fase 1: teste numérico (apenas se tem expression + expression_meta) ── */
  if (formula.expression && formula.expression_meta) {
    const meta = formula.expression_meta as {
      variables?: { symbol: string; name: string }[];
      solveFor?: string;
    };
    const varList = (meta.variables ?? [])
      .map((v) => `${v.symbol} (${v.name})`)
      .join(", ");

    try {
      const testResp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 256,
        messages: [
          { role: "system", content: TEST_VALUES_PROMPT },
          {
            role: "user",
            content: `Fórmula: ${formula.name}\nExpressão mathjs: ${formula.expression}\nVariáveis: ${varList}`,
          },
        ],
      } as any);

      const testData = safeParseJson(
        testResp.choices[0]?.message?.content ?? "",
        null
      );

      if (testData?.testValues) {
        try {
          const raw = evaluate(formula.expression, testData.testValues);
          const num =
            typeof (raw as any)?.toNumber === "function"
              ? (raw as any).toNumber()
              : Number(raw);

          if (!isFinite(num)) {
            numericIssues.push(
              "A expressão produz resultado inválido (divisão por zero ou overflow) com valores de teste."
            );
          } else if (testData.expectedResult !== undefined) {
            const expected = Number(testData.expectedResult);
            const diff = Math.abs((num - expected) / (expected || 1));
            if (diff > 0.001) {
              numericIssues.push(
                `Resultado calculado (${num.toFixed(4)}) difere do esperado (${expected}) com valores de teste.`
              );
            }
          }
        } catch (evalErr: any) {
          numericIssues.push(
            `Erro ao avaliar a expressão mathjs: ${evalErr?.message ?? "sintaxe inválida"}.`
          );
        }
      }
    } catch (llmErr) {
      logger.warn({ llmErr }, "formulaLlmVerifyAgent: test-values LLM failed, skipping numeric check");
    }
  }

  /* ── Fase 2: avaliação qualitativa ── */
  const qualResp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 256,
    messages: [
      { role: "system", content: VERIFY_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          name: formula.name,
          description: formula.description,
          symbolic: formula.symbolic,
          category: formula.category,
          expression: formula.expression ?? "(sem expressão mathjs — verificação simbólica apenas)",
          numericIssues: numericIssues.length > 0 ? numericIssues : undefined,
        }),
      },
    ],
  } as any);

  const qualData = safeParseJson(
    qualResp.choices[0]?.message?.content ?? "",
    { verdict: "approved", detail: "Verificação concluída." }
  );

  /* ── Resolução final ── */
  const hasNumericProblems = numericIssues.length > 0;
  const verdict: "approved" | "flagged" =
    hasNumericProblems || qualData.verdict === "flagged" ? "flagged" : "approved";

  const detail = hasNumericProblems
    ? `${numericIssues[0]} ${qualData.detail ?? ""}`.trim()
    : (qualData.detail ?? "Fórmula verificada pela IA.");

  logger.info(
    { formulaName: formula.name, verdict, hasExpression: !!formula.expression },
    "formulaLlmVerifyAgent: complete"
  );

  return { verdict, detail };
}
