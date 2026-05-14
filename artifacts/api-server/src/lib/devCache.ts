import { buildDesenvolvimento } from "./explainBuilder";
import { logger } from "./logger";
import type { DesenvolvimentoStep } from "./explainBuilder";

export type DevCacheEntry = {
  steps: DesenvolvimentoStep[];
  interpretacao: string | null;
};

type CacheSlot =
  | { status: "pending"; promise: Promise<void> }
  | { status: "ready"; data: DevCacheEntry }
  | { status: "error" };

const TTL_MS = 30 * 60 * 1000; // 30 minutos
const cache = new Map<string, { slot: CacheSlot; expiresAt: number }>();

export function devCacheKey(
  expression: string,
  solveFor: string,
  computedValue: number
): string {
  return `${expression}::${solveFor}::${computedValue}`;
}

/** Inicia buildDesenvolvimento em background e armazena no cache. */
export function warmDevCache(
  key: string,
  input: Parameters<typeof buildDesenvolvimento>[0]
): void {
  if (cache.has(key)) return; // já está em progresso ou pronto

  const promise = buildDesenvolvimento(input)
    .then((data) => {
      const existing = cache.get(key);
      if (existing) {
        existing.slot = { status: "ready", data };
        existing.expiresAt = Date.now() + TTL_MS;
      }
    })
    .catch((err) => {
      logger.warn({ err, key }, "devCache: buildDesenvolvimento failed");
      const existing = cache.get(key);
      if (existing) {
        existing.slot = { status: "error" };
      }
    });

  cache.set(key, {
    slot: { status: "pending", promise },
    expiresAt: Date.now() + TTL_MS,
  });

  logger.info({ key }, "devCache: warming in background");
}

/** Retorna o resultado do cache se pronto. Undefined se pendente ou erro. */
export async function getFromDevCache(key: string): Promise<DevCacheEntry | null> {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  if (entry.slot.status === "ready") {
    return entry.slot.data;
  }

  if (entry.slot.status === "pending") {
    // Aguarda no máximo 8s pela geração em background antes de prosseguir
    try {
      await Promise.race([
        entry.slot.promise,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 8000)
        ),
      ]);
    } catch {
      // timeout ou erro — cai no fallback on-demand da rota
    }

    const refreshed = cache.get(key);
    if (refreshed?.slot.status === "ready") {
      return (refreshed.slot as { status: "ready"; data: DevCacheEntry }).data;
    }
    return null;
  }

  return null; // status === "error"
}

/** Limpeza periódica de entradas expiradas */
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache.entries()) {
    if (now > v.expiresAt) cache.delete(k);
  }
}, 5 * 60 * 1000);
