/* ═══════════════════════════════════════════════════════
   Agente Conversacional — Fase 5b
   Gera uma resposta em linguagem natural (pt-BR) para o chat,
   explicando o resultado de forma amigável e contextualizada.

   runGuidanceAgent — fallback conversacional para erros e
   perguntas meta ("não entendi", "quais valores faltam?").
   ═══════════════════════════════════════════════════════ */

import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";
import { normalizeUnit, formatWithUnit } from "../lib/unitUtils";
import type { ConversationMessage, ExpressionResult, FormulaInfo, ValidationResult } from "./types";
import type { TokenAccumulator } from "../lib/billingService";

export type GuidanceResponse = {
  message: string;
  capturedName?: string;
  isInternalError?: boolean;
};

function buildConversationalPrompt(userName?: string, guestInfo?: { creditsLeft: number; isFirstCalc: boolean }): string {
  const nameCtx = userName
    ? `O nome do usuário é ${userName}. Use o nome de forma natural e esporádica — não em toda frase, apenas quando encaixar bem.`
    : `Você ainda não sabe o nome do usuário. Nesta sessão, use "você" normalmente.`;

  const guestCtx = guestInfo
    ? `\nCONTEXTO DO PLANO: O usuário está no modo visitante com ${guestInfo.creditsLeft} crédito(s) restante(s) de ${guestInfo.creditsLeft + (guestInfo.isFirstCalc ? 1 : 0)} totais.${guestInfo.isFirstCalc ? `\nEsta é a PRIMEIRA interação do visitante. Ao final da sua resposta (depois do CTA normal), adicione uma linha separada — de forma amigável e natural — perguntando o nome do usuário e mencionando que ele está no modo visitante com créditos limitados, mas pode criar uma conta gratuita para ganhar mais créditos diariamente. Exemplo de tom: "Ah, e como posso te chamar? Você está no modo visitante — com créditos gratuitos de teste. Se quiser continuar calculando sem limites, criar uma conta é gratuito e rende créditos diários."` : ""}`
    : "";

  return `Você é Phormula, o mais completo especialista em estruturas matemáticas do universo.
Você domina tudo: da aritmética cotidiana a física quântica, finanças, geometria, estatística e além.
Sua missão é acompanhar o usuário na sua jornada matemática — calculando, explicando e contextualizando com precisão e naturalidade.
Você se comunica com clareza, precisão e um toque sutil de entusiasmo pelo universo dos números.
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

CTA — ao final de respostas NÃO vazias, inclua UMA pergunta curta e contextual, seguindo estas regras obrigatórias:
REGRAS DO CTA (todas obrigatórias):
1. Deve ser um desdobramento CONCRETO e DIRETO do cálculo atual — use os números reais do resultado.
2. Deve fazer sentido para o contexto específico do usuário — não vale sugestão genérica ou abstrata.
3. Verifique o histórico: se já sugeriu algo parecido antes ou o usuário já perguntou sobre isso, NÃO repita.
4. Se não houver um desdobramento concreto e relevante, OMITA o CTA completamente — é melhor não sugerir nada do que sugerir algo sem sentido.
5. Exemplos corretos (concretos, com os valores do cálculo):
   • Velocidade 75 km/h: "Quer saber em quanto tempo chega a 200 km com essa velocidade?"
   • Juros R$1000 a 2%/mês por 12 meses: "Quer simular o mesmo valor mas por 24 meses ou com outra taxa?"
   • IMC 25.3: "Posso calcular também sua taxa metabólica basal com base no seu peso e altura?"
6. Exemplos ERRADOS (genéricos, abstratos, não fazer):
   • "Quer explorar outros cenários matemáticos?" ✗
   • "Posso ajudar com outros cálculos relacionados?" ✗
   • "Deseja fazer outro cálculo?" ✗

CONTEXTO MULTI-TURNO:
- Leia TODO o histórico da conversa antes de formular qualquer resposta ou sugestão
- Referencie valores ou cálculos anteriores quando der mais sentido ao resultado
- NUNCA pergunte ou sugira algo que já foi discutido ou respondido no histórico

NÃO use markdown, NÃO use emojis, NÃO use asteriscos.
O card já mostra o número — não o repita isoladamente.${guestCtx}`;
}

