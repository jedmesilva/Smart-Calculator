const s: Record<string, React.CSSProperties> = {
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 64px", borderBottom: "1px solid #E8E7E3", position: "sticky", top: 0, backgroundColor: "rgba(247,246,243,0.92)", backdropFilter: "blur(12px)", zIndex: 100 },
  logo: { display: "flex", alignItems: "center", gap: 10 },
  logoMark: { fontSize: 26, fontWeight: 800, letterSpacing: -1, lineHeight: 1 },
  logoName: { fontSize: 16, fontWeight: 600, letterSpacing: -0.4 },
  navLinks: { display: "flex", gap: 32, fontSize: 14, color: "#6B6B66" },
  navCta: { backgroundColor: "#1A1A18", color: "#F7F6F3", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer", letterSpacing: -0.1 },
  hero: { display: "flex", gap: 72, padding: "80px 64px 60px", alignItems: "flex-start", maxWidth: 1160, margin: "0 auto" },
  heroLeft: { flex: 1, paddingTop: 12 },
  badge: { display: "inline-flex", alignItems: "center", gap: 8, backgroundColor: "#EFEFEC", borderRadius: 99, padding: "6px 14px", fontSize: 12, color: "#6B6B66", marginBottom: 32, letterSpacing: 0.1 },
  badgeDot: { width: 6, height: 6, borderRadius: "50%", backgroundColor: "#34C759", display: "inline-block", flexShrink: 0 },
  h1: { fontSize: 64, fontWeight: 800, letterSpacing: -3, lineHeight: 1.06, margin: "0 0 20px", color: "#1A1A18" },
  subtitle: { fontSize: 17, color: "#6B6B66", lineHeight: 1.65, margin: "0 0 36px", maxWidth: 400 },
  examplesLabel: { fontSize: 12, color: "#AEADA8", marginBottom: 10, letterSpacing: 0.2 },
  examplesWrap: { display: "flex", flexDirection: "column", gap: 7, marginBottom: 40 },
  exampleChip: { display: "flex", alignItems: "center", gap: 10, backgroundColor: "#EFEFEC", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#6B6B66", cursor: "pointer", transition: "background 0.15s" },
  ctaRow: { display: "flex", gap: 10 },
  btnPrimary: { display: "flex", alignItems: "center", gap: 8, backgroundColor: "#1A1A18", color: "#F7F6F3", border: "none", borderRadius: 14, padding: "13px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { display: "flex", alignItems: "center", gap: 8, backgroundColor: "#EFEFEC", color: "#1A1A18", border: "none", borderRadius: 14, padding: "13px 22px", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  heroRight: { flexShrink: 0, width: 380 },
  phoneCard: { backgroundColor: "#FFFFFF", borderRadius: 28, overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.09)", border: "1px solid #E8E7E3" },
  phoneHeader: { backgroundColor: "#F7F6F3", padding: "18px 20px 16px", borderBottom: "1px solid #E8E7E3" },
  phoneHeaderBtns: { display: "flex", justifyContent: "space-between", marginBottom: 16 },
  headerBtn: { width: 28, height: 28, backgroundColor: "#EFEFEC", borderRadius: 8 },
  displayNum: { fontSize: 44, fontWeight: 800, letterSpacing: -2, lineHeight: 1, color: "#1A1A18" },
  displayMeta: { display: "flex", justifyContent: "space-between", marginTop: 6 },
  displayLabel: { fontSize: 10, textTransform: "uppercase" as const, letterSpacing: 0.8, color: "#AEADA8" },
  verified: { fontSize: 10, color: "#34C759", fontWeight: 600 },
  chatWrap: { padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, backgroundColor: "#F7F6F3" },
  userMsg: { backgroundColor: "#1A1A18", color: "#F7F6F3", borderRadius: "16px 16px 3px 16px", padding: "9px 13px", fontSize: 12.5, maxWidth: "85%", lineHeight: 1.45 },
  assistantRow: { display: "flex", gap: 7 },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#EFEFEC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0, fontWeight: 700 },
  assistantMsg: { backgroundColor: "#EFEFEC", borderRadius: "3px 16px 16px 16px", padding: "9px 13px", fontSize: 12.5, maxWidth: "85%", color: "#3A3A36", lineHeight: 1.5 },
  inputBar: { padding: "10px 14px 16px", backgroundColor: "#F7F6F3", borderTop: "1px solid #E8E7E3" },
  inputFake: { backgroundColor: "#EFEFEC", borderRadius: 18, padding: "10px 14px", fontSize: 12.5, color: "#AEADA8" },
  statsRow: { display: "flex", gap: 10, marginTop: 14 },
  statCard: { flex: 1, backgroundColor: "#EFEFEC", borderRadius: 12, padding: "10px 12px" },
  statVal: { fontSize: 15, fontWeight: 700, letterSpacing: -0.5, color: "#1A1A18" },
  statLabel: { fontSize: 9, color: "#AEADA8", textTransform: "uppercase" as const, letterSpacing: 0.5, marginTop: 2 },
  socialSection: { backgroundColor: "#EFEFEC", padding: "64px 64px" },
  socialGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, maxWidth: 920, margin: "0 auto" },
  testimonialCard: { backgroundColor: "#F7F6F3", borderRadius: 16, padding: 24 },
  testimonialText: { fontSize: 14, color: "#3A3A36", lineHeight: 1.65, margin: "0 0 16px" },
  testimonialName: { fontSize: 12, fontWeight: 600, color: "#1A1A18" },
  testimonialRole: { fontSize: 11, color: "#AEADA8", marginTop: 2 },
  featSection: { padding: "80px 64px", borderTop: "1px solid #E8E7E3" },
  featTitle: { textAlign: "center" as const, fontSize: 36, fontWeight: 800, letterSpacing: -1.5, marginBottom: 48, color: "#1A1A18" },
  featGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, maxWidth: 960, margin: "0 auto" },
  featCard: { border: "1px solid #E8E7E3", borderRadius: 16, padding: 28, backgroundColor: "#FFFFFF" },
  featIcon: { fontSize: 26, marginBottom: 14 },
  featCardTitle: { fontSize: 16, fontWeight: 700, marginBottom: 8, letterSpacing: -0.4 },
  featCardDesc: { fontSize: 13.5, color: "#6B6B66", lineHeight: 1.65 },
  footerSection: { textAlign: "center" as const, padding: "80px 64px 64px", borderTop: "1px solid #E8E7E3" },
  footerH2: { fontSize: 46, fontWeight: 800, letterSpacing: -2, margin: "0 0 14px" },
  footerSub: { fontSize: 15, color: "#6B6B66", marginBottom: 40 },
  footerCta: { display: "flex", gap: 12, justifyContent: "center", marginBottom: 48 },
  footerMeta: { fontSize: 12, color: "#AEADA8" },
};

const AppleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.2 1.29-2.18 3.85.03 3.05 2.68 4.06 2.71 4.07l-.08.2zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3.18 23.76c.3.17.66.19.99.07l12.35-6.9-2.93-2.93-10.41 9.76zM.29 1.79C.11 2.1 0 2.5 0 3v18c0 .5.11.9.29 1.21l.07.06 10.08-10.08v-.24L.36 1.73l-.07.06zM20.29 10.23l-2.64-1.48-3.27 3.27 3.27 3.27 2.65-1.49c.76-.43.76-1.12-.01-1.57zM4.17.25l12.35 6.9-2.93 2.93L3.18.32c.33-.12.69-.1.99-.07z" />
  </svg>
);

