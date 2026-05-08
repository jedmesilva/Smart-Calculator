/* ═══════════════════════════════════════════════════════
   Orquestrador com Raciocínio em Tempo Real

   Um único LLM orquestrador que:
   - Raciocina em voz alta em português (streaming → emit)
   - Busca fórmulas via ferramenta (search_formula)
   - Executa o cálculo via ferramenta (compute)
   - Sinaliza valores ausentes (declare_missing)

   Depois que o LLM decide e calcula, o pipeline de resultados
   (validação + buildResult + explicação) roda exatamente como antes.
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { db } from "@workspace/db";
import { formulas } from "@workspace/db/schema";
import { ilike, or, eq } from "drizzle-orm";
import { logger } from "./logger";
import { computeFormula } from "./formulaCompute";
import { buildResult, buildDesenvolvimento } from "./explainBuilder";
import { runExpressionAgent } from "../agents/expressionAgent";
import { runValidationAgent } from "../agents/validationAgent";
import { runConversationalAgent } from "../agents/conversationalAgent";
import { runObjectiveAgent } from "../agents/objectiveAgent";
import { generateSessionSummary } from "./summaryBuilder";
import type {
  ConversationMessage,
  FormulaInfo,
  ContextAgentResult,
  ExpressionResult,
  RawEntity,
} from "../agents/types";
import type { ResultData } from "./explainBuilder";

const SUMMARY_EVERY = 8;

/* ══════════════════════════════════════════════════════
   Tipos do orquestrador
   ══════════════════════════════════════════════════════ */

export type OrchestratorSuccess = {
  status: "success";
  result: ResultData;
  capturedName?: string;
};
export type OrchestratorNeedsInput = {
  status: "needs_input";
  message: string;
  missing: { symbol: string; name: string; description: string }[];
};
export type OrchestratorConversational = {
  status: "conversational";
  message: string;
  capturedName?: string;
};
export type OrchestratorFormulaError = {
  status: "formula_error";
  message: string;
  suggestion?: string | null;
};
export type OrchestratorWrongFormula = {
  status: "wrong_formula";
  message: string;
  suggestion: string | null;
};

export type OrchestratorResult =
  | OrchestratorSuccess
  | OrchestratorNeedsInput
  | OrchestratorConversational
  | OrchestratorFormulaError
  | OrchestratorWrongFormula;

/* ══════════════════════════════════════════════════════
   Helpers de contexto (legado DB → ConversationMessage)
   ══════════════════════════════════════════════════════ */

