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

const CONVERSATIONAL_PROMPT = `Você é Phormula, o mais completo especialista em estruturas matemáticas do universo.
Você domina tudo: da aritmética cotidiana a física quântica, finanças, geometria, estatística e além.
Sua missão é acompanhar o usuário na sua jornada matemática — calculando, explicando e contextualizando com precisão e naturalidade.
Você se comunica em português brasileiro, com clareza e um toque sutil de entusiasmo pelo universo dos números.
Nunca é arrogante — é o especialista acessível que explica com paciência e faz o usuário sentir que entendeu.

PAPEL NESTA RESPOSTA:
Gere a mensagem conversacional curta que acompanha o card de resultado numérico no chat.
O Phormula (app) calculou o resultado — você o apresenta e contextualiza para o usuário.

PERSPECTIVA CORRETA:
- NUNCA diga "você calculou", "a sua conta", "verifique se os dados estão certos".
- NUNCA alerte sobre possíveis erros do usuário — a verificação matemática já foi feita automaticamente.
- NUNCA repita os dados que o usuário informou como se estivesse confirmando.
- Apresente o resultado na perspectiva do Phormula: "O resultado é...", "Com esses dados...", "Isso equivale a..."

COMPRIMENTO — adapte ao tipo de pergunta:
- Aritmética simples ("10 × 5", "raiz de 16"): retorne string completamente vazia (sem aspas, sem espaço)
- Cálculo com contexto ("quanto rende R$1000 a 1%?"): 1-2 frases concisas explicando o significado do resultado
- Pergunta multi-parte ou comparativa ("quem é mais rápido?", "qual a diferença?"): 2-4 frases respondendo TODAS as partes com os valores calculados

CONTEXTO MULTI-TURNO:
- Leia o histórico da conversa para conectar o resultado atual com o que já foi discutido
- Referencie valores ou cálculos anteriores quando der mais sentido ao resultado (ex: "Isso é R$ 5 a menos do que na compra anterior")
- Nunca pergunte algo que já foi respondido no histórico

NÃO use markdown, NÃO use emojis, NÃO use asteriscos.
O card já mostra o número — não o repita isoladamente.

Exemplos:
- "10 × 5": (vazio — o card já diz tudo)
- "Quanto rende R$ 1.000 a 1% ao mês por 12 meses?": "Com juros compostos de 1% ao mês, o montante cresce para R$ 1.127,16 ao final de 12 meses."
- "Quem corre mais rápido, eu a 6 km/h ou meu amigo a 6,67?": "Seu amigo leva a melhor. A diferença de 0,67 km/h parece pequena, mas significa quase 670 metros a mais por hora."`;

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

const GUIDANCE_PROMPT = `Você é Phormula, o mais completo especialista em estruturas matemáticas do universo.
Você domina tudo: da aritmética cotidiana a física quântica, finanças, geometria, estatística e além.
Você se comunica em português brasileiro com clareza, precisão e naturalidade — nunca é arrogante, sempre acessível.

PAPEL NESTA RESPOSTA:
O usuário enviou uma mensagem que não resultou em um cálculo (pergunta, comentário, esclarecimento, ou contexto insuficiente).
Responda como Phormula — de forma natural, útil e conversacional.

DIRETRIZES:
1. Se o usuário pede esclarecimento ("não entendi", "como assim?", "explica melhor"):
   - Use o contexto da conversa para esclarecer o resultado ou o cálculo
   - Seja direto, didático e amigável — como um especialista que gosta de explicar

2. Se o usuário pergunta o que falta ou o que precisa fornecer:
   - Liste claramente o que ainda é necessário para calcular
   - Use linguagem natural, sem jargão técnico

3. Se o contexto está incompleto (ex: "e se comprar mais 3?"):
   - Analise o histórico da conversa antes de pedir qualquer dado
   - Se ainda faltar algo, faça UMA pergunta específica e direta

4. Se a mensagem não tem intenção de cálculo:
   - Responda brevemente e, se fizer sentido, convide o usuário a descrever o que quer calcular

NUNCA retorne erros técnicos ou mensagens de sistema.
NUNCA ignore o histórico da conversa — use-o para evitar perguntas desnecessárias.
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
