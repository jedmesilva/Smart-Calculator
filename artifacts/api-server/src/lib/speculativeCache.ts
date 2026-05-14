/* ═══════════════════════════════════════════════════════
   Cache especulativo em memória — pré-computação enquanto
   o usuário ainda está digitando.

   Chave: query normalizada (lowercase + trim + sem pontuação final)
   TTL: 3 minutos
   Escopo: por userId (não vaza entre usuários)
   ═══════════════════════════════════════════════════════ */

import type { CalculatorResult } from "../agents/calculatorAgent";
import type { IntentReady } from "./orchestrator";
import type { ResultData } from "./explainBuilder";
import type { FormulaInfo, ExpressionResult, ValidationResult } from "../agents/types";
import { logger } from "./logger";

const CACHE_TTL_MS = 3 * 60 * 1000;

export interface SpeculativeEntry {
  calcResult: CalculatorResult;
  intentResult: IntentReady;
  formulaId: string | undefined;
  evalScore: number;
  evalFeedback: string;
  evalApproved: boolean;
  partialResult: ResultData;
  formulaInfo: FormulaInfo;
  exprResult: ExpressionResult;
  validationResult: ValidationResult;
  objective: string;
  warning: string | undefined;
  createdAt: number;
  elapsedMs: number;
  userId: string;
}

const cache = new Map<string, SpeculativeEntry>();

export function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?!.,;]+$/, "")
    .trim();
}

export function setSpeculativeEntry(query: string, entry: SpeculativeEntry): void {
  const key = normalizeQuery(query);
  cache.set(key, entry);
  setTimeout(() => {
    if (cache.get(key)?.createdAt === entry.createdAt) {
      cache.delete(key);
    }
  }, CACHE_TTL_MS);
  logger.info(
    { key: key.slice(0, 60), cacheSize: cache.size, elapsedMs: entry.elapsedMs },
    "speculativeCache: entry stored"
  );
}

export function getSpeculativeEntry(query: string, userId: string): SpeculativeEntry | null {
  const key = normalizeQuery(query);
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.userId !== userId) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  logger.info({ key: key.slice(0, 60), ageMs: Date.now() - entry.createdAt }, "speculativeCache: HIT");
  return entry;
}

export function getCacheStats(): { size: number } {
  return { size: cache.size };
}
