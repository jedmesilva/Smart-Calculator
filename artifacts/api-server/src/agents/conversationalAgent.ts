/* ═══════════════════════════════════════════════════════
   Agente Conversacional — Fase 5b
   Gera uma resposta em linguagem natural (pt-BR) para o chat,
   explicando o resultado de forma amigável e contextualizada.

   runGuidanceAgent — fallback conversacional para erros e
   perguntas meta ("não entendi", "quais valores faltam?").
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";
import type { ConversationMessage, ExpressionResult, FormulaInfo, ValidationResult } from "./types";

const CONVERSATIONAL_PROMPT = `Você é o Sigma, uma calculadora inteligente com personalidade amigável.
Gere uma resposta conversacional CURTA (1-3 frases) em português brasileiro que:
1. Apresente o resultado de forma clara e direta
2. Dê um contexto útil sobre o que o resultado significa
3. Se pertinente, adicione uma dica ou observação prática

NÃO use markdown, NÃO use emojis, NÃO use asteriscos.
Escreva como se estivesse conversando, de forma natural e acolhedora.
O resultado numérico formatado já estará disponível no card de detalhe — não precisa repetir a fórmula completa.
Seja conciso: máximo 3 frases.

Exemplos de tom desejado:
- "Seu montante final será R$ 1.127,16. Com juros compostos de 1% ao mês por 12 meses, o capital cresce um pouco mais do que os juros simples fariam."
- "O IMC calculado é 24,5, que fica dentro da faixa de peso normal (18,5–24,9). Ótimo resultado!"
- "A área do círculo é 78,54 cm². Para referência, isso equivale a pouco mais que uma folha A4 dobrada ao meio."`;

export async function runConversationalAgent(opts: {
  query: string;
  formula: FormulaInfo;
  expressionResult: ExpressionResult;
  computedValue: number;
  validation: ValidationResult;
}): Promise<string> {
  const { query, formula, expressionResult, computedValue, validation } = opts;

  // Formata o resultado para o prompt
  const isPercent = expressionResult.resultUnit === "%";
  const displayValue = isPercent ? computedValue * 100 : computedValue;
  const formattedResult = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 4,
  }).format(displayValue);
  const resultWithUnit = expressionResult.resultUnit
    ? `${expressionResult.resultUnit} ${formattedResult}`
    : formattedResult;

  const varDesc = Object.entries(expressionResult.variableValues)
    .filter(([sym]) => sym !== expressionResult.solveFor)
    .map(([sym, val]) => `${expressionResult.variableNames[sym] ?? sym}: ${val}`)
    .join(", ");

  const userContent = [
    `Fórmula usada: ${formula.name}`,
    `Pergunta do usuário: ${query}`,
    `Dados informados: ${varDesc}`,
    `Resultado: ${expressionResult.solveFor} = ${resultWithUnit} (${expressionResult.resultLabel})`,
    validation.valid
      ? `Verificação: aprovada — ${validation.detail}`
      : `Atenção: ${validation.detail}`,
  ].join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 200,
      messages: [
        { role: "system", content: CONVERSATIONAL_PROMPT },
        { role: "user", content: userContent },
      ],
    } as any);

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    if (!text) throw new Error("empty response");

    logger.debug({ formulaName: formula.name }, "conversationalAgent: response generated");
    return text;
  } catch (err) {
    logger.warn({ err }, "conversationalAgent: failed, using fallback");

    // Fallback: resposta simples sem AI
    const label = expressionResult.resultLabel
      ? expressionResult.resultLabel.charAt(0).toUpperCase() + expressionResult.resultLabel.slice(1)
      : "Resultado";
    return `${label}: ${resultWithUnit}. Confira os detalhes do cálculo abaixo.`;
  }
}

/* ═══════════════════════════════════════════════════════
   runGuidanceAgent — resposta conversacional para casos
   onde a pipeline não conseguiu computar um resultado:
   - perguntas meta ("não entendi", "quais valores faltam?")
   - contexto ambíguo (valores derivados não disponíveis)
   - falhas de expressão
   ═══════════════════════════════════════════════════════ */

const GUIDANCE_PROMPT = `Você é o Sigma, uma calculadora inteligente e assistente amigável em português brasileiro.
O usuário enviou uma mensagem que não resultou em um cálculo (pode ser uma pergunta, comentário, pedido de esclarecimento, ou um cálculo com contexto insuficiente).

Sua tarefa: responder de forma natural, útil e conversacional. Siga estas diretrizes:

1. Se o usuário está pedindo esclarecimento ("não entendi", "como assim?", "explica melhor"):
   - Esclareça o que o Sigma consegue calcular com base no contexto da conversa
   - Seja direto e amigável

2. Se o usuário pergunta quais valores faltam ou o que precisa fornecer:
   - Liste claramente o que ainda precisa saber para fazer o cálculo
   - Use linguagem natural, não técnica

3. Se o usuário fez um cálculo mas o contexto está incompleto (ex: "e se comprar mais 3?"):
   - Tente deduzir o que falta do contexto da conversa
   - Se ainda assim faltar algo, pergunte de forma específica e direta (1 pergunta por vez)

4. Se a mensagem não tem nenhuma intenção de cálculo:
   - Responda brevemente e convide o usuário a descrever um cálculo

NUNCA retorne erros técnicos ou mensagens de sistema.
Seja breve: máximo 3 frases. Sem markdown, sem emojis, sem asteriscos.`;

export async function runGuidanceAgent(opts: {
  query: string;
  context: ConversationMessage[];
  sessionSummary?: string;
  failReason?: string;
}): Promise<string> {
  const { query, context, sessionSummary, failReason } = opts;

  const messages: any[] = [{ role: "system", content: GUIDANCE_PROMPT }];

  if (sessionSummary) {
    messages.push({
      role: "user",
      content: `[Resumo da sessão]\n${sessionSummary}`,
    });
    messages.push({
      role: "assistant",
      content: "Entendido, tenho esse contexto.",
    });
  }

  for (const m of context) {
    messages.push({ role: m.role, content: m.content });
  }

  const userContent = failReason
    ? `[Motivo pelo qual o cálculo não foi possível: ${failReason}]\n\nMensagem do usuário: ${query}`
    : `Mensagem do usuário: ${query}`;

  messages.push({ role: "user", content: userContent });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 200,
      messages,
    } as any);

    const text = response.choices[0]?.message?.content?.trim() ?? "";
    if (!text) throw new Error("empty response");

    logger.debug({ query: query.slice(0, 60) }, "guidanceAgent: response generated");
    return text;
  } catch (err) {
    logger.warn({ err }, "guidanceAgent: failed, using fallback");
    return "Não consegui entender o cálculo. Pode descrever com mais detalhes o que quer calcular?";
  }
}
