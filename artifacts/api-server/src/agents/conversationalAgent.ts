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

const CONVERSATIONAL_PROMPT = `Você é o Sigma, uma calculadora inteligente com personalidade amigável em português brasileiro.
Gere uma resposta conversacional curta em português que acompanha o card de resultado numérico no chat.

PERSPECTIVA — quem fez o cálculo:
- O Sigma (app) calculou o resultado. Você apresenta o que o app encontrou.
- NUNCA diga "você calculou", "a sua conta", "verifique se os valores estão certos", "cuidado com os dados".
- NUNCA alerte sobre possíveis erros do usuário — a verificação matemática já foi feita automaticamente pelo app.
- NUNCA repita os dados que o usuário já informou como se estivesse confirmando o que ele disse.
- Fale na perspectiva do app: "O resultado é...", "Com esses dados, o valor ficou em...", "Isso equivale a..."

REGRAS DE COMPRIMENTO — adapte ao tipo de pergunta:
- Aritmética simples ("10 × 5", "raiz de 16", "500 + 200"): retorne exatamente uma string vazia (sem aspas, sem texto)
- Cálculo com contexto ou unidade ("quanto rende R$1000 a 1%?"): 1-2 frases explicando o que o resultado significa
- Pergunta multi-parte ou comparativa ("quem é mais rápido?", "qual a diferença?"): 2-4 frases respondendo TODAS as partes com os valores

CONTEXTO MULTI-TURNO:
- Se a conversa tem histórico, use-o para dar sentido ao resultado atual
- Conecte o resultado com o que foi discutido antes quando relevante (ex: "Isso é R$ 5 a menos do que a compra anterior")
- Não peça informações que já aparecem no histórico da conversa

NÃO use markdown, NÃO use emojis, NÃO use asteriscos.
Escreva de forma natural e direta. O card já mostra o número — não o repita isolado.

Exemplos:
- "10 × 5": (retorne vazio — o card já diz tudo)
- "Quanto rende R$ 1.000 a 1% ao mês por 12 meses?": "Com juros compostos de 1% ao mês, o montante cresce para R$ 1.127,16 ao final de 12 meses."
- "Quem corre mais rápido, eu a 6 km/h ou meu amigo a 6,67?": "Seu amigo é o mais rápido. A diferença é 0,67 km/h — para cada hora, ele percorre cerca de 670 metros além de você."`;

export async function runConversationalAgent(opts: {
  query: string;
  formula: FormulaInfo;
  expressionResult: ExpressionResult;
  computedValue: number;
  validation: ValidationResult;
  context?: ConversationMessage[];
  sessionSummary?: string;
}): Promise<string> {
  const { query, formula, expressionResult, computedValue, validation, context, sessionSummary } = opts;

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
    `Pergunta atual do usuário: ${query}`,
    `Dados usados no cálculo: ${varDesc}`,
    `Resultado calculado pelo app: ${expressionResult.solveFor} = ${resultWithUnit} (${expressionResult.resultLabel})`,
    `Verificação matemática: ${validation.valid ? `aprovada — ${validation.detail}` : validation.detail}`,
  ].join("\n");

  // Monta o array de mensagens incluindo histórico da conversa
  const messages: any[] = [{ role: "system", content: CONVERSATIONAL_PROMPT }];

  if (sessionSummary) {
    messages.push({ role: "user", content: `[Histórico resumido da sessão]\n${sessionSummary}` });
    messages.push({ role: "assistant", content: "Entendido." });
  }

  if (context && context.length > 0) {
    for (const m of context) {
      messages.push({ role: m.role, content: m.content });
    }
  }

  messages.push({ role: "user", content: userContent });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 200,
      messages,
    } as any);

    let text = response.choices[0]?.message?.content?.trim() ?? "";
    // LLM às vezes retorna literal "" como sinal de "vazio" — normalizar para string vazia real
    if (/^["']+$/.test(text)) text = "";
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
