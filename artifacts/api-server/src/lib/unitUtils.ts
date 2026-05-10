/* ═══════════════════════════════════════════════════════
   unitUtils — Sistema canônico de unidades

   Resolve dois problemas:
   1. Normalização: mapeia qualquer variante de texto que o LLM
      possa retornar para um símbolo canônico (ex: "reais" → "R$")
   2. Tipagem + formatação: cada tipo de unidade tem regras próprias
      de casas decimais, multiplicadores e posicionamento (prefixo/sufixo)
   ═══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   Tipos
   ══════════════════════════════════════════════════════ */

export type UnitType =
  | "currency"      // R$, $, € — 2 casas, exibir como prefixo
  | "percent"       // % — valor × 100, até 4 casas, sem espaço antes do %
  | "physical"      // m, kg, m², km/h etc. — 2–4 casas, sufixo
  | "time"          // s, min, h, dias, meses, anos — inteiro ou 2 casas, sufixo
  | "temperature"   // °C, °F, K — 1–2 casas, sufixo
  | "count"         // pessoas, itens, unidades — inteiro, sufixo
  | "angle"         // ° (grau), rad — 4 casas, sufixo
  | "dimensionless" // adimensional, razão, índice — max 6 casas, sem unidade
  | "custom";       // qualquer outra string retornada pelo LLM — sufixo, 2–4 casas

export type NormalizedUnit = {
  symbol: string;   // símbolo canônico final (ex: "R$", "%", "m²")
  type: UnitType;
};

/* ══════════════════════════════════════════════════════
   Mapa de normalização
   Chave: lower-case, trim. Valor: NormalizedUnit canônico.
   ══════════════════════════════════════════════════════ */