const examples = [
  "Qual a parcela de um financiamento de R$ 30k em 48×?",
  "Quantos dias faltam para o fim do ano?",
  "Qual o desconto de 15% em R$ 299?",
];

const stats = [
  { val: "R$ 5.344,27", label: "Rendimento líquido" },
  { val: "201,06 m²", label: "Área do círculo" },
  { val: "80 km/h", label: "Velocidade média" },
];

const testimonials = [
  { text: "\"Finalmente consigo calcular financiamento sem precisar de planilha. É incrível como entende o que eu escrevo.\"", name: "Rafael M.", role: "Engenheiro Civil" },
  { text: "\"Uso todo dia para conferir cálculos de área na obra. Poupa um tempo absurdo.\"", name: "Cláudia S.", role: "Arquiteta" },
  { text: "\"Meus alunos adoram. Explica o passo a passo melhor do que qualquer livro didático.\"", name: "Paulo R.", role: "Professor de Matemática" },
];

const features = [
  { icon: "💬", title: "Linguagem natural", desc: "Escreva como você fala, em português. Sem aprender sintaxe ou fórmulas especiais." },
  { icon: "📐", title: "13+ fórmulas prontas", desc: "Juros compostos, área, física, estatística. Uma biblioteca completa na palma da mão." },
  { icon: "🔍", title: "Passo a passo verificado", desc: "Veja como o resultado foi calculado. Fórmula simbólica, valores e prova reversa." },
];

