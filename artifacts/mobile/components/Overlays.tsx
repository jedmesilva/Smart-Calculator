import React, { useState } from "react";
import { MathView } from "@/components/MathView";
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
import { useAuth } from "@/contexts/AuthContext";
import { FormulaDetailOverlay } from "@/components/FormulaDetailOverlay";

const c = colors.light;

export type Formula = DbFormula;

/* ─── SECTION HEADER ─── */
function DocSection({
  numero,
  titulo,
  children,
}: {
  numero: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.docSection}>
      <View style={styles.docSecHeader}>
        <Text style={styles.docSecNum}>{numero}</Text>
        <Text style={styles.docSecTitle}>{titulo}</Text>
      </View>
      <View style={styles.docSecDivider} />
      {children}
    </View>
  );
}

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

  const now = new Date();
  const today = now.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const proofVerified = data.proof?.verified ?? true;
  const hasFormula =
    data.svgSymbolic || data.svgSubstituted || data.formulaSymbolic || data.formulaSubstituted;

  let sectionNum = 0;
  const nextSec = () => String(++sectionNum).padStart(2, "0");

  return (
    <View style={[styles.overlay, { paddingTop: topPad }]}>
      {/* ── Header ── */}
      <View style={styles.overlayHeader}>
        <Text style={styles.overlayTitle}>Cálculo</Text>
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
              {exporting ? "gerando…" : "salvar"}
            </Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
            <Feather name="x" size={18} color={c.faint} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.overlayBody, { paddingBottom: botPad + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── ID Card ── */}
        <View style={styles.idCard}>
          <View style={styles.idCardTop}>
            <Text style={styles.idTitle}>{data.formulaName}</Text>
            {data.searchUsed && (
              <View style={styles.idBadge}>
                <Feather name="globe" size={9} color={c.mid} />
                <Text style={styles.idBadgeText}>pesquisa web</Text>
              </View>
            )}
          </View>
          <View style={styles.idMeta}>
            {!!data.formulaCategory && (
              <View style={styles.idMetaItem}>
                <Text style={styles.idMetaLabel}>Categoria</Text>
                <Text style={styles.idMetaValue}>{data.formulaCategory}</Text>
              </View>
            )}
            <View style={styles.idMetaItem}>
              <Text style={styles.idMetaLabel}>Data</Text>
              <Text style={styles.idMetaValueMono}>{today}</Text>
            </View>
            <View style={styles.idMetaItem}>
              <Text style={styles.idMetaLabel}>Resultado</Text>
              <Text style={styles.idMetaValue}>
                {data.resultUnit ? `${data.resultUnit} ` : ""}{data.resultFormatted}
              </Text>
            </View>
          </View>
        </View>

        {/* ── 01 Fórmula ── */}
        {hasFormula && (
          <DocSection numero={nextSec()} titulo="Fórmula">
            <View style={styles.formulaDocBox}>
              {data.svgSymbolic ? (
                <MathView svg={data.svgSymbolic} color={c.text} />
              ) : !!data.formulaSymbolic ? (
                <Text style={styles.formulaDocSymbolic}>{data.formulaSymbolic}</Text>
              ) : null}
              {(data.svgSubstituted || data.formulaSubstituted) && (
                <>
                  <View style={styles.formulaDocDivider} />
                  <Text style={styles.formulaDocSubLabel}>com valores substituídos</Text>
                  {data.svgSubstituted ? (
                    <MathView svg={data.svgSubstituted} color={c.mid} />
                  ) : (
                    <Text style={styles.formulaDocSubstituted}>{data.formulaSubstituted}</Text>
                  )}
                </>
              )}
            </View>
          </DocSection>
        )}

        {/* ── 03 Variáveis ── */}
        {data.variables?.length > 0 && (
          <DocSection numero={nextSec()} titulo="Variáveis">
            {data.variables.map((v, i) => (
              <View
                key={i}
                style={[
                  styles.docVarRow,
                  i < data.variables.length - 1 && styles.rowBorder,
                ]}
              >
                <View style={styles.docVarLeft}>
                  <Text style={styles.docVarSymbol}>{v.symbol}</Text>
                  <Text style={styles.docVarName}>{v.name}</Text>
                </View>
                <Text style={styles.docVarValue}>{v.value}</Text>
              </View>
            ))}
          </DocSection>
        )}

        {/* ── 04 Desenvolvimento ── */}
        {data.steps?.length > 0 && (
          <DocSection numero={nextSec()} titulo="Desenvolvimento">
            {data.steps.map((step, i) => (
              <View
                key={i}
                style={[
                  styles.docStepRow,
                  i < data.steps.length - 1 && styles.rowBorder,
                ]}
              >
                <Text style={styles.docStepNum}>{String(i + 1).padStart(2, "0")}</Text>
                <Text style={styles.docStepText}>{step}</Text>
              </View>
            ))}
          </DocSection>
        )}

        {/* ── 05 Resultado ── */}
        <DocSection numero={nextSec()} titulo="Resultado">
          <View style={styles.resultDocCard}>
            <View>
              <Text style={styles.resultDocLabel}>{data.resultLabel}</Text>
              {!!data.resultUnit && (
                <Text style={styles.resultDocUnit}>{data.resultUnit}</Text>
              )}
            </View>
            <Text style={styles.resultDocNum}>{data.resultFormatted}</Text>
          </View>
        </DocSection>

        {/* ── 06 Verificação ── */}
        {data.proof && (
          <DocSection numero={nextSec()} titulo="Verificação">
            <View style={[styles.proofBox, proofVerified ? styles.proofBoxOk : styles.proofBoxWarn]}>
              <View style={styles.proofHeader}>
                <Feather
                  name={proofVerified ? "check-circle" : "alert-circle"}
                  size={14}
                  color={proofVerified ? "#2A7A4B" : "#B07D1A"}
                />
                <Text
                  style={[
                    styles.proofMethod,
                    proofVerified ? styles.proofMethodOk : styles.proofMethodWarn,
                  ]}
                >
                  {data.proof.method}
                </Text>
                <View style={[styles.proofBadge, proofVerified ? styles.proofBadgeOk : styles.proofBadgeWarn]}>
                  <Text style={[styles.proofBadgeText, proofVerified ? styles.proofBadgeTextOk : styles.proofBadgeTextWarn]}>
                    {proofVerified ? "aprovado" : "revisar"}
                  </Text>
                </View>
              </View>
              <Text style={styles.proofDetail}>{data.proof.detail}</Text>
            </View>
          </DocSection>
        )}

        {/* ── Nota & Warning ── */}
        {(data.note || data.warning) && (
          <View style={styles.notesWrap}>
            {data.note && (
              <Text style={styles.note}>* {data.note}</Text>
            )}
            {data.warning && (
              <View style={styles.warningRow}>
                <Feather name="alert-triangle" size={11} color="#B07D1A" />
                <Text style={styles.warningText}>{data.warning}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Footer ── */}
        <View style={styles.docFooter}>
          <Text style={styles.docFooterText}>σ sigma</Text>
          <Text style={styles.docFooterText}>{today} · {time}</Text>
        </View>
      </ScrollView>
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

/* ─── FORMULA CARD ─── */
function FormulaCard({
  f,
  savedIds,
  onSelect,
  onDetail,
  onToggleSave,
}: {
  f: DbFormula;
  savedIds: Set<string>;
  onSelect: (f: DbFormula) => void;
  onDetail: (f: DbFormula) => void;
  onToggleSave: (f: DbFormula, isSaved: boolean) => void;
}) {
  const isSaved = savedIds.has(f.id);
  return (
    <Pressable
      onPress={() => onSelect(f)}
      style={({ pressed }) => [styles.formulaCard, pressed && styles.rowPressed]}
    >
      <View style={styles.formulaCardHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.formulaCat}>{f.category}</Text>
          <Text style={styles.formulaName}>{f.name}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {/* Info / detalhe */}
          <Pressable
            hitSlop={10}
            onPress={(e) => { e.stopPropagation(); onDetail(f); }}
            style={styles.infoBtn}
          >
            <Feather name="info" size={13} color={c.ghost} />
          </Pressable>
          {/* Salvar (só para não-sistema) */}
          {!f.is_system && (
            <Pressable
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(isSaved ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
                onToggleSave(f, isSaved);
              }}
              style={({ pressed }) => [
                styles.bookmarkPill,
                isSaved && styles.bookmarkPillSaved,
                pressed && styles.bookmarkPillPressed,
              ]}
            >
              <Feather name="bookmark" size={12} color={isSaved ? "#fff" : c.ghost} />
              <Text style={[styles.bookmarkPillText, isSaved && styles.bookmarkPillTextSaved]}>
                {isSaved ? "salva ✓" : "salvar"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <Text style={styles.formulaDesc} numberOfLines={2}>{f.description}</Text>
      <Text style={styles.formulaSymbolicSmall}>{f.symbolic}</Text>

      {/* Badges */}
      <View style={{ flexDirection: "row", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
        {f.llm_verdict === "approved" && (
          <View style={styles.cardBadgeOk}>
            <Feather name="cpu" size={9} color="#2A7A4B" />
            <Text style={styles.cardBadgeTextOk}>IA verificou</Text>
          </View>
        )}
        {f.llm_verdict === "flagged" && (
          <View style={styles.cardBadgeWarn}>
            <Feather name="cpu" size={9} color="#B07D1A" />
            <Text style={styles.cardBadgeTextWarn}>IA sinalizou</Text>
          </View>
        )}
        {f.is_public && !f.is_system && (
          <View style={styles.cardBadgeCommunity}>
            <Feather name="globe" size={9} color="#3A6B9A" />
            <Text style={styles.cardBadgeTextCommunity}>comunidade</Text>
          </View>
        )}
      </View>
    </Pressable>
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

  type Tab = "oficiais" | "comunidade" | "minhas";
  const [tab, setTab] = useState<Tab>("oficiais");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [detailFormula, setDetailFormula] = useState<DbFormula | null>(null);

  const { data: allFormulas = [], isLoading: loadingFormulas } = useFormulas();
  const { data: savedIds = new Set<string>() } = useSavedFormulaIds();
  const { userId: currentUserId } = useAuth();
  const toggleSave = useToggleSaveFormula();

  const officialFormulas = allFormulas.filter((f) => f.is_system);
  const communityFormulas = allFormulas.filter((f) => !f.is_system && f.is_public);
  const myFormulas = allFormulas.filter(
    (f) => !f.is_system && (f.user_id === currentUserId || savedIds.has(f.id))
  );

  const baseList =
    tab === "oficiais" ? officialFormulas :
    tab === "comunidade" ? communityFormulas :
    myFormulas;

  const cats = ["Todos", ...Array.from(new Set(officialFormulas.map((f) => f.category))).sort()];

  const list = baseList.filter((f) => {
    const q = search.toLowerCase();
    const matchSearch = f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q);
    const matchCat = tab !== "oficiais" || category === "Todos" || f.category === category;
    return matchSearch && matchCat;
  });

  const emptyLabels: Record<Tab, string> = {
    oficiais: "Nenhum resultado",
    comunidade: "Nenhuma fórmula publicada ainda",
    minhas: "Você ainda não tem fórmulas salvas",
  };

  return (
    <View style={[styles.overlay, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={{ paddingHorizontal: 28, paddingTop: 10, paddingBottom: 12 }}>
        <View style={styles.overlayHeaderRow}>
          <Text style={styles.overlayTitle}>Fórmulas</Text>
          <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
            <Feather name="x" size={18} color={c.faint} />
          </Pressable>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {(["oficiais", "comunidade", "minhas"] as Tab[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => { setTab(t); setSearch(""); setCategory("Todos"); }}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            >
              <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
                {t === "oficiais" ? "Oficiais" : t === "comunidade" ? "Comunidade" : "Minhas"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Search */}
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

      {/* Category chips (apenas aba Oficiais) */}
      {tab === "oficiais" && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.catScroll}
          contentContainerStyle={{ paddingHorizontal: 28, gap: 6, flexDirection: "row", alignItems: "flex-start" }}
        >
          {cats.map((cat) => (
            <Pressable
              key={cat}
              onPress={() => setCategory(cat)}
              style={[styles.catChip, category === cat && styles.catChipActive]}
            >
              <Text style={[styles.catChipText, category === cat && styles.catChipTextActive]}>
                {cat}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Lista */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.overlayBody, { paddingTop: 10, paddingBottom: 28 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {loadingFormulas ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator color={c.ghost} />
          </View>
        ) : list.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{emptyLabels[tab]}</Text>
          </View>
        ) : (
          list.map((f) => (
            <FormulaCard
              key={f.id}
              f={f}
              savedIds={savedIds}
              onSelect={onSelect}
              onDetail={setDetailFormula}
              onToggleSave={(formula, isSaved) =>
                toggleSave.mutate({ formulaId: formula.id, isSaved })
              }
            />
          ))
        )}
      </ScrollView>

      {/* Detalhe da fórmula */}
      {detailFormula && (
        <FormulaDetailOverlay
          formula={detailFormula}
          currentUserId={currentUserId}
          onClose={() => setDetailFormula(null)}
          onUse={(f) => {
            setDetailFormula(null);
            onSelect(f);
          }}
        />
      )}
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
    overflow: "hidden",
  },
  formulaDivider: {
    height: 1,
    backgroundColor: c.ghost,
    marginVertical: 4,
    opacity: 0.4,
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
  proofBox: {
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginBottom: 8,
  },
  proofBoxOk: {
    backgroundColor: "#F0FAF4",
    borderWidth: 1,
    borderColor: "#C0E8CE",
  },
  proofBoxWarn: {
    backgroundColor: "#FBF8ED",
    borderWidth: 1,
    borderColor: "#E8DCA8",
  },
  proofHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  proofMethod: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  proofMethodOk: { color: "#2A7A4B" },
  proofMethodWarn: { color: "#B07D1A" },
  proofBadge: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  proofBadgeOk: { backgroundColor: "#C0E8CE" },
  proofBadgeWarn: { backgroundColor: "#E8DCA8" },
  proofBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  proofBadgeTextOk: { color: "#1A5C38" },
  proofBadgeTextWarn: { color: "#7A5010" },
  proofDetail: {
    fontSize: 12,
    color: c.mid,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
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
  /* ── Doc sections ── */
  docSection: {
    marginBottom: 28,
  },
  docSecHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    marginBottom: 10,
  },
  docSecNum: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: c.ghost,
    letterSpacing: 0.5,
  },
  docSecTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: c.faint,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  docSecDivider: {
    height: 1,
    backgroundColor: c.surface,
    marginBottom: 14,
  },
  /* ── ID card ── */
  idCard: {
    backgroundColor: c.panel,
    borderRadius: 14,
    padding: 18,
    marginBottom: 28,
  },
  idCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 10,
  },
  idTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: c.text,
    letterSpacing: -0.3,
    flex: 1,
  },
  idBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: c.surface,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 7,
    flexShrink: 0,
    marginTop: 3,
  },
  idBadgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: c.mid,
  },
  idMeta: {
    flexDirection: "row",
    gap: 20,
    flexWrap: "wrap",
  },
  idMetaItem: {
    gap: 2,
  },
  idMetaLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    color: c.ghost,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  idMetaValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: c.mid,
  },
  idMetaValueMono: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: c.mid,
  },
  /* ── Context ── */
  contextText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: c.mid,
    lineHeight: 21,
  },
  /* ── Formula doc ── */
  formulaDocBox: {
    backgroundColor: c.panel,
    borderRadius: 12,
    padding: 16,
    gap: 10,
    alignItems: "center",
  },
  formulaDocDivider: {
    height: 1,
    backgroundColor: c.surface,
    width: "100%",
  },
  formulaDocSubLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: c.ghost,
    letterSpacing: 0.3,
    alignSelf: "flex-start",
  },
  formulaDocSymbolic: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: c.text,
    textAlign: "center",
  },
  formulaDocSubstituted: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: c.mid,
    textAlign: "center",
  },
  /* ── Variáveis doc ── */
  docVarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
    gap: 12,
  },
  docVarLeft: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  docVarSymbol: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: c.text,
    minWidth: 22,
  },
  docVarName: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: c.faint,
    flex: 1,
  },
  docVarValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: c.text,
    flexShrink: 0,
  },
  /* ── Steps doc ── */
  docStepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 11,
    gap: 16,
  },
  docStepNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: c.ghost,
    minWidth: 18,
    paddingTop: 3,
  },
  docStepText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: c.mid,
    lineHeight: 21,
    flex: 1,
  },
  /* ── Resultado doc ── */
  resultDocCard: {
    backgroundColor: c.text,
    borderRadius: 12,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resultDocLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#6B6B66",
    marginBottom: 2,
  },
  resultDocUnit: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#AEADA8",
    marginTop: 2,
  },
  resultDocNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 36,
    color: c.background,
    letterSpacing: -1.5,
    lineHeight: 42,
  },
  /* ── Notes & warnings ── */
  notesWrap: {
    gap: 8,
    marginBottom: 28,
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  warningText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#B07D1A",
    lineHeight: 17,
    flex: 1,
  },
  /* ── Footer ── */
  docFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: c.surface,
    marginTop: 4,
  },
  docFooterText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: c.ghost,
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
  tabRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 10,
  },
  tabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: c.panel,
  },
  tabBtnActive: {
    backgroundColor: c.text,
  },
  tabBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: c.mid,
  },
  tabBtnTextActive: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
  },
  infoBtn: {
    padding: 5,
    borderRadius: 8,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBadgeOk: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: "#F0FAF4",
  },
  cardBadgeTextOk: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "#2A7A4B",
  },
  cardBadgeWarn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: "#FBF8ED",
  },
  cardBadgeTextWarn: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "#B07D1A",
  },
  cardBadgeCommunity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: "#EBF3FB",
  },
  cardBadgeTextCommunity: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "#3A6B9A",
  },
});