function dbMessagesToContext(
  rows: Array<{ kind: string; text: string | null; result_data: any | null }>
): ConversationMessage[] {
  const out: ConversationMessage[] = [];
  for (const row of rows) {
    if (row.kind === "user" && row.text) {
      out.push({ role: "user", content: row.text });
    } else if (row.kind === "result" && row.result_data) {
      const r = row.result_data as any;
      const titulo = r.meta?.titulo ?? r.formulaName ?? "Cálculo";
      const valor = r.resultado?.valor ?? r.resultFormatted ?? "";
      const unidade = r.resultado?.unidade ?? r.resultUnit ?? "";
      const unit = unidade ? ` ${unidade}` : "";
      const base = `Resultado: ${titulo} = ${valor}${unit}`;
      const varList: any[] = Array.isArray(r.variaveis) ? r.variaveis : Array.isArray(r.variables) ? r.variables : [];
      const vars = varList.length > 0
        ? ` | Valores: ${varList.map((v: any) => `${v.descricao ?? v.name ?? ""}=${v.valor ?? v.value ?? ""}`).join(", ")}`
        : "";
      const formulaText = r.formula?.abstrata ?? r.formulaSubstituted ?? "";
      const expr = formulaText ? ` | Fórmula: ${formulaText}` : "";
      out.push({ role: "assistant", content: `${base}${vars}${expr}` });
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════
   Definição das ferramentas do orquestrador
   ══════════════════════════════════════════════════════ */

const THINKING_TOOLS: any[] = [
  {
    type: "function",
    function: {
      name: "search_formula",
      description:
        "Busca fórmulas matemáticas no banco de dados pelo nome ou descrição. Retorna as fórmulas encontradas com expressão e variáveis.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Nome ou palavras-chave da fórmula a buscar (ex: 'juros compostos', 'área círculo')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compute",
      description:
        "Executa o cálculo matemático com a fórmula identificada e os valores das variáveis. Use após identificar todos os valores.",
      parameters: {
        type: "object",
        properties: {
          formulaId: {
            type: "string",
            description: "ID da fórmula retornado por search_formula (se disponível)",
          },
          formulaName: { type: "string", description: "Nome da fórmula" },
          formulaSymbolic: { type: "string", description: "Expressão simbólica da fórmula (ex: M = C × (1 + i)^n)" },
          formulaCategory: { type: "string", description: "Categoria da fórmula" },
          formulaDescription: { type: "string", description: "Descrição da fórmula" },
          formulaExpression: {
            type: "string",
            description: "Expressão mathjs armazenada no banco (se disponível, usar exatamente esta)",
          },
          formulaMeta: {
            type: "object",
            description: "expression_meta da fórmula (solveFor, resultUnit, resultLabel, variables)",
          },
          extractedValues: {
            type: "object",
            description:
              "Objeto com os valores extraídos da conversa. Chaves são os símbolos das variáveis (ex: {C: 5000, i: 0.01, n: 12})",
            additionalProperties: { type: "number" },
          },
        },
        required: ["formulaName", "formulaSymbolic", "extractedValues"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "declare_missing",
      description:
        "Sinaliza que faltam valores necessários para completar o cálculo. Use quando o usuário não forneceu todos os dados.",
      parameters: {
        type: "object",
        properties: {
          missing: {
            type: "array",
            items: {
              type: "object",
              properties: {
                symbol: { type: "string", description: "Símbolo da variável (ex: n, r, t)" },
                name: { type: "string", description: "Nome legível (ex: Número de períodos)" },
                description: { type: "string", description: "Pergunta ao usuário (ex: Quantos meses de investimento?)" },
              },
              required: ["symbol", "name", "description"],
            },
          },
        },
        required: ["missing"],
      },
    },
  },
];

/* ══════════════════════════════════════════════════════
   Prompt do orquestrador
   ══════════════════════════════════════════════════════ */

function buildThinkingSystem(userName?: string): string {
  return `Você é Phormula, um motor de cálculo matemático que raciocina em voz alta em português brasileiro.

Você tem ferramentas para buscar fórmulas e executar cálculos. Use-as para resolver qualquer problema matemático.

COMO RACIOCINAR:
— Escreva seu raciocínio em português natural antes de cada ferramenta
— Seja específico: mencione os valores numéricos quando encontrá-los
— Explique brevemente por que está escolhendo a fórmula
— Após calcular, confirme se o resultado faz sentido
— Sem markdown: não use **, ##, -, *, etc.

FLUXO PARA CÁLCULOS COM FÓRMULA (juros, IMC, área, velocidade, etc.):
1. Entenda o que o usuário quer calcular (em voz alta)
2. Use search_formula para encontrar a fórmula correta no banco
3. Identifique em voz alta cada valor que o usuário forneceu e seu símbolo
4. Se faltam valores, use declare_missing
5. Use compute com todos os valores mapeados
6. Após o resultado, verifique rapidamente se faz sentido

REGRA ABSOLUTA — NUNCA calcule um número em texto:
Se a mensagem do usuário contém ou implica uma operação matemática, OBRIGATORIAMENTE use a ferramenta compute.
Jamais escreva o resultado numérico diretamente na sua resposta de texto.
Isso vale para QUALQUER complexidade: "1x2", "2+2", "raiz de 9", "5!", integrais, juros, IMC — tudo.
Violação desta regra = resultado aparece no lugar errado no app.

FLUXO PARA CÁLCULOS COM FÓRMULA (juros, IMC, área, velocidade, etc.):
1. Entenda o que o usuário quer calcular (em voz alta)
2. Use search_formula para encontrar a fórmula correta no banco
3. Identifique em voz alta cada valor que o usuário forneceu e seu símbolo
4. Se faltam valores, use declare_missing
5. Use compute com todos os valores mapeados
6. Após o resultado, verifique rapidamente se faz sentido

FLUXO PARA ARITMÉTICA SIMPLES (qualquer expressão com números e operadores):
— NÃO use search_formula
— Chame compute DIRETAMENTE com formulaName, formulaSymbolic e extractedValues
— O "x" minúsculo entre números significa multiplicação (ex: "1x2" = "1 × 2")
— Exemplos de notações que DEVEM usar compute:
  • "1x2", "3x4", "10x5"    → formulaSymbolic: "resultado = a * b", extractedValues: {"a": 1, "b": 2}
  • "2 + 2", "10 - 3"       → formulaSymbolic: "resultado = a + b", extractedValues: {"a": 2, "b": 2}
  • "2 mais 3"              → formulaSymbolic: "resultado = a + b", extractedValues: {"a": 2, "b": 3}
  • "100 / 4", "10÷2"       → formulaSymbolic: "resultado = a / b", extractedValues: {"a": 100, "b": 4}
  • "5 ao quadrado", "5^2"  → formulaSymbolic: "resultado = a ^ b", extractedValues: {"a": 5, "b": 2}
  • "raiz de 16", "√16"     → formulaSymbolic: "resultado = sqrt(a)", extractedValues: {"a": 16}
  • "5!"                    → formulaSymbolic: "resultado = factorial(a)", extractedValues: {"a": 5}

PARA CONVERSAÇÃO PURA (sem nenhum número ou operação matemática, ex: saudações, dúvidas conceituais):
Responda naturalmente sem usar ferramentas.${userName ? `\n\nNome do usuário: ${userName}.` : ""}`;
}

/* ══════════════════════════════════════════════════════
   Emissão de raciocínio por frases completas
   ══════════════════════════════════════════════════════ */

interface SentenceBuffer {
  text: string;
}

function processDelta(delta: string, buf: SentenceBuffer, emit: (s: string) => void) {
  buf.text += delta;
  // Emit on sentence boundaries: . ! ? … followed by space or newline
  const re = /[.!?…](?:\s|\n|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buf.text)) !== null) {
    const sentence = buf.text.slice(last, m.index + 1).trim();
    if (sentence.length >= 6) emit(sentence);
    last = m.index + m[0].length;
  }
  buf.text = buf.text.slice(last);
}

function flushBuffer(buf: SentenceBuffer, emit: (s: string) => void) {
  const t = buf.text.trim();
  if (t.length >= 4) emit(t);
  buf.text = "";
}

/* ══════════════════════════════════════════════════════
   Acumulação de tool call deltas
   ══════════════════════════════════════════════════════ */

interface ToolCallAccum {
  index: number;
  id: string;
  name: string;
  arguments: string;
}

function mergeToolCallDeltas(state: ToolCallAccum[], deltas: any[]) {
  for (const d of deltas) {
    const idx: number = d.index ?? 0;
    if (!state[idx]) {
      state[idx] = { index: idx, id: d.id ?? "", name: d.function?.name ?? "", arguments: d.function?.arguments ?? "" };
    } else {
      if (d.id) state[idx].id = d.id;
      if (d.function?.name) state[idx].name += d.function.name;
      if (d.function?.arguments) state[idx].arguments += d.function.arguments;
    }
  }
}

/* ══════════════════════════════════════════════════════
   Execução das ferramentas
   ══════════════════════════════════════════════════════ */

async function execSearchFormula(
  args: { query: string },
  emit: (s: string) => void
): Promise<object> {
  emit(`Buscando: ${args.query}…`);
  try {
    const rows = await db
      .select({
        id: formulas.id,
        name: formulas.name,
        symbolic: formulas.symbolic,
        description: formulas.description,
        category: formulas.category,
        expression: formulas.expression,
        expression_meta: formulas.expression_meta,
      })
      .from(formulas)
      .where(
        or(
          ilike(formulas.name, `%${args.query}%`),
          ilike(formulas.description, `%${args.query}%`)
        )
      )
      .limit(5);

    if (rows.length === 0) {
      return { found: false, message: "Nenhuma fórmula encontrada para esta busca." };
    }
    return {
      found: true,
      formulas: rows.map((f) => ({
        id: f.id,
        name: f.name,
        symbolic: f.symbolic,
        description: f.description,
        category: f.category,
        expression: f.expression ?? null,
        expression_meta: f.expression_meta ?? null,
      })),
    };
  } catch (err) {
    logger.warn({ err }, "thinkingOrchestrator: search_formula DB error");
    return { found: false, message: "Erro ao buscar fórmula no banco de dados." };
  }
}

async function execCompute(
  args: {
    formulaId?: string;
    formulaName: string;
    formulaSymbolic: string;
    formulaCategory?: string;
    formulaDescription?: string;
    formulaExpression?: string;
    formulaMeta?: any;
    extractedValues: Record<string, any>;
  },
  context: ConversationMessage[],
  query: string,
  store: {
    formula: FormulaInfo | null;
    expressionResult: ExpressionResult | null;
    computedValue: number | null;
  },
  emit: (s: string) => void
): Promise<object> {
  emit("Executando o cálculo…");

  const formula: FormulaInfo = {
    id: args.formulaId ?? null,
    name: args.formulaName,
    description: args.formulaDescription ?? "",
    symbolic: args.formulaSymbolic,
    category: args.formulaCategory ?? "Outro",
    expression: args.formulaExpression ?? null,
    expression_meta: args.formulaMeta ?? null,
  };

  // Converte extractedValues em RawEntity[] (guard contra null/undefined)
  const entities: RawEntity[] = Object.entries(args.extractedValues ?? {})
    .filter(([, v]) => typeof v === "number" || !isNaN(Number(v)))
    .map(([label, value]) => ({
      label,
      value: typeof value === "number" ? value : Number(value),
      humanReadable: String(value),
      unit: "",
    }));

  const contextResult: ContextAgentResult = {
    entities,
    rawText: query,
    needsHistory: false,
  };

  try {
    const expressionResult = await runExpressionAgent({
      formula,
      contextResult,
      query,
      context,
      maxAttempts: 3,
    });

    if (!expressionResult.allPresent) {
      return {
        ok: false,
        missing: expressionResult.missing,
        message: "Faltam valores para completar o cálculo.",
      };
    }

    const computedValue = computeFormula(expressionResult.expression, expressionResult.extracted);

    // Formata o resultado para o LLM ver
    const displayValue = expressionResult.resultUnit === "%" ? computedValue * 100 : computedValue;
    const decimals = Number.isInteger(displayValue) ? 0 : 2;
    const formatted = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(displayValue);
    const withUnit = `${formatted}${expressionResult.resultUnit ? " " + expressionResult.resultUnit : ""}`;

    // Armazena para a fase de resultado
    store.formula = formula;
    store.expressionResult = expressionResult;
    store.computedValue = computedValue;

    return {
      ok: true,
      computedValue,
      resultFormatted: withUnit,
      expression: expressionResult.expression,
      solveFor: expressionResult.solveFor,
      resultLabel: expressionResult.resultLabel,
    };
  } catch (err: any) {
    logger.warn({ err }, "thinkingOrchestrator: compute failed");
    return { ok: false, message: err?.message ?? "Erro ao calcular." };
  }
}

/* ══════════════════════════════════════════════════════
   Pipeline principal — orquestrador com raciocínio
   ══════════════════════════════════════════════════════ */

export async function runCalculationPipeline(opts: {
  query: string;
  formulaId: string | undefined;
  context: ConversationMessage[];
  sessionId?: string;
  sessionSummary?: string;
  messageCount?: number;
  userName?: string;
  emit?: (message: string) => void;
}): Promise<OrchestratorResult> {
  const {
    query,
    formulaId,
    context,
    sessionId,
    sessionSummary,
    messageCount = 0,
    userName,
    emit = () => {},
  } = opts;

  const pipelineStart = Date.now();
  logger.info(
    { formulaId: formulaId ?? "dynamic", query: query.slice(0, 80), sessionId },
    "thinkingOrchestrator: start"
  );

  /* ── Constrói user message com contexto e fórmula pré-selecionada ── */
  let userMessageParts: string[] = [];

  if (sessionSummary) {
    userMessageParts.push(`Contexto da sessão: ${sessionSummary}`);
  }

  if (context.length > 0) {
    const recent = context.slice(-6).map((m) => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`).join("\n");
    userMessageParts.push(`Conversa recente:\n${recent}`);
  }

  // Se há fórmula pré-selecionada, carrega do DB e inclui no contexto
  let preloadedFormula: FormulaInfo | null = null;
  if (formulaId) {
    try {
      const [f] = await db
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

      if (f) {
        preloadedFormula = {
          id: f.id,
          name: f.name,
          description: f.description ?? "",
          symbolic: f.symbolic,
          category: f.category,
          expression: f.expression ?? null,
          expression_meta: f.expression_meta ?? null,
        };
        userMessageParts.push(
          `Fórmula pré-selecionada pelo usuário: ${f.name} (${f.symbolic})\nID: ${f.id}\nExpressão mathjs: ${f.expression ?? "não armazenada"}`
        );
      }
    } catch (err) {
      logger.warn({ err, formulaId }, "thinkingOrchestrator: preload formula failed");
    }
  }

  userMessageParts.push(`Pergunta: ${query}`);

  const userMessage = userMessageParts.join("\n\n");

  /* ══════════════════════════════════════════════════════
     LOOP AGÊNTICO COM STREAMING
     ══════════════════════════════════════════════════════ */

  const messages: any[] = [
    { role: "system", content: buildThinkingSystem(userName) },
    { role: "user", content: userMessage },
  ];

  // Estado acumulado durante o loop
  const store: {
    formula: FormulaInfo | null;
    expressionResult: ExpressionResult | null;
    computedValue: number | null;
    missingVars: { symbol: string; name: string; description: string }[] | null;
    lastAssistantText: string;
    isConversational: boolean;
  } = {
    formula: null,
    expressionResult: null,
    computedValue: null,
    missingVars: null,
    lastAssistantText: "",
    isConversational: false,
  };

  const MAX_ITERATIONS = 6;
  let iteration = 0;
  const sentenceBuf: SentenceBuffer = { text: "" };

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    const stream = await (openai.chat.completions as any).create({
      model: "gpt-4o",
      stream: true,
      tools: THINKING_TOOLS,
      tool_choice: "auto",
      messages,
    });

    let assistantText = "";
    const toolCallAccum: ToolCallAccum[] = [];
    let finishReason = "";

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;

      if (choice.finish_reason) finishReason = choice.finish_reason;

      const delta = choice.delta;
      if (!delta) continue;

      // Streaming de texto → emite frases completas
      if (delta.content) {
        assistantText += delta.content;
        processDelta(delta.content, sentenceBuf, emit);
      }

      // Acumula tool call deltas
      if (delta.tool_calls?.length) {
        mergeToolCallDeltas(toolCallAccum, delta.tool_calls);
      }
    }

    // Flush qualquer texto pendente antes de processar ferramenta
    flushBuffer(sentenceBuf, emit);

    store.lastAssistantText = (store.lastAssistantText + " " + assistantText).trim();

    // Adiciona a mensagem do assistente ao histórico
    const assistantMsg: any = { role: "assistant", content: assistantText || null };
    if (toolCallAccum.length > 0) {
      assistantMsg.tool_calls = toolCallAccum.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }
    messages.push(assistantMsg);

    if (finishReason === "stop" || toolCallAccum.length === 0) {
      // Se já temos resultado de compute, o LLM apenas verificou → não é conversacional
      if (store.computedValue === null) {
        store.isConversational = true;
      }
      break;
    }

    /* ── Executa as ferramentas ── */
    for (const tc of toolCallAccum) {
      let args: any = {};
      try {
        args = JSON.parse(tc.arguments);
      } catch {
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: "Argumentos inválidos" }) });
        continue;
      }

      let toolResult: object = {};

      if (tc.name === "search_formula") {
        toolResult = await execSearchFormula(args, emit);
      } else if (tc.name === "compute") {
        toolResult = await execCompute(args, context, query, store, emit);
        // Se compute teve sucesso, quebra o loop após esta iteração
        if ((toolResult as any).ok) {
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(toolResult) });
          // Dá uma última chance ao LLM para verificar em voz alta
          // mas evita re-chamar compute (já temos o resultado)
          continue;
        }
      } else if (tc.name === "declare_missing") {
        store.missingVars = args.missing ?? [];
        toolResult = { received: true };
      }

      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(toolResult) });
    }

    // Se temos resultado ou missing, continue para mais um turno de verificação
    // mas se o compute já rodou com sucesso, permite uma última fala do LLM
    if (store.missingVars !== null) break;
    if (store.computedValue !== null && iteration >= 2) {
      // Faz mais uma iteração para o LLM verificar/comentar, depois para
      if (iteration >= 3) break;
    }
  }

  logger.info(
    { ms: Date.now() - pipelineStart, hasResult: store.computedValue !== null, iteration },
    "thinkingOrchestrator: loop complete"
  );

  /* ══════════════════════════════════════════════════════
     Trata resultados do loop
     ══════════════════════════════════════════════════════ */

  // Caso: faltam valores
  if (store.missingVars !== null) {
    const formulaName = store.formula?.name ?? "este cálculo";
    return {
      status: "needs_input",
      message: `Para calcular ${formulaName}, preciso de mais alguns dados:`,
      missing: store.missingVars,
    };
  }

  // Caso: conversacional (sem cálculo)
  if (store.isConversational || store.computedValue === null || !store.expressionResult || !store.formula) {
    const msg = store.lastAssistantText.trim() || "Pode me contar mais sobre o que você quer calcular?";
    return { status: "conversational", message: msg };
  }

  /* ══════════════════════════════════════════════════════
     FASE 4 — validationAgent (prova reversa)
     ══════════════════════════════════════════════════════ */

  emit("Verificando o resultado…");
  const phase4Start = Date.now();
  const validation = await runValidationAgent({
    formula: store.formula,
    expressionResult: store.expressionResult,
    computedValue: store.computedValue,
    query,
  });
  logger.info({ ms: Date.now() - phase4Start, valid: validation.valid }, "thinkingOrchestrator: phase 4 complete");

  /* ══════════════════════════════════════════════════════
     FASE 5 — buildResult + explicação (paralelo)
     ══════════════════════════════════════════════════════ */

  emit("Gerando explicação detalhada…");
  const phase5Start = Date.now();

  const [partialResult, conversationalResponse, desenvolvimentoResult, objetivo] = await Promise.all([
    Promise.resolve(
      buildResult(
        store.formula.name,
        store.formula.symbolic,
        store.expressionResult,
        store.computedValue,
        {
          formulaId: store.formula.id,
          formulaCategory: store.formula.category,
          searchUsed: store.expressionResult.searchUsed,
          proof: validation,
          formulaExpression: store.formula.expression,
          formulaMeta: store.formula.expression_meta,
        }
      )
    ),
    runConversationalAgent({
      query,
      formula: store.formula,
      expressionResult: store.expressionResult,
      computedValue: store.computedValue,
      validation,
      context,
      sessionSummary,
      userName,
    }),
    buildDesenvolvimento({
      formulaName: store.formula.name,
      formulaSymbolic: store.formula.symbolic,
      formulaSubstituted: store.expressionResult.formulaSubstituted,
      expression: store.expressionResult.expression,
      extracted: store.expressionResult.extracted,
      variableNames: store.expressionResult.variableNames,
      variableValues: store.expressionResult.variableValues,
      solveFor: store.expressionResult.solveFor,
      computedValue: store.computedValue,
      resultUnit: store.expressionResult.resultUnit,
      resultLabel: store.expressionResult.resultLabel,
    }),
    runObjectiveAgent({
      query,
      formula: store.formula,
      expressionResult: store.expressionResult,
      computedValue: store.computedValue,
    }),
  ]);

  const result = {
    ...partialResult,
    resultado: {
      ...partialResult.resultado,
      interpretacao: desenvolvimentoResult.interpretacao ?? partialResult.resultado.interpretacao,
    },
  };

  logger.info({ ms: Date.now() - phase5Start }, "thinkingOrchestrator: phase 5 complete");
  logger.info(
    { totalMs: Date.now() - pipelineStart, formulaName: store.formula.name },
    "thinkingOrchestrator: pipeline complete"
  );

  /* ── Resumo da sessão — fire-and-forget ── */
  if (sessionId && messageCount > 0 && messageCount % SUMMARY_EVERY <= 1) {
    generateSessionSummary(sessionId, messageCount + 2, sessionSummary).catch((err) => {
      logger.warn({ err, sessionId }, "thinkingOrchestrator: summary failed");
    });
  }

  return {
    status: "success",
    result: {
      ...result,
      conversationalResponse,
      desenvolvimento: desenvolvimentoResult.steps,
      objetivo,
    },
  };
}