const UNIT_MAP: Record<string, NormalizedUnit> = {
  // ── Moeda BRL
  "r$": { symbol: "R$", type: "currency" },
  "brl": { symbol: "R$", type: "currency" },
  "reais": { symbol: "R$", type: "currency" },
  "real": { symbol: "R$", type: "currency" },
  "r$ (reais)": { symbol: "R$", type: "currency" },

  // ── Moeda USD
  "$": { symbol: "$", type: "currency" },
  "usd": { symbol: "$", type: "currency" },
  "dólar": { symbol: "$", type: "currency" },
  "dolar": { symbol: "$", type: "currency" },
  "dólares": { symbol: "$", type: "currency" },
  "dolares": { symbol: "$", type: "currency" },
  "us$": { symbol: "$", type: "currency" },
  "us dollar": { symbol: "$", type: "currency" },

  // ── Moeda EUR
  "€": { symbol: "€", type: "currency" },
  "eur": { symbol: "€", type: "currency" },
  "euro": { symbol: "€", type: "currency" },
  "euros": { symbol: "€", type: "currency" },

  // ── Moeda GBP
  "£": { symbol: "£", type: "currency" },
  "gbp": { symbol: "£", type: "currency" },
  "libra": { symbol: "£", type: "currency" },
  "libras": { symbol: "£", type: "currency" },

  // ── Percentual
  "%": { symbol: "%", type: "percent" },
  "porcentagem": { symbol: "%", type: "percent" },
  "porcento": { symbol: "%", type: "percent" },
  "por cento": { symbol: "%", type: "percent" },
  "percent": { symbol: "%", type: "percent" },
  "percentual": { symbol: "%", type: "percent" },
  "% (porcentagem)": { symbol: "%", type: "percent" },
  "% ao ano": { symbol: "% a.a.", type: "percent" },
  "% ao mês": { symbol: "% a.m.", type: "percent" },
  "% a.a.": { symbol: "% a.a.", type: "percent" },
  "% a.m.": { symbol: "% a.m.", type: "percent" },
  "a.a.": { symbol: "% a.a.", type: "percent" },
  "a.m.": { symbol: "% a.m.", type: "percent" },

  // ── Comprimento
  "m": { symbol: "m", type: "physical" },
  "metro": { symbol: "m", type: "physical" },
  "metros": { symbol: "m", type: "physical" },
  "km": { symbol: "km", type: "physical" },
  "quilômetro": { symbol: "km", type: "physical" },
  "quilometro": { symbol: "km", type: "physical" },
  "quilômetros": { symbol: "km", type: "physical" },
  "quilometros": { symbol: "km", type: "physical" },
  "cm": { symbol: "cm", type: "physical" },
  "centímetro": { symbol: "cm", type: "physical" },
  "centimetro": { symbol: "cm", type: "physical" },
  "centímetros": { symbol: "cm", type: "physical" },
  "centimetros": { symbol: "cm", type: "physical" },
  "mm": { symbol: "mm", type: "physical" },
  "milímetro": { symbol: "mm", type: "physical" },
  "milimetro": { symbol: "mm", type: "physical" },
  "milímetros": { symbol: "mm", type: "physical" },
  "milimetros": { symbol: "mm", type: "physical" },

  // ── Área
  "m²": { symbol: "m²", type: "physical" },
  "m2": { symbol: "m²", type: "physical" },
  "metros quadrados": { symbol: "m²", type: "physical" },
  "metro quadrado": { symbol: "m²", type: "physical" },
  "km²": { symbol: "km²", type: "physical" },
  "km2": { symbol: "km²", type: "physical" },
  "cm²": { symbol: "cm²", type: "physical" },
  "cm2": { symbol: "cm²", type: "physical" },
  "ha": { symbol: "ha", type: "physical" },
  "hectare": { symbol: "ha", type: "physical" },
  "hectares": { symbol: "ha", type: "physical" },

  // ── Volume
  "m³": { symbol: "m³", type: "physical" },
  "m3": { symbol: "m³", type: "physical" },
  "metros cúbicos": { symbol: "m³", type: "physical" },
  "l": { symbol: "L", type: "physical" },
  "litro": { symbol: "L", type: "physical" },
  "litros": { symbol: "L", type: "physical" },
  "ml": { symbol: "mL", type: "physical" },
  "mililitro": { symbol: "mL", type: "physical" },
  "mililitros": { symbol: "mL", type: "physical" },

  // ── Massa
  "kg": { symbol: "kg", type: "physical" },
  "quilograma": { symbol: "kg", type: "physical" },
  "quilogramas": { symbol: "kg", type: "physical" },
  "quilo": { symbol: "kg", type: "physical" },
  "quilos": { symbol: "kg", type: "physical" },
  "g": { symbol: "g", type: "physical" },
  "grama": { symbol: "g", type: "physical" },
  "gramas": { symbol: "g", type: "physical" },
  "t": { symbol: "t", type: "physical" },
  "tonelada": { symbol: "t", type: "physical" },
  "toneladas": { symbol: "t", type: "physical" },
  "mg": { symbol: "mg", type: "physical" },
  "miligrama": { symbol: "mg", type: "physical" },

  // ── Velocidade
  "m/s": { symbol: "m/s", type: "physical" },
  "metros por segundo": { symbol: "m/s", type: "physical" },
  "km/h": { symbol: "km/h", type: "physical" },
  "quilômetros por hora": { symbol: "km/h", type: "physical" },
  "quilometros por hora": { symbol: "km/h", type: "physical" },

  // ── Energia / Potência
  "j": { symbol: "J", type: "physical" },
  "joule": { symbol: "J", type: "physical" },
  "joules": { symbol: "J", type: "physical" },
  "kj": { symbol: "kJ", type: "physical" },
  "w": { symbol: "W", type: "physical" },
  "watt": { symbol: "W", type: "physical" },
  "watts": { symbol: "W", type: "physical" },
  "kw": { symbol: "kW", type: "physical" },
  "kwh": { symbol: "kWh", type: "physical" },

  // ── Pressão / Força
  "n": { symbol: "N", type: "physical" },
  "newton": { symbol: "N", type: "physical" },
  "pa": { symbol: "Pa", type: "physical" },
  "pascal": { symbol: "Pa", type: "physical" },

  // ── Tempo
  "s": { symbol: "s", type: "time" },
  "segundo": { symbol: "s", type: "time" },
  "segundos": { symbol: "s", type: "time" },
  "seg": { symbol: "s", type: "time" },
  "min": { symbol: "min", type: "time" },
  "minuto": { symbol: "min", type: "time" },
  "minutos": { symbol: "min", type: "time" },
  "h": { symbol: "h", type: "time" },
  "hora": { symbol: "h", type: "time" },
  "horas": { symbol: "h", type: "time" },
  "hr": { symbol: "h", type: "time" },
  "hrs": { symbol: "h", type: "time" },
  "dia": { symbol: "dias", type: "time" },
  "dias": { symbol: "dias", type: "time" },
  "semana": { symbol: "semanas", type: "time" },
  "semanas": { symbol: "semanas", type: "time" },
  "mês": { symbol: "meses", type: "time" },
  "mes": { symbol: "meses", type: "time" },
  "meses": { symbol: "meses", type: "time" },
  "ano": { symbol: "anos", type: "time" },
  "anos": { symbol: "anos", type: "time" },
  "year": { symbol: "anos", type: "time" },
  "years": { symbol: "anos", type: "time" },

  // ── Temperatura
  "°c": { symbol: "°C", type: "temperature" },
  "celsius": { symbol: "°C", type: "temperature" },
  "grau celsius": { symbol: "°C", type: "temperature" },
  "graus celsius": { symbol: "°C", type: "temperature" },
  "°f": { symbol: "°F", type: "temperature" },
  "fahrenheit": { symbol: "°F", type: "temperature" },
  "k": { symbol: "K", type: "temperature" },
  "kelvin": { symbol: "K", type: "temperature" },

  // ── Ângulo
  "°": { symbol: "°", type: "angle" },
  "grau": { symbol: "°", type: "angle" },
  "graus": { symbol: "°", type: "angle" },
  "rad": { symbol: "rad", type: "angle" },
  "radiano": { symbol: "rad", type: "angle" },
  "radianos": { symbol: "rad", type: "angle" },

  // ── Adimensional / sem unidade
  "": { symbol: "", type: "dimensionless" },
  "adimensional": { symbol: "", type: "dimensionless" },
  "sem unidade": { symbol: "", type: "dimensionless" },
  "unitless": { symbol: "", type: "dimensionless" },
  "nenhum": { symbol: "", type: "dimensionless" },
  "none": { symbol: "", type: "dimensionless" },
  "n/a": { symbol: "", type: "dimensionless" },
  "razão": { symbol: "", type: "dimensionless" },
  "razao": { symbol: "", type: "dimensionless" },
  "índice": { symbol: "", type: "dimensionless" },
  "indice": { symbol: "", type: "dimensionless" },
  "score": { symbol: "", type: "dimensionless" },
  "pure": { symbol: "", type: "dimensionless" },

  // ── Contagem
  "pessoas": { symbol: "pessoas", type: "count" },
  "pessoa": { symbol: "pessoas", type: "count" },
  "itens": { symbol: "itens", type: "count" },
  "item": { symbol: "itens", type: "count" },
  "unidades": { symbol: "unidades", type: "count" },
  "unidade": { symbol: "unidades", type: "count" },
  "vezes": { symbol: "vezes", type: "count" },
  "vez": { symbol: "vezes", type: "count" },
  "parcelas": { symbol: "parcelas", type: "count" },
  "parcela": { symbol: "parcelas", type: "count" },
  "períodos": { symbol: "períodos", type: "count" },
  "periodos": { symbol: "períodos", type: "count" },
  "período": { symbol: "períodos", type: "count" },
  "periodo": { symbol: "períodos", type: "count" },
  "passos": { symbol: "passos", type: "count" },
  "passo": { symbol: "passos", type: "count" },
  "alunos": { symbol: "alunos", type: "count" },
  "aluno": { symbol: "alunos", type: "count" },
  "funcionários": { symbol: "funcionários", type: "count" },
  "funcionarios": { symbol: "funcionários", type: "count" },
};

