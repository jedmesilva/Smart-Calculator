import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";

const c = colors.light;

const MOCK_OVERLAY = {
  formulaName: "Juros Compostos",
  formulaSymbolic: "M = C × (1 + i)ⁿ",
  formulaSubstituted: "M = 1000 × (1 + 0,01)¹²",
  resultFormatted: "1.126,83",
  resultUnit: "R$",
  resultLabel: "montante final",
  variables: [
    { symbol: "C", name: "Capital inicial", value: "R$ 1.000" },
    { symbol: "i", name: "Taxa de juros", value: "1% ao mês" },
    { symbol: "n", name: "Período", value: "12 meses" },
  ],
  steps: [
    "Converter taxa: i = 1% = 0,01",
    "Aplicar a fórmula: M = 1000 × (1 + 0,01)¹²",
    "Calcular (1,01)¹² = 1,126825…",
    "Multiplicar: M = 1000 × 1,126825 = 1.126,83",
  ],
  note: "O rendimento total foi de R$ 126,83 sobre o capital inicial.",
};

const MOCK_SESSIONS = [
  { id: "1", title: "Juros compostos de R$ 1.000 por 12 meses", formulaName: "Juros Compostos", savedAt: Date.now() - 86400000 },
  { id: "2", title: "IMC com 75kg e 1.75m de altura", formulaName: "IMC", savedAt: Date.now() - 172800000 },
  { id: "3", title: "Área de um círculo com raio 5cm", formulaName: "Área do Círculo", savedAt: Date.now() - 259200000 },
];

export const MOCK_FORMULAS = [
  { id: "juros-compostos", name: "Juros Compostos", category: "Financeiro", description: "Montante com juros sobre juros ao longo do tempo", symbolic: "M = C × (1 + i)ⁿ" },
  { id: "imc", name: "IMC", category: "Saúde", description: "Índice de Massa Corporal", symbolic: "IMC = peso / altura²" },
  { id: "regra-tres", name: "Regra de Três", category: "Básico", description: "Proporção simples ou composta entre grandezas", symbolic: "a/b = c/x" },
  { id: "area-circulo", name: "Área do Círculo", category: "Geometria", description: "Área de um círculo a partir do raio", symbolic: "A = π × r²" },
  { id: "desconto", name: "Desconto Percentual", category: "Financeiro", description: "Valor final após aplicar desconto", symbolic: "V = P × (1 - d/100)" },
  { id: "velocidade", name: "Velocidade Média", category: "Física", description: "Relação entre distância, tempo e velocidade", symbolic: "v = Δs / Δt" },
  { id: "user-1", name: "Minha Fórmula", category: "Minhas", description: "Fórmula personalizada salva", symbolic: "x = a + b", isUser: true },
];

export type Formula = typeof MOCK_FORMULAS[0] & { isUser?: boolean };

