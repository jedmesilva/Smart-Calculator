import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import colors from "@/constants/colors";
import type { ResultData } from "@/lib/apiClient";
import { exportAsPDF, copyToClipboard } from "@/lib/exportCalc";
import {
  useFormulas,
  useSavedFormulaIds,
  useSessions,
  useToggleSaveFormula,
  type DbFormula,
  type DbSession,
} from "@/lib/queries";

const c = colors.light;

export type Formula = DbFormula;

/* ─── CALC OVERLAY ─── */
export function CalcOverlay({ data, onClose }: { data: ResultData; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const botPad = Platform.OS === "web" ? 0 : insets.bottom;
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleExportPDF = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportAsPDF(data);
    } catch (err: any) {
      Alert.alert("Erro ao exportar", err?.message ?? "Tente novamente.");
    } finally {
      setExporting(false);
    }
  };

  const handleCopy = async () => {
    await copyToClipboard(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={[styles.overlay, { paddingTop: topPad }]}>
      <View style={styles.overlayHeader}>
        <Text style={styles.overlayTitle}>{data.formulaName}</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleCopy}
            style={[styles.exportBtn, copied && styles.exportBtnActive]}
            hitSlop={8}
          >
            <Feather name={copied ? "check" : "copy"} size={13} color={copied ? "#fff" : c.mid} />
            <Text style={[styles.exportBtnText, copied && styles.exportBtnTextActive]}>
              {copied ? "copiado!" : "copiar"}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleExportPDF}
            disabled={exporting}
            style={[styles.exportBtn, styles.exportBtnPDF, exporting && { opacity: 0.6 }]}
            hitSlop={8}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#fff" style={{ width: 13, height: 13 }} />
            ) : (
              <Feather name="share" size={13} color="#fff" />
            )}
            <Text style={[styles.exportBtnText, styles.exportBtnTextActive]}>
              {exporting ? "gerando…" : "PDF"}
            </Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
            <Feather name="x" size={18} color={c.faint} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.overlayBody}
        showsVerticalScrollIndicator={false}
      >
        {(data.formulaSymbolic || data.formulaSubstituted) && (
          <View style={styles.formulaBox}>
            {!!data.formulaSymbolic && (
              <Text style={styles.formulaSymbolic}>{data.formulaSymbolic}</Text>
            )}
            {!!data.formulaSubstituted && (
              <Text style={styles.formulaSubstituted}>{data.formulaSubstituted}</Text>
            )}
          </View>
        )}

        {data.variables?.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Variáveis</Text>
            <View style={{ marginBottom: 28 }}>
              {data.variables.map((v, i) => (
                <View
                  key={i}
                  style={[styles.varRow, i < data.variables.length - 1 && styles.rowBorder]}
                >
                  <Text style={styles.varSymbol}>{v.symbol}</Text>
                  <Text style={styles.varName}>{v.name}</Text>
                  <Text style={styles.varValue}>{v.value}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {data.steps?.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Passo a passo</Text>
            {data.steps.map((step, i) => (
              <View
                key={i}
                style={[styles.stepRow, i < data.steps.length - 1 && styles.rowBorder]}
              >
                <Text style={styles.stepNum}>{String(i + 1).padStart(2, "0")}</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </>
        )}

        {data.note && <Text style={styles.note}>* {data.note}</Text>}
      </ScrollView>

      <View style={[styles.resultBar, { paddingBottom: botPad + 20 }]}>
        <Text style={styles.resultLabel}>{data.resultLabel}</Text>
        {!!data.resultUnit && <Text style={styles.resultUnit}>{data.resultUnit}</Text>}
        <Text style={styles.resultNum}>{data.resultFormatted}</Text>
      </View>
    </View>
  );
}

/* ─── HISTORY OVERLAY ─── */
export function HistoryOverlay({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (s: DbSession) => void;
}) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const { data: sessions, isLoading } = useSessions();

  return (
    <View style={[styles.overlay, { paddingTop: topPad }]}>
      <View style={styles.overlayHeader}>
        <Text style={styles.overlayTitle}>Histórico</Text>
        <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
          <Feather name="x" size={18} color={c.faint} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.overlayBody,
          { paddingBottom: 28 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator color={c.ghost} />
          </View>
        ) : sessions?.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Nenhum cálculo ainda</Text>
          </View>
        ) : (
          sessions?.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => onSelect(s)}
              style={({ pressed }) => [styles.sessionRow, pressed && styles.rowPressed]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.sessionTitle} numberOfLines={1}>
                  {s.title}
                </Text>
                <Text style={styles.sessionMeta}>
                  {new Date(s.updated_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              <Feather name="chevron-right" size={13} color={c.ghost} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/* ─── FORMULAS SCREEN ─── */
export function FormulasScreen({
  onSelect,
  onClose,
}: {
  onSelect: (f: DbFormula) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 0 : insets.top;

  const [showMine, setShowMine] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");

  const { data: allFormulas = [], isLoading: loadingFormulas } = useFormulas();
  const { data: savedIds = new Set<string>() } = useSavedFormulaIds();
  const toggleSave = useToggleSaveFormula();

  const systemFormulas = allFormulas.filter((f) => f.is_system);
  const savedFormulas = allFormulas.filter((f) => savedIds.has(f.id));
  const base = showMine ? savedFormulas : systemFormulas;

  const cats = ["Todos", ...Array.from(new Set(systemFormulas.map((f) => f.category))).sort()];

  const list = base.filter((f) => {
    const q = search.toLowerCase();
    return (
      (f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)) &&
      (showMine || category === "Todos" || f.category === category)
    );
  });

  return (
    <View style={[styles.overlay, { paddingTop: topPad }]}>
      <View style={{ paddingHorizontal: 28, paddingTop: 10, paddingBottom: 12 }}>
        <View style={styles.overlayHeaderRow}>
          <Text style={styles.overlayTitle}>
            {showMine ? "Minhas fórmulas" : "Fórmulas"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable
              onPress={() => {
                setShowMine((v) => !v);
                setSearch("");
              }}
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.catScroll}
          contentContainerStyle={{
            paddingHorizontal: 28,
            gap: 6,
            flexDirection: "row",
            alignItems: "flex-start",
          }}
        >
          {cats.map((cat) => (
            <Pressable
              key={cat}
              onPress={() => setCategory(cat)}
              style={[styles.catChip, category === cat && styles.catChipActive]}
            >
              <Text
                style={[styles.catChipText, category === cat && styles.catChipTextActive]}
              >
                {cat}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.overlayBody,
          { paddingTop: 10, paddingBottom: 28 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loadingFormulas ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator color={c.ghost} />
          </View>
        ) : list.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {showMine ? "Nenhuma fórmula salva ainda" : "Nenhum resultado"}
            </Text>
          </View>
        ) : (
          list.map((f) => {
            const isSaved = savedIds.has(f.id);
            return (
              <Pressable
                key={f.id}
                onPress={() => onSelect(f)}
                style={({ pressed }) => [styles.formulaCard, pressed && styles.rowPressed]}
              >
                <View style={styles.formulaCardHeader}>
                  <View>
                    <Text style={styles.formulaCat}>{f.category}</Text>
                    <Text style={styles.formulaName}>{f.name}</Text>
                  </View>
                  <Pressable
                    hitSlop={8}
                    onPress={(e) => {
                      e.stopPropagation();
                      Haptics.impactAsync(
                        isSaved
                          ? Haptics.ImpactFeedbackStyle.Light
                          : Haptics.ImpactFeedbackStyle.Medium
                      );
                      toggleSave.mutate({ formulaId: f.id, isSaved });
                    }}
                    style={({ pressed }) => [
                      styles.bookmarkPill,
                      isSaved && styles.bookmarkPillSaved,
                      pressed && styles.bookmarkPillPressed,
                    ]}
                  >
                    <Feather
                      name={isSaved ? "bookmark" : "bookmark"}
                      size={12}
                      color={isSaved ? "#fff" : c.ghost}
                    />
                    <Text style={[styles.bookmarkPillText, isSaved && styles.bookmarkPillTextSaved]}>
                      {isSaved ? "salva ✓" : "salvar"}
                    </Text>
                  </Pressable>
                </View>
                <Text style={styles.formulaDesc}>{f.description}</Text>
                <Text style={styles.formulaSymbolicSmall}>{f.symbolic}</Text>
              </Pressable>
            );
          })
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
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: c.surface,
  },
  exportBtnActive: {
    backgroundColor: c.text,
  },
  exportBtnPDF: {
    backgroundColor: c.text,
  },
  exportBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: c.mid,
  },
  exportBtnTextActive: {
    color: "#fff",
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
  rowPressed: { backgroundColor: c.surface },
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
    flexGrow: 0,
    height: 40,
    marginBottom: 6,
  },
  catChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: c.panel,
  },
  catChipActive: { backgroundColor: c.text },
  catChipText: {
    fontSize: 12,
    color: c.mid,
    fontFamily: "Inter_500Medium",
  },
  catChipTextActive: { color: "#fff" },
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
  bookmarkBtnActive: { backgroundColor: c.text },
  bookmarkPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: c.surface,
  },
  bookmarkPillSaved: {
    backgroundColor: c.text,
  },
  bookmarkPillPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.94 }],
  },
  bookmarkPillText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: c.ghost,
  },
  bookmarkPillTextSaved: {
    color: "#fff",
  },
  centerLoader: {
    height: 160,
    alignItems: "center",
    justifyContent: "center",
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
