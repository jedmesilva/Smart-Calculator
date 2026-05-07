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

export type GuidanceResponse = {
  message: string;
  capturedName?: string;
};

function buildConversationalPrompt(userName?: string): string {
  const nameCtx = userName
    ? `O nome do usuário é ${userName}. Use o nome de forma natural e esporádica — não em toda frase, apenas quando encaixar bem.`
    : `Você ainda não sabe o nome do usuário. Nesta sessão, use "você" normalmente.`;

  return `Você é Phormula, o mais completo especialista em estruturas matemáticas do universo.
Você domina tudo: da aritmética cotidiana a física quântica, finanças, geometria, estatística e além.
Sua missão é acompanhar o usuário na sua jornada matemática — calculando, explicando e contextualizando com precisão e naturalidade.
Você se comunica em português brasileiro, com clareza e um toque sutil de entusiasmo pelo universo dos números.
Nunca é arrogante — é o especialista acessível que explica com paciência e faz o usuário sentir que entendeu.

${nameCtx}

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

CTA — ao final de respostas NÃO vazias, inclua sempre uma pergunta curta e natural:
- Deve ser diretamente relacionada ao cálculo atual (não genérica)
- Deve instigar o usuário a explorar mais o mesmo tema ou um desdobramento lógico
- Exemplos:
  • Juros compostos: "Quer simular com outra taxa ou prazo?"
  • IMC: "Deseja calcular sua taxa metabólica basal também?"
  • Velocidade: "Posso calcular também o tempo para outra distância, se quiser."
  • Troco/compra: "Quer calcular quanto ficaria com mais ou menos itens?"
- A pergunta deve fluir naturalmente — não como item de lista, mas como parte do parágrafo ou frase final.

CONTEXTO MULTI-TURNO:
- Leia o histórico da conversa para conectar o resultado atual com o que já foi discutido
- Referencie valores ou cálculos anteriores quando der mais sentido ao resultado
- Nunca pergunte algo que já foi respondido no histórico

NÃO use markdown, NÃO use emojis, NÃO use asteriscos.
O card já mostra o número — não o repita isoladamente.`;
}

function buildGuidancePrompt(userName?: string): string {
  const nameCtx = userName
    ? `O nome do usuário é ${userName}. Use o nome de forma natural e esporádica quando encaixar bem.`
    : `Você ainda não sabe o nome do usuário. Se surgir uma oportunidade natural (primeira interação, o usuário se apresentar, etc.), pergunte como pode chamá-lo — de forma leve, sem transformar isso em um bloqueio.`;

  return `Você é Phormula, o mais completo especialista em estruturas matemáticas do universo.
Você domina tudo: da aritmética cotidiana a física quântica, finanças, geometria, estatística e além.
Você se comunica em português brasileiro com clareza, precisão e naturalidade — nunca é arrogante, sempre acessível.

${nameCtx}

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

4. Se a mensagem não tem intenção de cálculo mas é amigável (saudação, comentário):
   - Responda brevemente e com simpatia, mantendo o tom do Phormula
   - Ao final, convide o usuário naturalmente a descrever o que quer calcular

5. GESTÃO DE ESCOPO — se a mensagem é completamente fora do contexto matemático (política, entretenimento, receitas, etc.):
   - Responda com brevidade e leveza, sem ser rígido
   - Redirecione gentilmente para o seu domínio: "Matemática é o que domino de verdade — me conta o que quer calcular."

CTA — ao final da resposta, inclua sempre uma pergunta ou convite contextual:
- Se houve cálculo recente: relacione o CTA ao cálculo (ex: "Quer explorar uma variação desse cenário?")
- Se não houve cálculo ainda: convide o usuário a descrever o que quer resolver
- A pergunta deve ser natural, específica e instigante — não genérica

NUNCA retorne erros técnicos ou mensagens de sistema.
NUNCA ignore o histórico da conversa — use-o para evitar perguntas desnecessárias.
Seja conciso: máximo 4 frases. Sem markdown, sem emojis, sem asteriscos.

CAPTURA DE NOME — IMPORTANTE:
Se o usuário compartilhar seu nome nesta mensagem (ex: "me chamo Ana", "pode me chamar de Pedro", "sou o Lucas", "meu nome é..."):
Extraia o nome e inclua-o no campo "capturedName" do JSON de resposta.

RETORNE SEMPRE JSON VÁLIDO, sem markdown:
{
  "message": "sua resposta em texto",
  "capturedName": "Nome"
}

Se não capturou nenhum nome, omita o campo "capturedName":
{
  "message": "sua resposta em texto"
}`;
}

export async function runConversationalAgent(opts: {
  query: string;
  formula: FormulaInfo;
  expressionResult: ExpressionResult;
  computedValue: number;
  validation: ValidationResult;
  context?: ConversationMessage[];
  sessionSummary?: string;
  userName?: string;
}): Promise<string> {
  const { query, formula, expressionResult, computedValue, validation, context, sessionSummary, userName } = opts;

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

  const messages: any[] = [{ role: "system", content: buildConversationalPrompt(userName) }];

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
      max_completion_tokens: 300,
      messages,
    } as any);

    let text = response.choices[0]?.message?.content?.trim() ?? "";
    if (/^["']+$/.test(text)) text = "";
    if (!text) throw new Error("empty response");

    logger.debug({ formulaName: formula.name }, "conversationalAgent: response generated");
    return text;
  } catch (err) {
    logger.warn({ err }, "conversationalAgent: failed, using fallback");
    const label = expressionResult.resultLabel
      ? expressionResult.resultLabel.charAt(0).toUpperCase() + expressionResult.resultLabel.slice(1)
      : "Resultado";
    return `${label}: ${resultWithUnit}.`;
  }
}

/* ═══════════════════════════════════════════════════════
   runGuidanceAgent — resposta conversacional para casos
   onde a pipeline não conseguiu computar um resultado:
   - perguntas meta ("não entendi", "quais valores faltam?")
   - contexto ambíguo (valores derivados não disponíveis)
   - falhas de expressão
   ═══════════════════════════════════════════════════════ */

export async function runGuidanceAgent(opts: {
  query: string;
  context: ConversationMessage[];
  sessionSummary?: string;
  failReason?: string;
  userName?: string;
}): Promise<GuidanceResponse> {
  const { query, context, sessionSummary, failReason, userName } = opts;

  const messages: any[] = [{ role: "system", content: buildGuidancePrompt(userName) }];

  if (sessionSummary) {
    messages.push({
      role: "user",
      content: `[Resumo da sessão]\n${sessionSummary}`,
    });
    messages.push({
      role: "assistant",
      content: `{"message":"Entendido, tenho esse contexto."}`,
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
      max_completion_tokens: 350,
      messages,
    } as any);

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) throw new Error("empty response");

    try {
      const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
      const result: GuidanceResponse = { message: parsed.message ?? raw };
      if (parsed.capturedName && typeof parsed.capturedName === "string") {
        result.capturedName = parsed.capturedName.trim();
      }
      logger.debug({ query: query.slice(0, 60), capturedName: result.capturedName }, "guidanceAgent: response generated");
      return result;
    } catch {
      return { message: raw };
    }
  } catch (err) {
    logger.warn({ err }, "guidanceAgent: failed, using fallback");
    return { message: "Não consegui entender o cálculo. Pode descrever com mais detalhes o que quer calcular?" };
  }
}