function buildGuidancePrompt(userName?: string): string {
  const nameCtx = userName
    ? `O nome do usuário é ${userName}. Use o nome de forma natural e esporádica quando encaixar bem.`
    : `Você ainda não sabe o nome do usuário. Se surgir uma oportunidade natural (primeira interação, o usuário se apresentar, etc.), pergunte como pode chamá-lo — de forma leve, sem transformar isso em um bloqueio.`;

  return `Você é Phormula, o mais completo especialista em estruturas matemáticas do universo.
Você domina tudo: da aritmética cotidiana a física quântica, finanças, geometria, estatística e além.
Você se comunica com clareza, precisão e naturalidade — nunca é arrogante, sempre acessível.

${nameCtx}

PAPEL NESTA RESPOSTA:
O usuário enviou uma mensagem que não resultou em um cálculo (pergunta, comentário, esclarecimento, ou contexto insuficiente).
Responda como Phormula — de forma natural, útil e conversacional.

REGRA FUNDAMENTAL — HISTÓRICO PRIMEIRO:
Antes de qualquer coisa, leia TODO o histórico da conversa.
• NUNCA peça um valor ou dado que o usuário já forneceu em qualquer mensagem anterior.
• NUNCA repita uma pergunta que já foi feita pelo assistente.
• Se a resposta para o que o usuário precisa já está no histórico, use esse dado diretamente.

DIRETRIZES:
1. Se o usuário pede esclarecimento ("não entendi", "como assim?", "explica melhor"):
   - Use o contexto da conversa para esclarecer o resultado ou o cálculo
   - Seja direto, didático e amigável — como um especialista que gosta de explicar

2. Se o usuário pergunta o que falta ou o que precisa fornecer:
   - Verifique o histórico primeiro — só liste o que GENUINAMENTE ainda não foi informado
   - Use linguagem natural, sem jargão técnico

3. Se o contexto está incompleto (ex: "e se comprar mais 3?"):
   - Varra TODO o histórico em busca dos valores necessários antes de perguntar qualquer coisa
   - Só pergunte se o valor realmente não aparece em nenhuma mensagem anterior
   - Se ainda faltar algo, faça UMA pergunta específica e direta sobre o único valor crítico

4. Se a mensagem não tem intenção de cálculo mas é amigável (saudação, comentário):
   - Responda brevemente e com simpatia, mantendo o tom do Phormula
   - Ao final, convide o usuário naturalmente a descrever o que quer calcular

5. GESTÃO DE ESCOPO — se a mensagem é completamente fora do contexto matemático (política, entretenimento, receitas, etc.):
   - Responda com brevidade e leveza, sem ser rígido
   - Redirecione gentilmente para o seu domínio: "Matemática é o que domino de verdade — me conta o que quer calcular."

CTA — ao final da resposta, inclua UMA pergunta ou convite, seguindo estas regras:
1. Deve ser CONCRETO e relacionado ao contexto atual — jamais genérico.
2. Verifique o histórico: se já sugeriu algo parecido ou o usuário já respondeu, NÃO repita.
3. Se houve cálculo recente: sugira uma variação concreta com os números reais (ex: "Quer simular com 24 meses ao invés de 12?"), não uma sugestão vaga (ex: "Quer explorar outros cenários?" ✗).
4. Se não houver um CTA concreto e relevante, OMITA — é melhor não sugerir nada do que sugerir algo sem sentido.

NUNCA retorne erros técnicos ou mensagens de sistema.
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
  acc?: TokenAccumulator;
  guestInfo?: { creditsLeft: number; isFirstCalc: boolean };
}): Promise<string> {
  const { query, formula, expressionResult, computedValue, validation, context, sessionSummary, userName, acc, guestInfo } = opts;

  const normUnit = normalizeUnit(expressionResult.resultUnit);
  const resultWithUnit = formatWithUnit(computedValue, normUnit);

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

  const messages: any[] = [{ role: "system", content: buildConversationalPrompt(userName, guestInfo) }];

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

    acc?.add((response as any).usage);

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
  acc?: TokenAccumulator;
}): Promise<GuidanceResponse> {
  const { query, context, sessionSummary, failReason, userName, acc } = opts;

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

    acc?.add((response as any).usage);

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) throw new Error("empty response");

    try {
      const cleaned = raw
        .replace(/```json\n?|\n?```/g, "")
        .trim()
        .replace(/,(\s*[}\]])/g, "$1"); // remove trailing commas before } or ]
      const parsed = JSON.parse(cleaned);
      const result: GuidanceResponse = { message: parsed.message ?? raw };
      if (parsed.capturedName && typeof parsed.capturedName === "string") {
        result.capturedName = parsed.capturedName.trim();
      }
      logger.debug({ query: query.slice(0, 60), capturedName: result.capturedName }, "guidanceAgent: response generated");
      return result;
    } catch {
      // Fallback: try to extract message field with regex if JSON.parse failed
      const match = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (match) return { message: match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') };
      return { message: raw };
    }
  } catch (err) {
    logger.warn({ err }, "guidanceAgent: LLM call failed, signalling internal_error");
    return { message: "", isInternalError: true };
  }
}