/* ══════════════════════════════════════════════════════
   normalizeUnit
   Recebe qualquer string que o LLM possa retornar e devolve
   um NormalizedUnit com símbolo canônico e tipo.
   ══════════════════════════════════════════════════════ */

export function normalizeUnit(raw: string): NormalizedUnit {
  const key = (raw ?? "").trim().toLowerCase();

  // Busca direta no mapa
  if (key in UNIT_MAP) return UNIT_MAP[key];

  // Tenta remover plurais triviais (ex: "metros quadrados" não está, mas "metro quadrado" está)
  const singular = key.replace(/s$/, "");
  if (singular in UNIT_MAP) return UNIT_MAP[singular];

  // Heurísticas para símbolos desconhecidos mas reconhecíveis
  if (/^r\$/.test(key)) return { symbol: "R$", type: "currency" };
  if (/grau/.test(key) && /celsius|°c/i.test(key)) return { symbol: "°C", type: "temperature" };
  if (/grau/.test(key)) return { symbol: "°", type: "angle" };
  if (key.includes("km/h") || key.includes("quilômetro") && key.includes("hora")) {
    return { symbol: "km/h", type: "physical" };
  }
  if (key.includes("m/s")) return { symbol: "m/s", type: "physical" };
  if (key.includes("kwh")) return { symbol: "kWh", type: "physical" };
  if (key.includes("m²") || key.includes("m2")) return { symbol: "m²", type: "physical" };
  if (key.includes("m³") || key.includes("m3")) return { symbol: "m³", type: "physical" };

  // Sem correspondência → custom (preserva o símbolo original sem transformação)
  const symbol = raw.trim();
  return { symbol, type: "custom" };
}