/* ─── CALC OVERLAY ─── */
export function CalcOverlay({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const d = MOCK_OVERLAY;
  const topPad = Platform.OS === "web" ? Math.max(insets.top, 44) : insets.top;
  const botPad = Platform.OS === "web" ? Math.max(insets.bottom, 34) : insets.bottom;

  return (
    <View style={[styles.overlay, { paddingTop: topPad }]}>
      <View style={styles.overlayHeader}>
        <Text style={styles.overlayTitle}>{d.formulaName}</Text>
        <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
          <Feather name="x" size={18} color={c.faint} />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.overlayBody} showsVerticalScrollIndicator={false}>
        <View style={styles.formulaBox}>
          <Text style={styles.formulaSymbolic}>{d.formulaSymbolic}</Text>
          <Text style={styles.formulaSubstituted}>{d.formulaSubstituted}</Text>
        </View>

        <Text style={styles.sectionLabel}>Variáveis</Text>
        <View style={{ marginBottom: 28 }}>
          {d.variables.map((v, i) => (
            <View key={i} style={[styles.varRow, i < d.variables.length - 1 && styles.rowBorder]}>
              <Text style={styles.varSymbol}>{v.symbol}</Text>
              <Text style={styles.varName}>{v.name}</Text>
              <Text style={styles.varValue}>{v.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Passo a passo</Text>
        {d.steps.map((step, i) => (
          <View key={i} style={[styles.stepRow, i < d.steps.length - 1 && styles.rowBorder]}>
            <Text style={styles.stepNum}>{String(i + 1).padStart(2, "0")}</Text>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
        {d.note && <Text style={styles.note}>* {d.note}</Text>}
      </ScrollView>

      <View style={[styles.resultBar, { paddingBottom: botPad + 20 }]}>
        <Text style={styles.resultLabel}>{d.resultLabel}</Text>
        <Text style={styles.resultUnit}>{d.resultUnit}</Text>
        <Text style={styles.resultNum}>{d.resultFormatted}</Text>
      </View>
    </View>
  );
}

/* ─── HISTORY OVERLAY ─── */
export function HistoryOverlay({ onClose, onSelect }: { onClose: () => void; onSelect: () => void }) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? Math.max(insets.top, 44) : insets.top;

  return (
    <View style={[styles.overlay, { paddingTop: topPad }]}>
      <View style={styles.overlayHeader}>
        <Text style={styles.overlayTitle}>Histórico</Text>
        <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
          <Feather name="x" size={18} color={c.faint} />
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.overlayBody} showsVerticalScrollIndicator={false}>
        {MOCK_SESSIONS.map((s) => (
          <Pressable key={s.id} onPress={onSelect} style={({ pressed }) => [styles.sessionRow, pressed && styles.rowPressed]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sessionTitle} numberOfLines={1}>{s.title}</Text>
              <Text style={styles.sessionMeta}>
                {s.formulaName} · {new Date(s.savedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
              </Text>
            </View>
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.iconBtn} hitSlop={8}>
              <Feather name="trash-2" size={13} color={c.ghost} />
            </Pressable>
            <Feather name="chevron-right" size={13} color={c.ghost} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/* ─── FORMULAS SCREEN ─── */
export function FormulasScreen({ onSelect, onClose }: { onSelect: (f: Formula) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? Math.max(insets.top, 44) : insets.top;

  const [showMine, setShowMine] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const base = showMine ? MOCK_FORMULAS.filter((f) => f.isUser) : MOCK_FORMULAS.filter((f) => !f.isUser);
  const list = base.filter((f) => {
    const q = search.toLowerCase();
    return (
      (f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)) &&
      (showMine || category === "Todos" || f.category === category)
    );
  });

  const cats = ["Todos", "Financeiro", "Saúde", "Básico", "Geometria", "Física"];

  return (
    <View style={[styles.overlay, { paddingTop: topPad }]}>
      <View style={{ paddingHorizontal: 28, paddingTop: 22, paddingBottom: 14 }}>
        <View style={styles.overlayHeaderRow}>
          <Text style={styles.overlayTitle}>{showMine ? "Minhas fórmulas" : "Fórmulas"}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable
              onPress={() => { setShowMine((v) => !v); setSearch(""); }}
              style={[styles.bookmarkBtn, showMine && styles.bookmarkBtnActive]}
              hitSlop={8}
            >
              <Feather name="bookmark" size={15} color={showMine ? "#fff" : c.ghost} />
            </Pressable>
            <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
              <Feather name="x" size={18} color={c.faint} />
            </Pressable>
          </View>
        </View>
        <View style={styles.searchBox}>
          <Text style={styles.sigmaText}>σ</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar fórmula…"
            placeholderTextColor={c.ghost}
            style={styles.searchInput}
          />
          {!!search && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Feather name="x" size={13} color={c.ghost} />
            </Pressable>
          )}
        </View>
      </View>

      {!showMine && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={{ paddingHorizontal: 28, gap: 6, paddingBottom: 8, flexDirection: "row", alignItems: "center" }}>
          {cats.map((cat) => (
            <Pressable key={cat} onPress={() => setCategory(cat)} style={[styles.catChip, category === cat && styles.catChipActive]}>
              <Text style={[styles.catChipText, category === cat && styles.catChipTextActive]}>{cat}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.overlayBody, { paddingTop: 10 }]} showsVerticalScrollIndicator={false}>
        {list.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{showMine ? "Nenhuma fórmula salva ainda" : "Nenhum resultado"}</Text>
          </View>
        ) : (
          list.map((f) => (
            <Pressable key={f.id} onPress={() => onSelect(f)} style={({ pressed }) => [styles.formulaCard, pressed && styles.rowPressed]}>
              <View style={styles.formulaCardHeader}>
                <View>
                  <Text style={styles.formulaCat}>{f.category}</Text>
                  <Text style={styles.formulaName}>{f.name}</Text>
                </View>
                {f.isUser ? (
                  <Pressable hitSlop={8} style={styles.iconBtn}>
                    <Feather name="trash-2" size={13} color={c.ghost} />
                  </Pressable>
                ) : (
                  <Pressable
                    hitSlop={8}
                    onPress={(e) => {
                      e.stopPropagation();
                      setSaved((prev) => new Set([...prev, f.id]));
                    }}
                    style={styles.iconBtn}
                  >
                    <Feather name="bookmark" size={13} color={saved.has(f.id) ? c.mid : c.ghost} />
                  </Pressable>
                )}
              </View>
              <Text style={styles.formulaDesc}>{f.description}</Text>
              <Text style={styles.formulaSymbolicSmall}>{f.symbolic}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.background,
    zIndex: 60,
  },
  overlayHeader: {
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  overlayHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  overlayTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: c.text,
    fontFamily: "Inter_600SemiBold",
  },
  overlayBody: {
    paddingHorizontal: 28,
    paddingBottom: 28,
    gap: 6,
  },
  iconBtn: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  formulaBox: {
    backgroundColor: c.panel,
    borderRadius: 14,
    padding: 18,
    marginBottom: 28,
  },
  formulaSymbolic: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: c.faint,
    marginBottom: 8,
  },
  formulaSubstituted: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: c.text,
  },
  sectionLabel: {
    fontSize: 10,
    color: c.faint,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
    fontFamily: "Inter_600SemiBold",
  },
  varRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: c.surface,
  },
  varSymbol: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: c.mid,
    minWidth: 22,
  },
  varName: {
    fontSize: 13,
    color: c.faint,
    flex: 1,
    fontFamily: "Inter_400Regular",
  },
  varValue: {
    fontSize: 13,
    color: c.text,
    fontFamily: "Inter_600SemiBold",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 11,
    gap: 16,
  },
  stepNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: c.ghost,
    minWidth: 18,
    paddingTop: 2,
  },
  stepText: {
    fontSize: 13,
    color: c.mid,
    lineHeight: 21,
    flex: 1,
    fontFamily: "Inter_400Regular",
  },
  note: {
    fontSize: 11,
    color: c.faint,
    fontStyle: "italic",
    marginTop: 14,
    fontFamily: "Inter_400Regular",
  },
  resultBar: {
    paddingHorizontal: 28,
    paddingTop: 18,
    backgroundColor: c.panel,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "flex-end",
    gap: 8,
  },
  resultLabel: {
    fontSize: 13,
    color: c.faint,
    fontFamily: "Inter_400Regular",
  },
  resultUnit: {
    fontSize: 18,
    color: c.mid,
    fontFamily: "Inter_500Medium",
    marginLeft: 4,
  },
  resultNum: {
    fontSize: 44,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -1.5,
    lineHeight: 52,
  },
  sessionRow: {
    backgroundColor: c.panel,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowPressed: {
    backgroundColor: c.surface,
  },
  sessionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
    marginBottom: 3,
  },
  sessionMeta: {
    fontSize: 11,
    color: c.faint,
    fontFamily: "Inter_400Regular",
  },
  searchBox: {
    backgroundColor: c.panel,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sigmaText: {
    fontSize: 14,
    color: c.ghost,
    fontFamily: "Inter_400Regular",
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: c.text,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  catScroll: {
    flexShrink: 0,
  },
  catChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: c.panel,
  },
  catChipActive: {
    backgroundColor: c.text,
  },
  catChipText: {
    fontSize: 12,
    color: c.mid,
    fontFamily: "Inter_500Medium",
  },
  catChipTextActive: {
    color: "#fff",
  },
  formulaCard: {
    backgroundColor: c.panel,
    borderRadius: 12,
    padding: 14,
  },
  formulaCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  formulaCat: {
    fontSize: 10,
    color: c.faint,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: "Inter_500Medium",
  },
  formulaName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
    marginTop: 2,
  },
  formulaDesc: {
    fontSize: 12,
    color: c.faint,
    lineHeight: 18,
    marginBottom: 8,
    fontFamily: "Inter_400Regular",
  },
  formulaSymbolicSmall: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: c.mid,
  },
  bookmarkBtn: {
    padding: 5,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  bookmarkBtnActive: {
    backgroundColor: c.text,
  },
  emptyState: {
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 13,
    color: c.ghost,
    fontFamily: "Inter_400Regular",
  },
});
