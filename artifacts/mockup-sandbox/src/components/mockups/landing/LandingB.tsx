export default function LandingB() {
  return (
    <div style={{ fontFamily: "Inter, sans-serif", backgroundColor: "#1A1A18", minHeight: "100vh", color: "#F7F6F3" }}>
      {/* Nav */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 64px", borderBottom: "1px solid #2A2A26" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1 }}>φ</span>
          <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.5 }}>Phormula</span>
        </div>
        <div style={{ display: "flex", gap: 32, fontSize: 14, color: "#6B6B66" }}>
          <span style={{ cursor: "pointer" }}>Como funciona</span>
          <span style={{ cursor: "pointer" }}>Fórmulas</span>
          <span style={{ cursor: "pointer" }}>Planos</span>
        </div>
        <button style={{ backgroundColor: "#F7F6F3", color: "#1A1A18", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Baixar app
        </button>
      </nav>

      {/* Hero */}
      <section style={{ display: "flex", padding: "90px 64px 80px", gap: 80, alignItems: "center", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid #2A2A26", borderRadius: 99, padding: "6px 14px", fontSize: 12, color: "#6B6B66", marginBottom: 36, letterSpacing: 0.2 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#34C759", display: "inline-block" }} />
            iOS e Android
          </div>
          <h1 style={{ fontSize: 68, fontWeight: 800, letterSpacing: -3, lineHeight: 1.05, margin: "0 0 24px" }}>
            Seu gênio<br />
            <span style={{ color: "#6B6B66" }}>matemático</span><br />
            pessoal
          </h1>
          <p style={{ fontSize: 17, color: "#6B6B66", lineHeight: 1.65, margin: "0 0 44px", maxWidth: 440 }}>
            Descreva o cálculo como você fala. O Phormula resolve, explica e mostra o passo a passo — em segundos.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ display: "flex", alignItems: "center", gap: 10, backgroundColor: "#F7F6F3", color: "#1A1A18", border: "none", borderRadius: 14, padding: "14px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.2 1.29-2.18 3.85.03 3.05 2.68 4.06 2.71 4.07l-.08.2zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              App Store
            </button>
            <button style={{ display: "flex", alignItems: "center", gap: 10, backgroundColor: "transparent", color: "#F7F6F3", border: "1px solid #2A2A26", borderRadius: 14, padding: "14px 24px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.76c.3.17.66.19.99.07l12.35-6.9-2.93-2.93-10.41 9.76zM.29 1.79C.11 2.1 0 2.5 0 3v18c0 .5.11.9.29 1.21l.07.06 10.08-10.08v-.24L.36 1.73l-.07.06zM20.29 10.23l-2.64-1.48-3.27 3.27 3.27 3.27 2.65-1.49c.76-.43.76-1.12-.01-1.57zM4.17.25l12.35 6.9-2.93 2.93L3.18.32c.33-.12.69-.1.99-.07z"/></svg>
              Google Play
            </button>
          </div>
        </div>

        {/* Phone mockup */}
        <div style={{ flexShrink: 0, position: "relative" }}>
          <div style={{ width: 320, background: "linear-gradient(160deg, #242420 0%, #1A1A18 100%)", border: "1px solid #2A2A26", borderRadius: 40, padding: "28px 20px 24px", boxShadow: "0 40px 100px rgba(0,0,0,0.5)" }}>
            {/* Status bar */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20, padding: "0 4px" }}>
              <span style={{ fontSize: 11, color: "#6B6B66" }}>9:41</span>
              <div style={{ width: 48, height: 16, backgroundColor: "#2A2A26", borderRadius: 8 }} />
              <div style={{ display: "flex", gap: 4 }}>
                <div style={{ width: 16, height: 11, backgroundColor: "#2A2A26", borderRadius: 2 }} />
              </div>
            </div>
            {/* Display area */}
            <div style={{ backgroundColor: "#F7F6F3", borderRadius: 20, padding: "18px 16px", marginBottom: 12 }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "#AEADA8", marginBottom: 4 }}>Resultado</div>
              <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -2, color: "#1A1A18", lineHeight: 1 }}>R$ 1.284</div>
              <div style={{ fontSize: 9, color: "#AEADA8", marginTop: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>PARCELA MENSAL</div>
            </div>
            {/* Chat */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ backgroundColor: "#F7F6F3", color: "#1A1A18", borderRadius: "14px 14px 3px 14px", padding: "8px 12px", fontSize: 11, maxWidth: "85%" }}>
                  Qual a parcela de 15k em 12x a 1,2%?
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#2A2A26", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>φ</div>
                <div style={{ backgroundColor: "#242420", borderRadius: "3px 14px 14px 14px", padding: "8px 12px", fontSize: 11, maxWidth: "85%", color: "#AEADA8" }}>
                  Parcela de <span style={{ color: "#F7F6F3", fontWeight: 600 }}>R$ 1.284,00</span> usando fórmula de Price.
                </div>
              </div>
            </div>
            {/* Input */}
            <div style={{ backgroundColor: "#242420", borderRadius: 16, padding: "10px 14px", fontSize: 11, color: "#3A3A36" }}>
              Descreva seu cálculo...
            </div>
          </div>
          {/* Glow effect */}
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle, rgba(247,246,243,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />
        </div>
      </section>

      {/* Stats bar */}
      <div style={{ borderTop: "1px solid #2A2A26", borderBottom: "1px solid #2A2A26", padding: "32px 64px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 80 }}>
          {[["10k+", "Usuários ativos"], ["13+", "Fórmulas prontas"], ["99%", "Precisão verificada"]].map(([val, label], i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>{val}</div>
              <div style={{ fontSize: 12, color: "#6B6B66", marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section style={{ padding: "80px 64px" }}>
        <h2 style={{ textAlign: "center", fontSize: 40, fontWeight: 800, letterSpacing: -2, marginBottom: 48 }}>Como funciona</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, maxWidth: 960, margin: "0 auto" }}>
          {[
            { n: "01", title: "Descreva", desc: "Escreva o cálculo como você fala, em português natural." },
            { n: "02", title: "O Phormula resolve", desc: "IA analisa, escolhe a fórmula certa e computa com precisão." },
            { n: "03", title: "Entenda o resultado", desc: "Veja o passo a passo, a fórmula e a verificação completa." },
          ].map((f, i) => (
            <div key={i} style={{ border: "1px solid #2A2A26", borderRadius: 16, padding: 28 }}>
              <div style={{ fontSize: 11, color: "#3A3A36", fontWeight: 600, letterSpacing: 1, marginBottom: 16 }}>{f.n}</div>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, letterSpacing: -0.5 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: "#6B6B66", lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section style={{ textAlign: "center", padding: "60px 64px 80px", borderTop: "1px solid #2A2A26" }}>
        <h2 style={{ fontSize: 44, fontWeight: 800, letterSpacing: -2, margin: "0 0 16px" }}>Pronto para começar?</h2>
        <p style={{ fontSize: 15, color: "#6B6B66", marginBottom: 36 }}>Grátis. Sem cadastro obrigatório.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button style={{ backgroundColor: "#F7F6F3", color: "#1A1A18", border: "none", borderRadius: 14, padding: "14px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>App Store</button>
          <button style={{ backgroundColor: "transparent", color: "#F7F6F3", border: "1px solid #2A2A26", borderRadius: 14, padding: "14px 28px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Google Play</button>
        </div>
      </section>
    </div>
  );
}
