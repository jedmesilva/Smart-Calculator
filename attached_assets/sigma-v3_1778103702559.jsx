import { useState, useRef, useEffect } from "react";
import { Sigma, ArrowUp, X, ChevronRight, Clock, BookOpen, Plus, Trash2, Bookmark, Loader, Menu } from "lucide-react";

const c = {
  bg:      "#F7F6F3",
  panel:   "#EFEFEC",
  surface: "#E8E7E3",
  text:    "#1A1A18",
  mid:     "#6B6B66",
  faint:   "#AEADA8",
  ghost:   "#C8C7C2",
  mono:    "'Courier New', monospace",
  sans:    "'DM Sans', sans-serif",
};

const MOCK_SESSIONS = [
  { id: "1", title: "Juros compostos de R$ 1.000 por 12 meses", formulaName: "Juros Compostos", savedAt: Date.now() - 86400000 },
  { id: "2", title: "IMC com 75kg e 1.75m de altura",            formulaName: "IMC",             savedAt: Date.now() - 172800000 },
  { id: "3", title: "Área de um círculo com raio 5cm",           formulaName: "Área do Círculo", savedAt: Date.now() - 259200000 },
];

const MOCK_FORMULAS = [
  { id: "juros-compostos", name: "Juros Compostos",     category: "Financeiro", description: "Montante com juros sobre juros ao longo do tempo", symbolic: "M = C × (1 + i)ⁿ" },
  { id: "imc",             name: "IMC",                 category: "Saúde",      description: "Índice de Massa Corporal",                         symbolic: "IMC = peso / altura²" },
  { id: "regra-tres",      name: "Regra de Três",       category: "Básico",     description: "Proporção simples ou composta entre grandezas",    symbolic: "a/b = c/x" },
  { id: "area-circulo",    name: "Área do Círculo",     category: "Geometria",  description: "Área de um círculo a partir do raio",              symbolic: "A = π × r²" },
  { id: "desconto",        name: "Desconto Percentual", category: "Financeiro", description: "Valor final após aplicar desconto",                symbolic: "V = P × (1 - d/100)" },
  { id: "velocidade",      name: "Velocidade Média",    category: "Física",     description: "Relação entre distância, tempo e velocidade",      symbolic: "v = Δs / Δt" },
  { id: "user-1",          name: "Minha Fórmula",       category: "Minhas",     description: "Fórmula personalizada salva",                      symbolic: "x = a + b", isUser: true },
];

const MOCK_CHAT = [
  { kind: "user",   text: "Quanto rende R$ 1.000 aplicado a 1% ao mês por 12 meses?" },
  { kind: "result", result: { formulaName: "Juros Compostos", resultFormatted: "1.126,83", resultUnit: "R$", resultLabel: "montante final", formulaSymbolic: "M = C × (1 + i)ⁿ", formulaSubstituted: "M = 1000 × (1 + 0,01)¹²" } },
  { kind: "user",   text: "E se fossem 24 meses?" },
  { kind: "result", result: { formulaName: "Juros Compostos", resultFormatted: "1.269,73", resultUnit: "R$", resultLabel: "montante final", formulaSymbolic: "M = C × (1 + i)ⁿ", formulaSubstituted: "M = 1000 × (1 + 0,01)²⁴" } },
];

const MOCK_OVERLAY = {
  formulaName: "Juros Compostos",
  formulaSymbolic: "M = C × (1 + i)ⁿ",
  formulaSubstituted: "M = 1000 × (1 + 0,01)¹²",
  resultFormatted: "1.126,83",
  resultUnit: "R$",
  resultLabel: "montante final",
  variables: [
    { symbol: "C", name: "Capital inicial", value: "R$ 1.000" },
    { symbol: "i", name: "Taxa de juros",   value: "1% ao mês" },
    { symbol: "n", name: "Período",         value: "12 meses" },
  ],
  steps: [
    "Converter taxa: i = 1% = 0,01",
    "Aplicar a fórmula: M = 1000 × (1 + 0,01)¹²",
    "Calcular (1,01)¹² = 1,126825…",
    "Multiplicar: M = 1000 × 1,126825 = 1.126,83",
  ],
  note: "O rendimento total foi de R$ 126,83 sobre o capital inicial.",
};

