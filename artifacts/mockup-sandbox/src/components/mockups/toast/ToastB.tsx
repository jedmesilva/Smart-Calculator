export default function ToastB() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-8"
      style={{ backgroundColor: "#F7F6F3", fontFamily: "Inter, sans-serif" }}>
      <p className="text-xs uppercase tracking-widest" style={{ color: "#AEADA8" }}>B — Neutro Card</p>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: "#EFEFEC",
          border: "1px solid #E8E7E3",
          borderRadius: 14,
          paddingLeft: 16,
          paddingRight: 20,
          paddingTop: 13,
          paddingBottom: 13,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          maxWidth: 340,
          width: "100%",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B6B66" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style={{ flex: 1, fontSize: 13.5, color: "#1A1A18", lineHeight: "19px", letterSpacing: "-0.01em" }}>
          Estamos com dificuldades técnicas. Tente novamente em instantes.
        </span>
      </div>
    </div>
  );
}
