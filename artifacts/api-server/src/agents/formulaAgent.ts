/* ═══════════════════════════════════════════════════════
   Agente de Fórmula — Fase 1b
   - Modo fixo: busca no DB + valida se fórmula é adequada para a query
   - Modo dinâmico: LLM identifica a fórmula mais adequada
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { formulas } from "@workspace/db/schema";
import { eq, ilike } from "drizzle-orm";
import { logger } from "../lib/logger";
import type {
  ConversationMessage,
  FormulaAgentResult,
  FormulaInfo,
} from "./types";

/* ─── Prompt: identifica fórmula no modo dinâmico ─── */
const IDENTIFY_FORMULA_PROMPT = `Você é Phormula, especialista em todas as estruturas matemáticas do universo — aritmética, física, finanças, geometria, estatística e além.
Dado um problema em linguagem natural, identifique a fórmula mais adequada para resolvê-lo.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Formato de resposta:
{
  "found": true,
  "name": "Juros Compostos",
  "category": "Financeiro",
  "description": "Calcula o montante acumulado com juros compostos ao longo do tempo",
  "symbolic": "M = C × (1 + i)ⁿ",
  "confidence": "high"
}

Se não encontrar nenhuma fórmula adequada:
{ "found": false, "reason": "explicação em pt-BR" }

Regras:
- "confidence": "high" se clara, "medium" se razoável, "low" se incerta
- "name": nome em português, curto e preciso
- "category": uma de: Básico, Financeiro, Física, Geometria, Estatística, Saúde, Outro
- Analise TODO o contexto da conversa, não só a última mensagem
- IMPORTANTE: expressões aritméticas diretas (ex: "1 + 1", "5 × 3", "raiz de 16", "2 elevado a 10",
  "quanto é 15% de 200", conversões simples, etc.) são SEMPRE válidas — retorne found: true com:
  name: "Cálculo Direto", category: "Básico", symbolic: a expressão em notação matemática,
  description: "Avaliação direta da expressão matemática"
- CÁLCULO DIFERENCIAL E INTEGRAL: integrais, derivadas e limites são SEMPRE válidos:
  • "integral de f(x) de a a b", "∫f(x)dx", "calcule a integral" →
    name: "Integral Definida", category: "Básico",
    symbolic: "∫f(x)dx", description: "Cálculo numérico da integral definida"
  • "derivada de f(x) em x=a", "d/dx", "taxa de variação em" →
    name: "Derivada", category: "Básico",
    symbolic: "f'(x)", description: "Cálculo numérico da derivada em um ponto"
  • "limite de f(x) quando x tende a a" →
    name: "Limite", category: "Básico",
    symbolic: "lim f(x)", description: "Cálculo do limite de uma função"
- Só retorne found: false se a mensagem não contiver nenhuma intenção de cálculo matemático`;

/* ─── Prompt: valida se fórmula selecionada é adequada ─── */
const VALIDATE_FORMULA_PROMPT = `Você é Phormula, especialista em todas as estruturas matemáticas do universo.
O usuário selecionou uma fórmula específica e fez uma pergunta. Avalie se a fórmula selecionada é adequada para resolver o problema descrito.

RETORNE APENAS JSON VÁLIDO, sem markdown, sem texto adicional.

Formato de resposta se adequada:
{ "adequate": true }

Formato de resposta se inadequada:
{
  "adequate": false,
  "reason": "Por que não é adequada (em pt-BR, 1-2 frases)",
  "suggestion": "Nome da fórmula mais adequada, ou null"
}

Seja permissivo: se a fórmula é razoável para o contexto, retorne adequate: true.
Só retorne false se houver uma incompatibilidade clara e evidente.`;

function parseJson(raw: string, ctx: string): any {
  try {
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
  } catch (err) {
    logger.error({ raw, err }, `formulaAgent[${ctx}]: JSON parse failed`);
    throw new Error("Não foi possível identificar a fórmula para este cálculo.");
  }
}

