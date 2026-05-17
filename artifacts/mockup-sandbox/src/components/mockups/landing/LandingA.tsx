export default function LandingA() {
  return (
    <div style={{ fontFamily: "Inter, sans-serif", backgroundColor: "#F7F6F3", minHeight: "100vh", color: "#1A1A18" }}>
      {/* Nav */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 64px", borderBottom: "1px solid #E8E7E3" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1 }}>φ</span>
          <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.5 }}>Phormula</span>
        </div>
        <div style={{ display: "flex", gap: 32, fontSize: 14, color: "#6B6B66" }}>
          <span style={{ cursor: "pointer" }}>Como funciona</span>
          <span style={{ cursor: "pointer" }}>Fórmulas</span>
          <span style={{ cursor: "pointer" }}>Planos</span>
        </div>
        <button style={{ backgroundColor: "#1A1A18", color: "#F7F6F3", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer", letterSpacing: -0.2 }}>
          Baixar app
        </button>
      </nav>

      {/* Hero */}
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "100px 64px 80px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, backgroundColor: "#EFEFEC", borderRadius: 99, padding: "6px 14px", fontSize: 12, color: "#6B6B66", marginBottom: 40, letterSpacing: 0.2 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#34C759", display: "inline-block" }} />
          Agora disponível no iOS e Android
        </div>
        <h1 style={{ fontSize: 72, fontWeight: 800, letterSpacing: -3, lineHeight: 1.05, maxWidth: 760, margin: "0 0 24px" }}>
          Seu gênio<br />
          <span style={{ color: "#AEADA8" }}>matemático</span><br />
          pessoal
        </h1>
        <p style={{ fontSize: 19, color: "#6B6B66", maxWidth: 520, lineHeight: 1.6, margin: "0 0 48px", fontWeight: 400 }}>
          Descreva qualquer cálculo em português e o Phormula resolve — com fórmula, passo a passo e explicação.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button style={{ display: "flex", alignItems: "center", gap: 10, backgroundColor: "#1A1A18", color: "#F7F6F3", border: "none", borderRadius: 14, padding: "14px 24px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.2 1.29-2.18 3.85.03 3.05 2.68 4.06 2.71 4.07l-.08.2zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            App Store
          </button>
          <button style={{ display: "flex", alignItems: "center", gap: 10, backgroundColor: "#EFEFEC", color: "#1A1A18", border: "none", borderRadius: 14, padding: "14px 24px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.76c.3.17.66.19.99.07l12.35-6.9-2.93-2.93-10.41 9.76zM.29 1.79C.11 2.1 0 2.5 0 3v18c0 .5.11.9.29 1.21l.07.06 10.08-10.08v-.24L.36 1.73l-.07.06zM20.29 10.23l-2.64-1.48-3.27 3.27 3.27 3.27 2.65-1.49c.76-.43.76-1.12-.01-1.57zM4.17.25l12.35 6.9-2.93 2.93L3.18.32c.33-.12.69-.1.99-.07z"/></svg>
            Google Play
          </button>
        </div>
      </section>

      {/* Chat preview mockup */}
      <section style={{ display: "flex", justifyContent: "center", padding: "0 64px 80px" }}>
        <div style={{ backgroundColor: "#FFFFFF", borderRadius: 24, padding: 24, width: 360, boxShadow: "0 32px 80px rgba(0,0,0,0.10)", border: "1px solid #E8E7E3" }}>
          {/* Display */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#AEADA8", marginBottom: 4 }}>Resultado</div>
            <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: -2, lineHeight: 1, color: "#1A1A18" }}>R$ 1.284</div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, color: "#AEADA8", marginTop: 6 }}>FINANCIAMENTO 12× • TAXA 1.2%</div>
          </div>
          {/* Bubbles */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ backgroundColor: "#1A1A18", color: "#F7F6F3", borderRadius: "18px 18px 4px 18px", padding: "10px 14px", fontSize: 13, maxWidth: "80%" }}>
                Financiei R$ 15k em 12x com juros de 1,2% ao mês. Qual a parcela?
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "#EFEFEC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>φ</div>
              <div style={{ backgroundColor: "#F0EFEB", borderRadius: "4px 18px 18px 18px", padding: "10px 14px", fontSize: 13, maxWidth: "80%", color: "#3A3A36" }}>
                Usando a fórmula de Price: sua parcela é <strong>R$ 1.284,00</strong> por mês.
              </div>
            </div>
          </div>
          {/* Input */}
          <div style={{ marginTop: 16, backgroundColor: "#F0EFEB", borderRadius: 20, padding: "10px 14px", fontSize: 13, color: "#AEADA8" }}>
            Descreva seu cálculo...
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "80px 64px", borderTop: "1px solid #E8E7E3" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32, maxWidth: 960, margin: "0 auto" }}>
          {[
            { icon: "💬", title: "Linguagem natural", desc: "Escreva como você fala. Sem aprender sintaxe ou funções especiais." },
            { icon: "📐", title: "13+ fórmulas prontas", desc: "Juros, área, física, estatística. Uma biblioteca completa na palma da mão." },
            { icon: "🔍", title: "Passo a passo", desc: "Entenda como o resultado foi calculado. Fórmula, valores e verificação." },
          ].map((f, i) => (
            <div key={i} style={{ backgroundColor: "#EFEFEC", borderRadius: 16, padding: 28 }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, letterSpacing: -0.3 }}>{f.title}</div>
              <div style={{ fontSize: 14, color: "#6B6B66", lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section style={{ textAlign: "center", padding: "80px 64px", borderTop: "1px solid #E8E7E3" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, color: "#AEADA8", marginBottom: 20 }}>Grátis para começar</div>
        <h2 style={{ fontSize: 44, fontWeight: 800, letterSpacing: -2, margin: "0 0 16px" }}>Experimente agora</h2>
        <p style={{ fontSize: 16, color: "#6B6B66", marginBottom: 36 }}>Sem cadastro obrigatório. Disponível para iOS e Android.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button style={{ backgroundColor: "#1A1A18", color: "#F7F6F3", border: "none", borderRadius: 14, padding: "14px 28px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>App Store</button>
          <button style={{ backgroundColor: "#EFEFEC", color: "#1A1A18", border: "none", borderRadius: 14, padding: "14px 28px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Google Play</button>
        </div>
      </section>
    </div>
  );
}
