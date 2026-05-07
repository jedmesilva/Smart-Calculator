import { Router } from "express";
import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const CalcBody = z.object({
  query: z.string().min(1).max(1000),
  formulaId: z.string().uuid().optional(),
});

const SYSTEM_PROMPT = `Você é Sigma, uma calculadora inteligente em português brasileiro.
O usuário descreve um cálculo em linguagem natural e você resolve com precisão matemática.

Responda APENAS com JSON válido, sem markdown, sem blocos de código, sem texto adicional.

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
}

Regras:
- Use vírgula como separador decimal e ponto como separador de milhar (padrão pt-BR)
- Inclua pelo menos 2 passos no passo-a-passo
- Se o cálculo envolver dinheiro use R$ na unidade
- Seja preciso nos cálculos — verifique a matemática antes de responder
- Se o usuário não fornecer dados suficientes, faça uma estimativa razoável e explique na note`;

router.post("/calculate", requireAuth, async (req, res) => {
  const parsed = CalcBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    return;
  }

  const { query } = parsed.data;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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