export default function App() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", backgroundColor: "#F7F6F3", color: "#1A1A18" }}>

      {/* Nav */}
      <nav style={s.nav}>
        <div style={s.logo}>
          <span style={s.logoMark}>φ</span>
          <span style={s.logoName}>Phormula</span>
        </div>
        <div style={s.navLinks}>
          <a href="#como-funciona" style={{ color: "#6B6B66", textDecoration: "none" }}>Como funciona</a>
          <a href="#formulas" style={{ color: "#6B6B66", textDecoration: "none" }}>Fórmulas</a>
          <a href="#depoimentos" style={{ color: "#6B6B66", textDecoration: "none" }}>Depoimentos</a>
        </div>
        <button style={s.navCta}>Baixar grátis</button>
      </nav>

      {/* Hero */}
      <section style={s.hero}>
        {/* Left copy */}
        <div style={s.heroLeft}>
          <div style={s.badge}>
            <span style={s.badgeDot} />
            Disponível no iOS e Android
          </div>
          <h1 style={s.h1}>
            Seu gênio<br />
            matemático<br />
            pessoal
          </h1>
          <p style={s.subtitle}>
            Fale com o Phormula como você fala com um amigo. Ele entende, calcula e explica qualquer conta — em segundos.
          </p>

          <div style={{ marginBottom: 40 }}>
            <p style={s.examplesLabel}>Experimente perguntar:</p>
            <div style={s.examplesWrap}>
              {examples.map((q, i) => (
                <div key={i} style={s.exampleChip}>
                  <span style={{ fontSize: 11, color: "#C8C7C2" }}>→</span>
                  {q}
                </div>
              ))}
            </div>
          </div>

          <div style={s.ctaRow}>
            <button style={s.btnPrimary}>
              <AppleIcon /> App Store
            </button>
            <button style={s.btnSecondary}>
              <PlayIcon /> Google Play
            </button>
          </div>
        </div>

        {/* Right — app mockup */}
        <div style={s.heroRight}>
          <div style={s.phoneCard}>
            <div style={s.phoneHeader}>
              <div style={s.phoneHeaderBtns}>
                <div style={s.headerBtn} />
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={s.headerBtn} />
                  <div style={s.headerBtn} />
                </div>
              </div>
              <div style={s.displayNum}>R$ 5.344</div>
              <div style={s.displayMeta}>
                <span style={s.displayLabel}>Rendimento líquido</span>
                <span style={s.verified}>✓ Verificado</span>
              </div>
            </div>

            <div style={s.chatWrap}>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={s.userMsg}>
                  Quanto rende R$ 5k em 6 meses com CDI de 13,75%?
                </div>
              </div>
              <div style={s.assistantRow}>
                <div style={s.avatar}>φ</div>
                <div style={s.assistantMsg}>
                  Usando juros compostos, seu investimento rende <strong>R$ 344,27</strong>, totalizando <strong>R$ 5.344,27</strong>.
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={s.userMsg}>E se o prazo for 12 meses?</div>
              </div>
              <div style={s.assistantRow}>
                <div style={s.avatar}>φ</div>
                <div style={s.assistantMsg}>
                  Em 12 meses: <strong>R$ 5.717,81</strong> com rendimento de R$ 717,81.
                </div>
              </div>
            </div>

            <div style={s.inputBar}>
              <div style={s.inputFake}>Continue a conversa...</div>
            </div>
          </div>

          <div style={s.statsRow}>
            {stats.map((st, i) => (
              <div key={i} style={s.statCard}>
                <div style={s.statVal}>{st.val}</div>
                <div style={s.statLabel}>{st.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="depoimentos" style={s.socialSection}>
        <div style={s.socialGrid}>
          {testimonials.map((t, i) => (
            <div key={i} style={s.testimonialCard}>
              <p style={s.testimonialText}>{t.text}</p>
              <div style={s.testimonialName}>{t.name}</div>
              <div style={s.testimonialRole}>{t.role}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="como-funciona" style={s.featSection}>
        <h2 style={s.featTitle}>Tudo que você precisa calcular</h2>
        <div style={s.featGrid}>
          {features.map((f, i) => (
            <div key={i} style={s.featCard}>
              <div style={s.featIcon}>{f.icon}</div>
              <div style={s.featCardTitle}>{f.title}</div>
              <div style={s.featCardDesc}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section style={s.footerSection}>
        <h2 style={s.footerH2}>Experimente grátis</h2>
        <p style={s.footerSub}>Disponível para iOS e Android. Sem cadastro obrigatório.</p>
        <div style={s.footerCta}>
          <button style={s.btnPrimary}>
            <AppleIcon /> App Store
          </button>
          <button style={s.btnSecondary}>
            <PlayIcon /> Google Play
          </button>
        </div>
        <div style={s.footerMeta}>© 2025 Phormula. Todos os direitos reservados.</div>
      </section>

    </div>
  );
}
