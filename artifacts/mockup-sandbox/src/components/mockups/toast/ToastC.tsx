export default function ToastC() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-8"
      style={{ backgroundColor: "#F7F6F3", fontFamily: "Inter, sans-serif" }}>
      <p className="text-xs uppercase tracking-widest" style={{ color: "#AEADA8" }}>C — Warm Tinted</p>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: "#EFEFEC",
          borderRadius: 14,
          borderLeft: "3px solid #C8C7C2",
          paddingLeft: 14,
          paddingRight: 20,
          paddingTop: 13,
          paddingBottom: 13,
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          maxWidth: 340,
          width: "100%",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6B6B66" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span style={{ flex: 1, fontSize: 13.5, color: "#1A1A18", lineHeight: "19px", letterSpacing: "-0.01em" }}>
          Estamos com dificuldades técnicas. Tente novamente em instantes.
        </span>
      </div>
    </div>
  );
}
