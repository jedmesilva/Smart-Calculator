const examples = [
  { q: "Quanto rende R$ 5k em 6 meses com CDI de 13,75%?", r: "R$ 5.344,27", meta: "RENDIMENTO LÍQUIDO" },
  { q: "Área de um círculo com raio de 8 metros?", r: "201,06 m²", meta: "ÁREA DO CÍRCULO" },
  { q: "Qual a velocidade média de 120 km em 1h30?", r: "80 km/h", meta: "VELOCIDADE MÉDIA" },
];

export default function LandingC() {
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
        <button style={{ backgroundColor: "#1A1A18", color: "#F7F6F3", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
          Baixar grátis
        </button>
      </nav>

      {/* Hero — two column */}
      <section style={{ display: "flex", gap: 72, padding: "80px 64px", alignItems: "flex-start", maxWidth: 1200, margin: "0 auto" }}>
        {/* Left */}
        <div style={{ flex: 1, paddingTop: 16 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, backgroundColor: "#EFEFEC", borderRadius: 99, padding: "6px 14px", fontSize: 12, color: "#6B6B66", marginBottom: 36 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#34C759", display: "inline-block" }} />
            Novo: GPT-5 integrado
          </div>
          <h1 style={{ fontSize: 60, fontWeight: 800, letterSpacing: -3, lineHeight: 1.08, margin: "0 0 20px" }}>
            Seu gênio<br />
            matemático<br />
            pessoal
          </h1>
          <p style={{ fontSize: 17, color: "#6B6B66", lineHeight: 1.65, margin: "0 0 36px", maxWidth: 400 }}>
            Fale com o Phormula como você fala com um amigo. Ele entende, calcula e explica qualquer conta — em segundos.
          </p>

          {/* Example queries */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 12, color: "#AEADA8", marginBottom: 12, letterSpacing: 0.2 }}>Experimente perguntar:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {["Qual a parcela de um financiamento de R$ 30k em 48x?", "Quantos dias faltam para minha aposentadoria?", "Qual o desconto de 15% em R$ 299?"].map((q, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, backgroundColor: "#EFEFEC", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#6B6B66", cursor: "pointer" }}>
                  <span style={{ fontSize: 11, color: "#AEADA8" }}>→</span>
                  {q}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ display: "flex", alignItems: "center", gap: 8, backgroundColor: "#1A1A18", color: "#F7F6F3", border: "none", borderRadius: 14, padding: "13px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.2 1.29-2.18 3.85.03 3.05 2.68 4.06 2.71 4.07l-.08.2zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
              App Store
            </button>
            <button style={{ display: "flex", alignItems: "center", gap: 8, backgroundColor: "#EFEFEC", color: "#1A1A18", border: "none", borderRadius: 14, padding: "13px 22px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.76c.3.17.66.19.99.07l12.35-6.9-2.93-2.93-10.41 9.76zM.29 1.79C.11 2.1 0 2.5 0 3v18c0 .5.11.9.29 1.21l.07.06 10.08-10.08v-.24L.36 1.73l-.07.06zM20.29 10.23l-2.64-1.48-3.27 3.27 3.27 3.27 2.65-1.49c.76-.43.76-1.12-.01-1.57zM4.17.25l12.35 6.9-2.93 2.93L3.18.32c.33-.12.69-.1.99-.07z"/></svg>
              Google Play
            </button>
          </div>
        </div>

        {/* Right — live chat demo */}
        <div style={{ flexShrink: 0, width: 380 }}>
          <div style={{ backgroundColor: "#FFFFFF", borderRadius: 28, overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.09)", border: "1px solid #E8E7E3" }}>
            {/* Phone header */}
            <div style={{ backgroundColor: "#F7F6F3", padding: "18px 20px 14px", borderBottom: "1px solid #E8E7E3" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ width: 28, height: 28, backgroundColor: "#EFEFEC", borderRadius: 8 }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ width: 28, height: 28, backgroundColor: "#EFEFEC", borderRadius: 8 }} />
                  <div style={{ width: 28, height: 28, backgroundColor: "#EFEFEC", borderRadius: 8 }} />
                </div>
              </div>
              {/* Display */}
              <div>
                <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: -2, lineHeight: 1, color: "#1A1A18" }}>R$ 5.344</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                  <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, color: "#AEADA8" }}>RENDIMENTO LÍQUIDO</span>
                  <span style={{ fontSize: 10, color: "#34C759", fontWeight: 600 }}>✓ Verificado</span>
                </div>
              </div>
            </div>

            {/* Chat */}
            <div style={{ padding: "16px 16px", display: "flex", flexDirection: "column", gap: 10, backgroundColor: "#F7F6F3" }}>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ backgroundColor: "#1A1A18", color: "#F7F6F3", borderRadius: "16px 16px 3px 16px", padding: "9px 13px", fontSize: 12.5, maxWidth: "85%" }}>
                  Quanto rende R$ 5k em 6 meses com CDI de 13,75%?
                </div>
              </div>
              <div style={{ display: "flex", gap: 7 }}>
                <div style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#EFEFEC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0, fontWeight: 600 }}>φ</div>
                <div style={{ backgroundColor: "#EFEFEC", borderRadius: "3px 16px 16px 16px", padding: "9px 13px", fontSize: 12.5, maxWidth: "85%", color: "#3A3A36", lineHeight: 1.5 }}>
                  Usando juros compostos, seu investimento rende <strong>R$ 344,27</strong>, totalizando <strong>R$ 5.344,27</strong>.
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ backgroundColor: "#1A1A18", color: "#F7F6F3", borderRadius: "16px 16px 3px 16px", padding: "9px 13px", fontSize: 12.5, maxWidth: "85%" }}>
                  E se o prazo for 12 meses?
                </div>
              </div>
              <div style={{ display: "flex", gap: 7 }}>
                <div style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#EFEFEC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0, fontWeight: 600 }}>φ</div>
                <div style={{ backgroundColor: "#EFEFEC", borderRadius: "3px 16px 16px 16px", padding: "9px 13px", fontSize: 12.5, maxWidth: "85%", color: "#3A3A36", lineHeight: 1.5 }}>
                  Em 12 meses: <strong>R$ 5.717,81</strong> com rendimento de R$ 717,81.
                </div>
              </div>
            </div>

            {/* Input */}
            <div style={{ padding: "10px 14px 16px", backgroundColor: "#F7F6F3", borderTop: "1px solid #E8E7E3" }}>
              <div style={{ backgroundColor: "#EFEFEC", borderRadius: 18, padding: "10px 14px", fontSize: 12.5, color: "#AEADA8" }}>
                Continue a conversa...
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            {examples.map((e, i) => (
              <div key={i} style={{ flex: 1, backgroundColor: "#EFEFEC", borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.5, color: "#1A1A18" }}>{e.r}</div>
                <div style={{ fontSize: 9, color: "#AEADA8", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>{e.meta}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section style={{ backgroundColor: "#EFEFEC", padding: "56px 64px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, maxWidth: 900, margin: "0 auto" }}>
          {[
            { text: "\"Finalmente consigo calcular financiamento sem precisar de planilha.\"", name: "Rafael M.", role: "Engenheiro" },
            { text: "\"Uso todo dia para conferir cálculos de área na obra. Incrível.\"", name: "Cláudia S.", role: "Arquiteta" },
            { text: "\"Meus alunos adoram. Explica melhor que qualquer livro.\"", name: "Paulo R.", role: "Professor" },
          ].map((t, i) => (
            <div key={i} style={{ backgroundColor: "#F7F6F3", borderRadius: 14, padding: 22 }}>
              <p style={{ fontSize: 13.5, color: "#3A3A36", lineHeight: 1.6, margin: "0 0 14px" }}>{t.text}</p>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A18" }}>{t.name}</div>
              <div style={{ fontSize: 11, color: "#AEADA8" }}>{t.role}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section style={{ textAlign: "center", padding: "80px 64px", borderTop: "1px solid #E8E7E3" }}>
        <h2 style={{ fontSize: 44, fontWeight: 800, letterSpacing: -2, margin: "0 0 14px" }}>Experimente grátis</h2>
        <p style={{ fontSize: 15, color: "#6B6B66", marginBottom: 36 }}>Disponível para iOS e Android. Sem cadastro obrigatório.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button style={{ backgroundColor: "#1A1A18", color: "#F7F6F3", border: "none", borderRadius: 14, padding: "14px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>App Store</button>
          <button style={{ backgroundColor: "#EFEFEC", color: "#1A1A18", border: "none", borderRadius: 14, padding: "14px 28px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Google Play</button>
        </div>
      </section>
    </div>
  );
}
