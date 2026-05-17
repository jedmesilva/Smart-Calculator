import { useState, useEffect, type ReactNode } from "react";
import "./App.css";
import { getVariant, type Variant } from "./lib/abtest";

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
  { title: "Linguagem natural", desc: "Escreva como você fala. Sem aprender sintaxe ou fórmulas especiais." },
  { title: "Qualquer cálculo", desc: "Finanças, física, geometria, estatística — descreva o problema e receba o resultado." },
  { title: "Passo a passo verificado", desc: "Veja como o resultado foi calculado. Fórmula simbólica, valores e prova reversa." },
];

const heroContent: Record<Variant, { headline: ReactNode; subtitle: string; cta: string }> = {
  control: {
    headline: <>Seu gênio<br />matemático<br />pessoal</>,
    subtitle: "Fale com o Phormula como você fala com um amigo. Ele entende, calcula e explica qualquer conta — em segundos.",
    cta: "Baixar grátis",
  },
  treatment: {
    headline: <>Calcule<br />qualquer coisa.<br />Em segundos.</>,
    subtitle: "Digite o problema como quiser. O Phormula entende, calcula e mostra o passo a passo — sem fórmulas ou planilhas.",
    cta: "Começar agora",
  },
};

export default function App() {
  const [variant, setVariant] = useState<Variant>("control");

  useEffect(() => {
    setVariant(getVariant());
  }, []);

  const hero = heroContent[variant];

  return (
    <div>
      {/* Nav */}
      <nav className="nav">
        <div className="logo">
          <span className="logo-mark">φ</span>
          <span className="logo-name">Phormula</span>
        </div>
        <div className="nav-links">
          <a href="#como-funciona">Como funciona</a>
          <a href="#formulas">Fórmulas</a>
          <a href="#depoimentos">Depoimentos</a>
        </div>
        <button className="nav-cta">{hero.cta}</button>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="hero-left">
          <div className="badge">
            <span className="badge-dot" />
            Disponível no iOS e Android
          </div>
          <h1>{hero.headline}</h1>
          <p className="subtitle">{hero.subtitle}</p>

          <div>
            <p className="examples-label">Experimente perguntar:</p>
            <div className="examples-wrap">
              {examples.map((q, i) => (
                <div key={i} className="example-chip">
                  <span className="example-arrow">→</span>
                  {q}
                </div>
              ))}
            </div>
          </div>

          <div className="cta-row">
            <button className="btn-primary">
              <AppleIcon /> App Store
            </button>
            <button className="btn-secondary">
              <PlayIcon /> Google Play
            </button>
          </div>
        </div>

        {/* App mockup */}
        <div className="hero-right">
          <div className="phone-card">
            <div className="phone-header">
              <div className="phone-header-btns">
                <div className="header-btn" />
                <div className="header-btn-group">
                  <div className="header-btn" />
                  <div className="header-btn" />
                </div>
              </div>
              <div className="display-num">R$ 5.344</div>
              <div className="display-meta">
                <span className="display-label">Rendimento líquido</span>
                <span className="verified">✓ Verificado</span>
              </div>
            </div>

            <div className="chat-wrap">
              <div className="user-msg-row">
                <div className="user-msg">
                  Quanto rende R$ 5k em 6 meses com CDI de 13,75%?
                </div>
              </div>
              <div className="assistant-row">
                <div className="avatar">φ</div>
                <div className="assistant-msg">
                  Usando juros compostos, seu investimento rende <strong>R$ 344,27</strong>, totalizando <strong>R$ 5.344,27</strong>.
                </div>
              </div>
              <div className="user-msg-row">
                <div className="user-msg">E se o prazo for 12 meses?</div>
              </div>
              <div className="assistant-row">
                <div className="avatar">φ</div>
                <div className="assistant-msg">
                  Em 12 meses: <strong>R$ 5.717,81</strong> com rendimento de R$ 717,81.
                </div>
              </div>
            </div>

            <div className="input-bar">
              <div className="input-fake">Continue a conversa...</div>
            </div>
          </div>

          <div className="stats-row">
            {stats.map((st, i) => (
              <div key={i} className="stat-card">
                <div className="stat-val">{st.val}</div>
                <div className="stat-label">{st.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="depoimentos" className="social-section">
        <div className="social-grid">
          {testimonials.map((t, i) => (
            <div key={i} className="testimonial-card">
              <p className="testimonial-text">{t.text}</p>
              <div className="testimonial-name">{t.name}</div>
              <div className="testimonial-role">{t.role}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="como-funciona" className="feat-section">
        <h2 className="feat-title">Tudo que você precisa calcular</h2>
        <div className="feat-grid">
          {features.map((f, i) => (
            <div key={i} className="feat-card">
              <div className="feat-card-title">{f.title}</div>
              <div className="feat-card-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="footer-section">
        <h2 className="footer-h2">Experimente grátis</h2>
        <p className="footer-sub">Disponível para iOS e Android.</p>
        <div className="footer-cta">
          <button className="btn-primary">
            <AppleIcon /> App Store
          </button>
          <button className="btn-secondary">
            <PlayIcon /> Google Play
          </button>
        </div>
        <div className="footer-meta">© 2025 Phormula. Todos os direitos reservados.</div>
      </section>
    </div>
  );
}
