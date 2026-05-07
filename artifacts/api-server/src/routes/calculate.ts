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

const BASE_RULES = `Regras:
- Use vírgula como separador decimal e ponto como separador de milhar (padrão pt-BR)
- Inclua pelo menos 2 passos no passo-a-passo
- Se o cálculo envolver dinheiro use R$ na unidade
- Seja preciso nos cálculos — verifique a matemática antes de responder
- Se o usuário não fornecer dados suficientes, faça uma estimativa razoável e explique na note`;

const RESPONSE_FORMAT = `Responda APENAS com JSON válido, sem markdown, sem blocos de código, sem texto adicional.

Formato obrigatório:
{
  "formulaName": "Nome da fórmula ou tipo de cálculo",
  "resultFormatted": "Resultado formatado em pt-BR com separadores corretos (ex: 1.126,83 ou 27,5)",
  "resultUnit": "Unidade do resultado (ex: R$, km/h, m², %, kg) ou string vazia se não houver",
  "resultLabel": "Descrição curta do resultado em minúsculas (ex: montante final, velocidade média, índice)",
  "formulaSymbolic": "Fórmula simbólica com símbolos matemáticos unicode (ex: M = C × (1 + i)ⁿ)",
  "formulaSubstituted": "Fórmula com valores numéricos substituídos (ex: M = 1000 × (1 + 0,01)¹²)",
  "variables": [
    { "symbol": "símbolo", "name": "Nome da variável", "value": "Valor com unidade (ex: R$ 1.000)" }
  ],
  "steps": [
    "Passo com descrição clara do que foi feito"
  ],
  "note": "Observação ou contexto útil em português (ou null)"
}`;

const DYNAMIC_SYSTEM_PROMPT = `Você é Sigma, uma calculadora inteligente em português brasileiro.
O usuário descreve um cálculo em linguagem natural e você resolve com precisão matemática.
Escolha a fórmula mais adequada para o problema descrito.

${RESPONSE_FORMAT}

${BASE_RULES}`;

function buildFormulaSystemPrompt(formula: {
  name: string;
  description: string;
  symbolic: string;
  category: string;
}): string {
  return `Você é Sigma, uma calculadora inteligente em português brasileiro.
O usuário selecionou uma fórmula específica e você DEVE usá-la obrigatoriamente para resolver o cálculo.

Fórmula selecionada:
- Nome: ${formula.name}
- Categoria: ${formula.category}
- Descrição: ${formula.description}
- Expressão simbólica: ${formula.symbolic}

Instruções:
- Use EXCLUSIVAMENTE a fórmula acima para resolver o problema do usuário
- Identifique os valores fornecidos pelo usuário e mapeie para as variáveis da fórmula
- Se o usuário não fornecer alguma variável necessária, peça uma estimativa razoável e explique na note
- O campo "formulaName" deve ser exatamente "${formula.name}"
- O campo "formulaSymbolic" deve ser exatamente "${formula.symbolic}"

${RESPONSE_FORMAT}

${BASE_RULES}`;
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
      logger.warn({ formulaId, error }, "Formula not found, falling back to dynamic mode");
    } else {
      systemPrompt = buildFormulaSystemPrompt(formula);
    }
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
    });

    const content = response.choices[0]?.message?.content ?? "";

    let result;
    try {
      result = JSON.parse(content);
    } catch {
      logger.error({ content }, "Failed to parse AI response as JSON");
      res.status(500).json({ error: "A IA retornou uma resposta inesperada. Tente novamente." });
      return;
    }

    res.json(result);
  } catch (err) {
    logger.error({ err }, "AI call failed");
    res.status(500).json({ error: "Falha ao processar o cálculo. Tente novamente." });
  }
});

export default router;
