export default function ToastA() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-8"
      style={{ backgroundColor: "#F7F6F3", fontFamily: "Inter, sans-serif" }}>
      <p className="text-xs uppercase tracking-widest" style={{ color: "#AEADA8" }}>A — Dark Pill</p>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: "#1A1A18",
          borderRadius: 14,
          paddingLeft: 16,
          paddingRight: 20,
          paddingTop: 13,
          paddingBottom: 13,
          boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
          maxWidth: 340,
          width: "100%",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#AEADA8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span style={{ flex: 1, fontSize: 13.5, color: "#F7F6F3", lineHeight: "19px", letterSpacing: "-0.01em" }}>
          Estamos com dificuldades técnicas. Tente novamente em instantes.
        </span>
      </div>
    </div>
  );
}
