import { Router } from "express";
import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAuth } from "../middlewares/auth";
import { supabase } from "../lib/supabase";
import { logger } from "../lib/logger";

const router = Router();

const CalcBody = z.object({
  query: z.string().min(1).max(1000),
  formulaId: z.string().uuid().optional(),
});

const BASE_RULES = `Regras obrigatórias:
- Responda SEMPRE com JSON válido — sem markdown, sem blocos de código, sem texto fora do JSON
- Use vírgula como separador decimal e ponto como separador de milhar (padrão pt-BR)
- Inclua pelo menos 2 passos no passo-a-passo
- Se o cálculo envolver dinheiro use R$ na unidade
- Seja preciso nos cálculos — verifique a matemática antes de responder
- Use a ferramenta de busca na web quando: o usuário questionar o resultado ("tem certeza?", "isso está certo?", "pode confirmar?"), ou quando precisar verificar dados técnicos/científicos atualizados, ou para confirmar se uma fórmula está correta`;

const RESPONSE_FORMATS = `Você deve retornar EXATAMENTE um destes três formatos JSON:

FORMATO 1 — Cálculo concluído com sucesso:
{
  "status": "success",
  "result": {
    "formulaName": "Nome da fórmula",
    "resultFormatted": "1.126,83",
    "resultUnit": "R$",
    "resultLabel": "montante final",
    "formulaSymbolic": "M = C × (1 + i)ⁿ",
    "formulaSubstituted": "M = 1000 × (1 + 0,01)¹²",
    "variables": [
      { "symbol": "C", "name": "Capital inicial", "value": "R$ 1.000" }
    ],
    "steps": ["Passo 1", "Passo 2"],
    "note": "Observação útil ou null",
    "warning": "Preencha se houver ressalvas, senão omita ou null",
    "searchUsed": false
  }
}

FORMATO 2 — Faltam dados para calcular:
{
  "status": "needs_input",
  "message": "Para calcular [nome da fórmula], preciso de mais alguns dados:",
  "missing": [
    { "symbol": "m", "name": "Massa", "description": "Seu peso em quilogramas (ex: 70)" }
  ]
}

FORMATO 3 — Fórmula com falhas que impedem o cálculo:
{
  "status": "formula_error",
  "message": "Descrição clara do problema para o usuário. Se a fórmula parecer incompleta, pergunte se o usuário conhece a forma correta."
}`;

const DYNAMIC_SYSTEM_PROMPT = `Você é Sigma, uma calculadora inteligente em português brasileiro.
O usuário descreve um cálculo em linguagem natural e você resolve com precisão matemática.
Escolha a fórmula mais adequada para o problema descrito.
Se faltar informação indispensável, use o FORMATO 2. Se os dados forem suficientes mas imprecisos, faça uma estimativa razoável e explique no campo "note".

${RESPONSE_FORMATS}

${BASE_RULES}`;

function buildFormulaSystemPrompt(formula: {
  name: string;
  description: string;
  symbolic: string;
  category: string;
}): string {
  return `Você é Sigma, uma calculadora inteligente em português brasileiro.
O usuário selecionou a fórmula abaixo e você DEVE usá-la exclusivamente.

Fórmula selecionada:
- Nome: ${formula.name}
- Categoria: ${formula.category}
- Descrição: ${formula.description}
- Expressão simbólica: ${formula.symbolic}

Instruções:
1. Avalie se a expressão simbólica (${formula.symbolic}) é coerente com a descrição. Se tiver falhas impeditivas (variáveis erradas, lógica quebrada), retorne FORMATO 3 explicando o problema e perguntando se o usuário conhece a forma correta.
2. Se a fórmula tiver limitações menores mas o cálculo ainda for possível, retorne FORMATO 1 com o campo "warning" preenchido.
3. Mapeie os dados fornecidos pelo usuário para as variáveis da fórmula. Se faltarem dados obrigatórios, retorne FORMATO 2.
4. O campo "formulaName" deve ser exatamente "${formula.name}".
5. O campo "formulaSymbolic" deve ser exatamente "${formula.symbolic}".

${RESPONSE_FORMATS}

${BASE_RULES}`;
}

function extractTextAndSearchUsed(output: any[]): { text: string; searchUsed: boolean } {
  const searchUsed = output.some((item: any) => item.type === "web_search_call");
  const text = output
    .filter((item: any) => item.type === "message")
    .flatMap((msg: any) => (Array.isArray(msg.content) ? msg.content : []))
    .filter((c: any) => c.type === "output_text")
    .map((c: any) => c.text as string)
    .join("");
  return { text, searchUsed };
}

router.post("/calculate", requireAuth, async (req, res) => {
  const parsed = CalcBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    return;
  }

  const { query, formulaId } = parsed.data;

  let systemPrompt = DYNAMIC_SYSTEM_PROMPT;

  if (formulaId) {
    const { data: formula, error } = await supabase
      .from("formulas")
      .select("name, description, symbolic, category")
      .eq("id", formulaId)
      .single();

    if (error || !formula) {
      logger.warn({ formulaId, error }, "Formula not found");
      res.json({
        status: "formula_error",
        message: "Fórmula não encontrada. Ela pode ter sido removida. Tente selecionar outra fórmula ou use o modo dinâmico.",
      });
      return;
    }

    systemPrompt = buildFormulaSystemPrompt(formula);
  }

  try {
    const response = await (openai as any).responses.create({
      model: "gpt-5.1",
      max_output_tokens: 2048,
      tools: [{ type: "web_search_preview" }],
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
    });

    const { text: content, searchUsed } = extractTextAndSearchUsed(response.output ?? []);

    let parsed: any;
    try {
      parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, "").trim());
    } catch {
      logger.error({ content }, "Failed to parse AI response as JSON");
      res.status(500).json({ error: "A IA retornou uma resposta inesperada. Tente novamente." });
      return;
    }

    if (parsed.status === "success" && parsed.result) {
      parsed.result.searchUsed = searchUsed;
    }

    res.json(parsed);
  } catch (err) {
    logger.error({ err }, "AI call failed");
    res.status(500).json({ error: "Falha ao processar o cálculo. Tente novamente." });
  }
});

export default router;