/* ══════════════════════════════════════════════════════
   formatValue
   Formata o número de acordo com o tipo de unidade.
   Retorna APENAS o número formatado (sem a unidade).
   A unidade é tratada separadamente na exibição.

   Nota especial sobre %:
   • O valor SEMPRE chega como decimal (0.1 = 10%)
   • formatValue multiplica por 100 e adiciona até 4 casas decimais
   ══════════════════════════════════════════════════════ */

export function formatValue(value: number, unit: NormalizedUnit): string {
  switch (unit.type) {
    case "currency": {
      // Sempre 2 casas decimais (precisão monetária)
      return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    }

    case "percent": {
      // Multiplica por 100 e usa até 4 casas decimais
      const pct = value * 100;
      const decimals = Number.isInteger(pct) ? 0 : Math.min(4, decimalPlaces(pct));
      return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(pct);
    }

    case "physical": {
      // 0 casas se inteiro, senão 2–4 dependendo da magnitude
      const dec = Number.isInteger(value) ? 0 : value < 0.01 ? 6 : value < 1 ? 4 : 2;
      return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      }).format(value);
    }

    case "time": {
      // Inteiro se possível (12 meses, 3 anos), 2 casas se decimal
      const dec = Number.isInteger(value) ? 0 : 2;
      return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      }).format(value);
    }

    case "temperature": {
      // 1–2 casas decimais
      const dec = Number.isInteger(value) ? 0 : value % 0.5 === 0 ? 1 : 2;
      return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      }).format(value);
    }

    case "count": {
      // Sempre inteiro (não faz sentido 2,5 pessoas)
      return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(Math.round(value));
    }

    case "angle": {
      // Até 4 casas decimais
      const dec = Number.isInteger(value) ? 0 : Math.min(4, decimalPlaces(value));
      return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      }).format(value);
    }

    case "dimensionless": {
      // Mantém até 6 casas decimais para razões e índices
      const dec = Number.isInteger(value) ? 0 : Math.min(6, decimalPlaces(value));
      return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      }).format(value);
    }

    default: {
      // custom — 2 casas se decimal, 0 se inteiro
      const dec = Number.isInteger(value) ? 0 : 2;
      return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      }).format(value);
    }
  }
}

/* ══════════════════════════════════════════════════════
   formatWithUnit
   Retorna a string final "valor + unidade" de acordo com o tipo.
   Moedas são prefixo; percentuais sem espaço; demais com espaço.
   ══════════════════════════════════════════════════════ */

export function formatWithUnit(value: number, unit: NormalizedUnit): string {
  const formatted = formatValue(value, unit);

  if (unit.type === "currency") {
    return `${unit.symbol} ${formatted}`;
  }
  if (unit.type === "percent") {
    // "12,5%" sem espaço
    return `${formatted}${unit.symbol}`;
  }
  if (unit.type === "dimensionless" || unit.symbol === "") {
    return formatted;
  }
  // Todos os outros: sufixo com espaço
  return `${formatted} ${unit.symbol}`;
}

/* ══════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════ */

function decimalPlaces(n: number): number {
  const s = Math.abs(n).toString();
  const dot = s.indexOf(".");
  if (dot === -1) return 0;
  return s.length - dot - 1;
}

/* ══════════════════════════════════════════════════════
   Prompt snippet para o LLM (usado no calculatorAgent)
   ══════════════════════════════════════════════════════ */

export const UNIT_PROMPT_RULES = `REGRAS DE UNIDADE para "resultUnit":
Use SEMPRE o símbolo canônico — nunca o nome por extenso:
  moeda BRL → "R$"    |  moeda USD → "$"     |  moeda EUR → "€"
  percentual → "%"    |  a.a. → "% a.a."     |  a.m. → "% a.m."
  metro → "m"         |  quilômetro → "km"    |  centímetro → "cm"
  metros² → "m²"      |  metros³ → "m³"       |  hectare → "ha"
  quilograma → "kg"   |  grama → "g"          |  tonelada → "t"
  litro → "L"         |  mililitro → "mL"
  segundo → "s"       |  minuto → "min"       |  hora → "h"
  dia → "dias"        |  semana → "semanas"   |  mês → "meses"  |  ano → "anos"
  grau Celsius → "°C" |  Fahrenheit → "°F"    |  Kelvin → "K"
  grau (ângulo) → "°" |  radiano → "rad"
  km/h → "km/h"       |  m/s → "m/s"
  adimensional / índice / razão pura → "" (string vazia)
  contagem (pessoas, itens) → use o plural da palavra (ex: "pessoas", "itens")`;
