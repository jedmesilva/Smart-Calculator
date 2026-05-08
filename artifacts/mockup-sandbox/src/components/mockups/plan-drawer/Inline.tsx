export function Inline() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#F7F6F3", minHeight: "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ width: 260, display: "flex", flexDirection: "column", gap: 0 }}>

        {/* User card — tudo dentro, incluindo plano */}
        <div style={{ background: "#EFEFEC", borderRadius: 16, padding: "14px 14px", display: "flex", flexDirection: "row", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 8 }}>
          {/* Avatar */}
          <div style={{ width: 44, height: 44, borderRadius: 22, background: "#1A1A18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#F7F6F3", letterSpacing: -0.3 }}>JD</span>
          </div>
          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#1A1A18", letterSpacing: -0.2 }}>João Duarte</p>
            <p style={{ margin: "2px 0 0", fontSize: 11, fontWeight: 400, color: "#AEADA8" }}>joao@email.com</p>
            {/* Plano + créditos inline */}
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
              <span style={{ background: "#E8E7E3", borderRadius: 4, padding: "2px 6px", fontSize: 10, fontWeight: 600, color: "#6B6B66", letterSpacing: 0.2 }}>Gratuito</span>
              <span style={{ width: 3, height: 3, borderRadius: 2, background: "#C8C7C2", display: "inline-block" }} />
              <span style={{ fontSize: 11, fontWeight: 400, color: "#AEADA8" }}>100 cr.</span>
            </div>
          </div>
          {/* Chevron */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C8C7C2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#E8E7E3", margin: "8px 0" }} />

        {/* Menu items preview */}
        {[
          { icon: "🕐", label: "Histórico" },
          { icon: "📖", label: "Fórmulas" },
          { icon: "⭐", label: "Favoritas" },
        ].map(item => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 10px", borderRadius: 10, cursor: "pointer" }}>
            <span style={{ fontSize: 13, color: "#6B6B66" }}>{item.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#6B6B66", flex: 1 }}>{item.label}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C8C7C2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        ))}

        {/* Label abaixo */}
        <p style={{ marginTop: 20, fontSize: 11, fontWeight: 500, color: "#AEADA8", textAlign: "center", letterSpacing: 0.1 }}>
          Plano + créditos no user card · toque para detalhes
        </p>
      </div>
    </div>
  );
}