/* ── Modo dinâmico: identifica fórmula via LLM, depois enriquece com dados do DB ── */
async function identifyFormulaDynamic(
  query: string,
  context: ConversationMessage[]
): Promise<FormulaAgentResult> {
  const messages: any[] = [
    { role: "system", content: IDENTIFY_FORMULA_PROMPT },
    ...context.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: query },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 512,
    messages,
  } as any);

  const parsed = parseJson(
    response.choices[0]?.message?.content ?? "",
    "identify-dynamic"
  );

  if (!parsed.found) {
    return {
      status: "not_found",
      message:
        parsed.reason ??
        "Não foi possível identificar a fórmula adequada para este cálculo. Tente descrever com mais detalhes ou selecione uma fórmula específica.",
    };
  }

  // Tenta enriquecer com dados do DB (expression + expression_meta) pelo nome
  let dbFormula: { id: string; name: string; description: string; symbolic: string; category: string; expression: string | null; expression_meta: any } | undefined;
  try {
    const [match] = await db
      .select({
        id: formulas.id,
        name: formulas.name,
        description: formulas.description,
        symbolic: formulas.symbolic,
        category: formulas.category,
        expression: formulas.expression,
        expression_meta: formulas.expression_meta,
      })
      .from(formulas)
      .where(ilike(formulas.name, parsed.name))
      .limit(1);
    dbFormula = match;
    if (dbFormula) {
      logger.info({ name: dbFormula.name }, "formulaAgent: matched DB formula in dynamic mode");
    }
  } catch (err) {
    logger.warn({ err }, "formulaAgent: DB lookup failed in dynamic mode, using LLM-only result");
  }

  return {
    status: "found",
    formula: {
      id: dbFormula?.id ?? null,
      name: dbFormula?.name ?? parsed.name,
      description: dbFormula?.description ?? parsed.description ?? "",
      symbolic: dbFormula?.symbolic ?? parsed.symbolic ?? "",
      category: dbFormula?.category ?? parsed.category ?? "Outro",
      expression: dbFormula?.expression ?? null,
      expression_meta: dbFormula?.expression_meta ?? null,
    },
  };
}

/* ── Modo fixo: busca DB + valida adequação ── */
async function fetchAndValidateFormula(
  formulaId: string,
  query: string,
  context: ConversationMessage[]
): Promise<FormulaAgentResult> {
  const [formula] = await db
    .select({
      id: formulas.id,
      name: formulas.name,
      description: formulas.description,
      symbolic: formulas.symbolic,
      category: formulas.category,
      expression: formulas.expression,
      expression_meta: formulas.expression_meta,
    })
    .from(formulas)
    .where(eq(formulas.id, formulaId))
    .limit(1);

  if (!formula) {
    logger.warn({ formulaId }, "formulaAgent: formula not found in DB");
    return {
      status: "not_found",
      message:
        "Fórmula não encontrada. Ela pode ter sido removida. Tente selecionar outra ou use o modo dinâmico.",
    };
  }

  const formulaInfo: FormulaInfo = {
    id: formula.id,
    name: formula.name,
    description: formula.description ?? "",
    symbolic: formula.symbolic,
    category: formula.category,
    expression: formula.expression ?? null,
    expression_meta: formula.expression_meta ?? null,
  };

  // Valida se a fórmula é adequada para a query (apenas se há contexto suficiente)
  if (query.length > 10 && context.length + 1 > 0) {
    try {
      const validationMessages: any[] = [
        { role: "system", content: VALIDATE_FORMULA_PROMPT },
        {
          role: "user",
          content: `Fórmula selecionada: ${formula.name} (${formula.symbolic})\nDescrição: ${formula.description}\n\nPergunta do usuário: ${query}`,
        },
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 256,
        messages: validationMessages,
      } as any);

      const validation = parseJson(
        response.choices[0]?.message?.content ?? "",
        "validate-formula"
      );

      if (validation.adequate === false) {
        logger.info(
          { formulaId, reason: validation.reason },
          "formulaAgent: selected formula not adequate"
        );
        return {
          status: "wrong_formula",
          message: `A fórmula "${formula.name}" pode não ser a mais adequada para esta pergunta. ${validation.reason}`,
          suggestion: validation.suggestion ?? null,
        };
      }
    } catch (err) {
      // Falha na validação não bloqueia — usamos a fórmula mesmo assim
      logger.warn({ err }, "formulaAgent: adequacy check failed, proceeding");
    }
  }

  return { status: "found", formula: formulaInfo };
}

/* ── Exportação principal ── */
export async function runFormulaAgent(
  formulaId: string | undefined,
  query: string,
  context: ConversationMessage[]
): Promise<FormulaAgentResult> {
  if (formulaId) {
    return fetchAndValidateFormula(formulaId, query, context);
  }
  return identifyFormulaDynamic(query, context);
}
