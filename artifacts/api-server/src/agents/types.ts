/* ═══════════════════════════════════════════════════════
   Tipos compartilhados entre todos os agentes do pipeline
   ═══════════════════════════════════════════════════════ */

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type MissingVar = {
  symbol: string;
  name: string;
  description: string;
};

/* ── Fórmula retornada pelo formulaAgent ── */
export type FormulaExpressionMeta = {
  solveFor: string;
  resultUnit: string;
  resultLabel: string;
  variables: { symbol: string; name: string; description: string }[];
};

export type FormulaInfo = {
  id: string | null;
  name: string;
  description: string;
  symbolic: string;
  category: string;
  expression: string | null;
  expression_meta: FormulaExpressionMeta | null;
};

export type FormulaAgentResult =
  | { status: "found"; formula: FormulaInfo }
  | { status: "wrong_formula"; message: string; suggestion: string | null }
  | { status: "not_found"; message: string };

/* ── Valores extraídos pelo contextAgent ── */
export type RawEntity = {
  label: string;
  value: number;
  humanReadable: string;
  unit: string;
};

export type ContextAgentResult = {
  entities: RawEntity[];
  rawText: string;
  needsHistory?: boolean;
};

/* ── Expressão validada pelo expressionAgent ── */
export type ExpressionResult = {
  expression: string;
  solveFor: string;
  extracted: Record<string, number>;
  variableNames: Record<string, string>;
  variableValues: Record<string, string>;
  resultUnit: string;
  resultLabel: string;
  formulaSubstituted: string;
  searchUsed: boolean;
  allPresent: boolean;
  missing: MissingVar[];
};

/* ── Prova reversa do validationAgent ── */
export type ProofTipo = "inversa" | "derivacao" | "substituicao" | "razoabilidade";

export type ValidationResult = {
  valid: boolean;
  method: string;
  detail: string;
  tipo: ProofTipo;
  latex?: string | null;
};

/* ── Resultado da validação de fórmula (cadastro) ── */
export type FormulaValidationResult = {
  approved: boolean;
  issues: string[];
  suggestions: string[];
  testedValues?: Record<string, number>;
  testedResult?: number;
};