/* ─── CALC OVERLAY ─── */
function CalcOverlay({ onClose }) {
  const d = MOCK_OVERLAY;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, background: c.bg, display: "flex", flexDirection: "column", fontFamily: c.sans, animation: "overlayIn 0.3s cubic-bezier(0.16,1,0.3,1)" }}>
      <div style={{ padding: "22px 28px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: c.text }}>{d.formulaName}</p>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: c.faint, padding: 4, display: "flex" }}>
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 28px 28px" }}>
        <div style={{ background: c.panel, borderRadius: 14, padding: "18px 20px", marginBottom: 28 }}>
          <p style={{ margin: "0 0 8px", fontFamily: c.mono, fontSize: 12, color: c.faint }}>{d.formulaSymbolic}</p>
          <p style={{ margin: 0, fontFamily: c.mono, fontSize: 15, color: c.text, fontWeight: 700 }}>{d.formulaSubstituted}</p>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 10, color: c.faint, letterSpacing: "0.1em", textTransform: "uppercase" }}>Variáveis</p>
        <div style={{ marginBottom: 28 }}>
          {d.variables.map((v, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: `1px solid ${c.surface}` }}>
              <span style={{ fontFamily: c.mono, fontWeight: 700, color: c.mid, fontSize: 13, minWidth: 22 }}>{v.symbol}</span>
              <span style={{ color: c.faint, fontSize: 13, flex: 1 }}>{v.name}</span>
              <span style={{ color: c.text, fontSize: 13, fontWeight: 600 }}>{v.value}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 10, color: c.faint, letterSpacing: "0.1em", textTransform: "uppercase" }}>Passo a passo</p>
        {d.steps.map((step, i) => (
          <div key={i} style={{ display: "flex", gap: 16, padding: "11px 0", borderBottom: i < d.steps.length - 1 ? `1px solid ${c.surface}` : "none", alignItems: "flex-start" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: c.ghost, minWidth: 18, paddingTop: 2, fontFamily: c.mono, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
            <span style={{ fontSize: 13, color: c.mid, lineHeight: 1.65 }}>{step}</span>
          </div>
        ))}
        {d.note && <p style={{ fontSize: 11, color: c.faint, fontStyle: "italic", marginTop: 14 }}>* {d.note}</p>}
      </div>
      <div style={{ padding: "18px 28px 28px", background: c.panel, display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 13, color: c.faint }}>{d.resultLabel}</span>
        <span style={{ fontSize: 18, color: c.mid, fontWeight: 500, marginLeft: 8 }}>{d.resultUnit}</span>
        <span style={{ fontSize: 44, fontWeight: 700, color: c.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{d.resultFormatted}</span>
      </div>
    </div>
  );
}

/* ─── HISTORY OVERLAY ─── */
function HistoryOverlay({ onClose, onSelect }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, background: c.bg, display: "flex", flexDirection: "column", fontFamily: c.sans, animation: "overlayIn 0.3s cubic-bezier(0.16,1,0.3,1)" }}>
      <div style={{ padding: "22px 28px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: c.text }}>Histórico</p>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: c.faint, padding: 4, display: "flex" }}>
          <X size={18} strokeWidth={1.75} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 28px 28px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {MOCK_SESSIONS.map((s, i) => (
            <div key={s.id} onClick={onSelect}
              style={{ background: c.panel, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "background 0.12s", animation: `rowIn 0.2s ease ${i * 0.05}s both` }}
              onMouseEnter={e => e.currentTarget.style.background = c.surface}
              onMouseLeave={e => e.currentTarget.style.background = c.panel}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 600, color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</p>
                <p style={{ margin: 0, fontSize: 11, color: c.faint }}>{s.formulaName} · {new Date(s.savedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <button onClick={e => e.stopPropagation()} style={{ background: "none", border: "none", cursor: "pointer", color: c.ghost, padding: 4, display: "flex" }}>
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
              <ChevronRight size={13} color={c.ghost} strokeWidth={1.75} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── FORMULAS SCREEN ─── */
function FormulasScreen({ onSelect, onClose }) {
  const [showMine, setShowMine] = useState(false);
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState("Todos");
  const [saved, setSaved]       = useState(new Set());

  const base = showMine ? MOCK_FORMULAS.filter(f => f.isUser) : MOCK_FORMULAS.filter(f => !f.isUser);
  const list = base.filter(f => {
    const q = search.toLowerCase();
    return (f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q))
      && (showMine || category === "Todos" || f.category === category);
  });

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, background: c.bg, display: "flex", flexDirection: "column", fontFamily: c.sans, animation: "overlayIn 0.3s cubic-bezier(0.16,1,0.3,1)" }}>
      <div style={{ padding: "22px 28px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: c.text }}>{showMine ? "Minhas fórmulas" : "Fórmulas"}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => { setShowMine(v => !v); setSearch(""); }}
              style={{ background: showMine ? c.text : "none", border: "none", cursor: "pointer", color: showMine ? "#fff" : c.ghost, padding: "5px 7px", borderRadius: 8, display: "flex", alignItems: "center", transition: "all 0.15s" }}>
              <Bookmark size={15} strokeWidth={1.75} fill={showMine ? "#fff" : "none"} />
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: c.faint, padding: 4, display: "flex" }}>
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div style={{ background: c.panel, borderRadius: 10, padding: "9px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <Sigma size={13} color={c.ghost} strokeWidth={2} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar fórmula…"
            style={{ flex: 1, border: "none", background: "transparent", fontFamily: c.sans, fontSize: 13, color: c.text, outline: "none" }} />
          {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: c.ghost, padding: 0, display: "flex" }}><X size={13} /></button>}
        </div>
      </div>
      {!showMine && (
        <div style={{ padding: "8px 28px", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
            {["Todos", "Financeiro", "Saúde", "Básico", "Geometria", "Física"].map(cat => (
              <button key={cat} onClick={() => setCategory(cat)} style={{
                padding: "5px 12px", borderRadius: 8, border: "none",
                background: category === cat ? c.text : c.panel,
                color: category === cat ? "#fff" : c.mid,
                fontSize: 12, fontWeight: 500, cursor: "pointer",
                whiteSpace: "nowrap", fontFamily: c.sans, transition: "all 0.15s", flexShrink: 0,
              }}>{cat}</button>
            ))}
          </div>
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 28px 28px" }}>
        {list.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160 }}>
            <span style={{ fontSize: 13, color: c.ghost }}>{showMine ? "Nenhuma fórmula salva ainda" : "Nenhum resultado"}</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {list.map((f, i) => (
              <div key={f.id} onClick={() => onSelect(f)}
                style={{ background: c.panel, borderRadius: 12, padding: "14px 16px", cursor: "pointer", transition: "background 0.12s", animation: `rowIn 0.2s ease ${i * 0.04}s both` }}
                onMouseEnter={e => e.currentTarget.style.background = c.surface}
                onMouseLeave={e => e.currentTarget.style.background = c.panel}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div>
                    <span style={{ fontSize: 10, color: c.faint, letterSpacing: "0.08em", textTransform: "uppercase" }}>{f.category}</span>
                    <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 600, color: c.text }}>{f.name}</p>
                  </div>
                  {f.isUser
                    ? <button onClick={e => e.stopPropagation()} style={{ background: "none", border: "none", cursor: "pointer", color: c.ghost, padding: 2, display: "flex" }}><Trash2 size={13} strokeWidth={1.75} /></button>
                    : <button onClick={e => { e.stopPropagation(); setSaved(prev => new Set([...prev, f.id])); }} style={{ background: "none", border: "none", cursor: "pointer", color: saved.has(f.id) ? c.mid : c.ghost, padding: 2, display: "flex", transition: "color 0.15s" }}>
                        <Bookmark size={13} strokeWidth={1.75} fill={saved.has(f.id) ? c.mid : "none"} />
                      </button>
                  }
                </div>
                <p style={{ margin: "0 0 8px", fontSize: 12, color: c.faint, lineHeight: 1.5 }}>{f.description}</p>
                <span style={{ fontFamily: c.mono, fontSize: 11, color: c.mid }}>{f.symbolic}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── CHAT ITEMS ─── */
function UserBubble({ text }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div style={{ maxWidth: "72%", padding: "10px 14px", background: c.panel, borderRadius: "14px 14px 4px 14px", fontSize: 13, color: c.text, lineHeight: 1.55 }}>{text}</div>
    </div>
  );
}

function ResultRow({ result, onView, saved }) {
  return (
    <div style={{ background: c.panel, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 600, color: c.text }}>{result.formulaName}</p>
          <p style={{ margin: 0, fontFamily: c.mono, fontSize: 11, color: c.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{result.formulaSubstituted}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            {result.resultUnit && <span style={{ fontSize: 11, color: c.faint, marginRight: 3 }}>{result.resultUnit}</span>}
            <span style={{ fontSize: 18, fontWeight: 700, color: c.text, letterSpacing: "-0.02em" }}>{result.resultFormatted}</span>
          </div>
          <button onClick={onView}
            style={{ display: "flex", alignItems: "center", gap: 4, background: c.surface, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: c.mid, fontSize: 11, fontWeight: 600, fontFamily: c.sans, transition: "background 0.12s" }}
            onMouseEnter={e => e.currentTarget.style.background = c.ghost}
            onMouseLeave={e => e.currentTarget.style.background = c.surface}
          >
            <Sigma size={11} strokeWidth={2} />
            ver
          </button>
        </div>
      </div>
      {!saved ? (
        <button style={{ width: "100%", padding: "8px 16px", background: "none", border: "none", borderTop: `1px solid ${c.surface}`, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: c.ghost, cursor: "pointer", fontFamily: c.sans, transition: "background 0.12s", textAlign: "left" }}
          onMouseEnter={e => e.currentTarget.style.background = c.surface}
          onMouseLeave={e => e.currentTarget.style.background = "none"}
        >
          <Bookmark size={11} strokeWidth={1.75} />
          Salvar como minha fórmula
        </button>
      ) : (
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${c.surface}`, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: c.faint }}>
          <Bookmark size={11} strokeWidth={1.75} fill={c.faint} />
          Salva em Minhas fórmulas
        </div>
      )}
    </div>
  );
}

function LoadingDots() {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: c.ghost, flexShrink: 0, marginTop: 14 }} />
      <div style={{ padding: "11px 15px", background: c.panel, borderRadius: "4px 14px 14px 14px", display: "flex", alignItems: "center", gap: 5 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: c.ghost, animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
        ))}
      </div>
    </div>
  );
}

/* ─── MAIN ─── */
export default function App() {
  const [query, setQuery]                 = useState("");
  const [screen, setScreen]               = useState("main");
  const [activeFormula, setActiveFormula] = useState(null);
  const [isLoading, setIsLoading]         = useState(false);
  const [chat, setChat]                   = useState(MOCK_CHAT);
  const chatEndRef  = useRef(null);
  const textareaRef = useRef(null);

  const current    = chat.filter(x => x.kind === "result").at(-1)?.result || null;
  const hasResult  = !!current;
  const displayNum = hasResult ? current.resultFormatted : "0";

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat, isLoading]);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + "px";
    }
  }, [query]);

  const handleSend = () => {
    if (!query.trim() || isLoading) return;
    const text = query.trim();
    setQuery("");
    setChat(prev => [...prev, { kind: "user", text }]);
    setIsLoading(true);
    setTimeout(() => {
      setChat(prev => [...prev, { kind: "result", result: { formulaName: "Juros Compostos", resultFormatted: "1.480,24", resultUnit: "R$", resultLabel: "montante final", formulaSymbolic: "M = C × (1 + i)ⁿ", formulaSubstituted: "M = 1000 × (1 + 0,01)³⁶" } }]);
      setIsLoading(false);
    }, 1400);
  };

  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const canSend = query.trim() && !isLoading;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; background: ${c.bg}; }
        @keyframes overlayIn { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes numIn     { from { opacity:0; transform:translateY(6px)  } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse     { 0%,100%{opacity:.2} 50%{opacity:.7} }
        @keyframes rowIn     { from { opacity:0; transform:translateY(5px)  } to { opacity:1; transform:translateY(0) } }
        @keyframes spin      { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
        textarea { outline: none; }
        textarea::placeholder { color: ${c.ghost}; }
        input::placeholder    { color: ${c.ghost}; }
        input { outline: none; }
        ::-webkit-scrollbar { width: 0px; }
      `}</style>

      <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: c.sans, background: c.bg, overflow: "hidden", minHeight: 0, position: "relative" }}>

        {/* ── DISPLAY PANEL ── */}
        <div style={{ flexShrink: 0, height: "42%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "22px 28px 24px" }}>

          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <button onClick={() => {}} style={{ width: 30, height: 30, borderRadius: 8, background: "none", border: "none", cursor: "pointer", color: c.ghost, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Menu size={15} strokeWidth={1.75} />
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: c.text, letterSpacing: "-0.02em" }}>sigma</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => {}} style={{ width: 30, height: 30, borderRadius: 8, background: "none", border: "none", cursor: "pointer", color: c.ghost, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Plus size={16} strokeWidth={1.75} />
              </button>
              <button onClick={() => setScreen("history")} style={{ width: 30, height: 30, borderRadius: 8, background: "none", border: "none", cursor: "pointer", color: c.ghost, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Clock size={15} strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {/* Número grande */}
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              {hasResult && current.resultUnit && (
                <span style={{ fontSize: 20, fontWeight: 400, color: c.faint, lineHeight: 1, animation: "numIn 0.4s cubic-bezier(0.16,1,0.3,1)" }}>
                  {current.resultUnit}
                </span>
              )}
              <span key={displayNum} style={{
                fontSize: hasResult ? (displayNum.length > 12 ? 38 : displayNum.length > 8 ? 50 : 64) : 64,
                fontWeight: 700,
                color: hasResult ? c.text : c.ghost,
                letterSpacing: "-0.04em",
                lineHeight: 1,
                animation: "numIn 0.4s cubic-bezier(0.16,1,0.3,1)",
                transition: "color 0.3s ease",
              }}>{displayNum}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: hasResult ? c.faint : c.ghost, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {hasResult ? current.resultLabel : "resultado"}
              </span>
              <button
                onClick={() => hasResult && setScreen("calc")}
                disabled={!hasResult}
                style={{ display: "flex", alignItems: "center", gap: 5, background: hasResult ? c.panel : "transparent", border: "none", borderRadius: 9, padding: hasResult ? "6px 12px" : "6px 0", color: hasResult ? c.mid : c.ghost, fontSize: 12, fontWeight: 600, cursor: hasResult ? "pointer" : "default", fontFamily: c.sans, transition: "all 0.2s", opacity: hasResult ? 1 : 0.4 }}
                onMouseEnter={e => { if (hasResult) e.currentTarget.style.background = c.surface; }}
                onMouseLeave={e => { if (hasResult) e.currentTarget.style.background = c.panel; }}
              >
                <Sigma size={12} strokeWidth={2} />
                ver cálculo
                {hasResult && <ChevronRight size={11} strokeWidth={2.5} />}
              </button>
            </div>
          </div>
        </div>

        {/* ── FORMULA ROW ── */}
        <div
          onClick={() => setScreen("formulas")}
          style={{ flexShrink: 0, padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 44, background: activeFormula ? c.panel : "transparent", transition: "background 0.2s", cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.background = activeFormula ? c.surface : c.panel}
          onMouseLeave={e => e.currentTarget.style.background = activeFormula ? c.panel : "transparent"}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <BookOpen size={11} color={activeFormula ? c.mid : c.ghost} strokeWidth={2} />
            <span style={{ fontSize: 11, color: activeFormula ? c.text : c.faint, fontWeight: activeFormula ? 600 : 400, transition: "all 0.2s" }}>
              {activeFormula ? activeFormula.name : "Modo livre"}
            </span>
            {activeFormula && (
              <span style={{ fontFamily: c.mono, fontSize: 11, color: c.mid, marginLeft: 4 }}>{activeFormula.symbolic}</span>
            )}
          </div>
          {activeFormula ? (
            <button
              onClick={e => { e.stopPropagation(); setActiveFormula(null); }}
              style={{ display: "flex", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", color: c.faint, fontSize: 11, fontFamily: c.sans, padding: "4px 0" }}
            >
              <X size={11} strokeWidth={2} />
              remover
            </button>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 3, color: c.ghost, fontSize: 11 }}>
              alterar <ChevronRight size={11} strokeWidth={2} />
            </span>
          )}
        </div>

        {/* ── CHAT ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, height: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 28px 8px", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ flex: 1 }} />
              {chat.map((item, i) => {
                if (item.kind === "user")   return <UserBubble key={i} text={item.text} />;
                if (item.kind === "result") return <ResultRow key={i} result={item.result} onView={() => setScreen("calc")} saved={i < chat.length - 2} />;
                return null;
              })}
              {isLoading && <LoadingDots />}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* ── INPUT ── */}
          <div style={{ padding: "8px 28px 24px", flexShrink: 0 }}>
            <div style={{ background: c.panel, borderRadius: 16, padding: "12px 12px 12px 18px", display: "flex", gap: 10, alignItems: "flex-end" }}>
              <textarea
                ref={textareaRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Descreva o cálculo…"
                rows={1}
                style={{ flex: 1, border: "none", background: "transparent", fontFamily: c.sans, fontSize: 13, color: c.text, resize: "none", lineHeight: 1.5, minHeight: 24, maxHeight: 100, padding: "4px 0" }}
              />
              <button
                onClick={handleSend}
                disabled={!canSend}
                style={{ width: 30, height: 30, borderRadius: 10, border: "none", background: canSend ? c.text : c.surface, color: canSend ? c.bg : c.ghost, cursor: canSend ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.2s, color 0.2s" }}
              >
                {isLoading
                  ? <Loader size={13} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
                  : <ArrowUp size={14} strokeWidth={2.5} />
                }
              </button>
            </div>
          </div>
        </div>

        {/* ── OVERLAYS ── */}
        {screen === "calc"     && <CalcOverlay onClose={() => setScreen("main")} />}
        {screen === "history"  && <HistoryOverlay onClose={() => setScreen("main")} onSelect={() => setScreen("main")} />}
        {screen === "formulas" && <FormulasScreen onSelect={f => { setActiveFormula(f); setScreen("main"); }} onClose={() => setScreen("main")} />}
      </div>
    </>
  );
}
