import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import colors from "@/constants/colors";
import { CalcOverlay, HistoryOverlay, FormulasScreen, type Formula } from "@/components/Overlays";
import { MenuOverlay } from "@/components/MenuOverlay";

const c = colors.light;

type ChatItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "result"; id: string; result: ResultData };

type ResultData = {
  formulaName: string;
  resultFormatted: string;
  resultUnit: string;
  resultLabel: string;
  formulaSymbolic: string;
  formulaSubstituted: string;
};

const INITIAL_CHAT: ChatItem[] = [
  { kind: "user", id: "1", text: "Quanto rende R$ 1.000 aplicado a 1% ao mês por 12 meses?" },
  {
    kind: "result",
    id: "2",
    result: {
      formulaName: "Juros Compostos",
      resultFormatted: "1.126,83",
      resultUnit: "R$",
      resultLabel: "montante final",
      formulaSymbolic: "M = C × (1 + i)ⁿ",
      formulaSubstituted: "M = 1000 × (1 + 0,01)¹²",
    },
  },
  { kind: "user", id: "3", text: "E se fossem 24 meses?" },
  {
    kind: "result",
    id: "4",
    result: {
      formulaName: "Juros Compostos",
      resultFormatted: "1.269,73",
      resultUnit: "R$",
      resultLabel: "montante final",
      formulaSymbolic: "M = C × (1 + i)ⁿ",
      formulaSubstituted: "M = 1000 × (1 + 0,01)²⁴",
    },
  },
];

/* ─── USER BUBBLE ─── */
function UserBubble({ text }: { text: string }) {
  return (
    <View style={styles.userBubbleWrap}>
      <View style={styles.userBubble}>
        <Text style={styles.userBubbleText}>{text}</Text>
      </View>
    </View>
  );
}

/* ─── RESULT ROW ─── */
function ResultRow({
  result,
  onView,
  isSaved,
  onSave,
}: {
  result: ResultData;
  onView: () => void;
  isSaved: boolean;
  onSave: () => void;
}) {
  return (
    <View style={styles.resultCard}>
      <View style={styles.resultCardTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.resultFormula}>{result.formulaName}</Text>
          <Text style={styles.resultSubstituted} numberOfLines={1}>{result.formulaSubstituted}</Text>
        </View>
        <View style={styles.resultRight}>
          <View style={{ alignItems: "flex-end" }}>
            {!!result.resultUnit && (
              <Text style={styles.resultUnit}>{result.resultUnit}</Text>
            )}
            <Text style={styles.resultNum}>{result.resultFormatted}</Text>
          </View>
          <Pressable onPress={onView} style={({ pressed }) => [styles.viewBtn, pressed && { backgroundColor: c.ghost }]}>
            <Text style={styles.sigmaSmall}>σ</Text>
            <Text style={styles.viewBtnText}>ver</Text>
          </Pressable>
        </View>
      </View>
      {!isSaved ? (
        <Pressable onPress={onSave} style={({ pressed }) => [styles.saveRow, pressed && { backgroundColor: c.surface }]}>
          <Feather name="bookmark" size={11} color={c.ghost} />
          <Text style={styles.saveText}>Salvar como minha fórmula</Text>
        </Pressable>
      ) : (
        <View style={styles.saveRow}>
          <Feather name="bookmark" size={11} color={c.faint} />
          <Text style={[styles.saveText, { color: c.faint }]}>Salva em Minhas fórmulas</Text>
        </View>
      )}
    </View>
  );
}

/* ─── LOADING DOTS ─── */
function LoadingDots() {
  return (
    <View style={styles.loadingWrap}>
      <View style={styles.loadingDot} />
      <View style={styles.loadingBubble}>
        <ActivityIndicator size="small" color={c.ghost} />
      </View>
    </View>
  );
}

const SUGGESTIONS = [
  "Quanto rende R$ 5.000 a 1% ao mês por 12 meses?",
  "Qual é o IMC de alguém com 70 kg e 1,75 m?",
  "Qual a área de um círculo com raio 8 cm?",
  "Velocidade média de 150 km em 2 horas?",
];

/* ─── EMPTY STATE ─── */
function EmptyChat({ onSuggest }: { onSuggest: (text: string) => void }) {
  return (
    <View style={[styles.emptyWrap, { transform: [{ scaleY: -1 }] }]}>
      <Text style={styles.emptyσ}>σ</Text>
      <Text style={styles.emptyTitle}>Nova sessão</Text>
      <Text style={styles.emptySubtitle}>Descreva qualquer cálculo em português</Text>
      <View style={styles.emptyChips}>
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s}
            onPress={() => onSuggest(s)}
            style={({ pressed }) => [styles.emptyChip, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.emptyChipText} numberOfLines={2}>{s}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/* ─── MAIN ─── */
export default function SigmaScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [screen, setScreen] = useState<"main" | "calc" | "history" | "formulas" | "menu">("main");
  const [activeFormula, setActiveFormula] = useState<Formula | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chat, setChat] = useState<ChatItem[]>(INITIAL_CHAT);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<TextInput>(null);

  const lastResult = [...chat].reverse().find((x) => x.kind === "result");
  const current = lastResult?.kind === "result" ? lastResult.result : null;
  const hasResult = !!current;
  const displayNum = current?.resultFormatted ?? "0";
  const numFontSize = displayNum.length > 12 ? 38 : displayNum.length > 8 ? 50 : 64;

  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const botPad = Platform.OS === "web" ? 0 : insets.bottom;
  const kbOffset = Platform.OS === "ios" ? 0 : 0;

  const handleNewSession = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setChat([]);
    setQuery("");
    setSavedIds(new Set());
    setActiveFormula(null);
    setScreen("main");
  }, []);

  const handleSend = useCallback(() => {
    if (!query.trim() || isLoading) return;
    const text = query.trim();
    setQuery("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    const resultId = newId + "_r";
    setChat((prev) => [...prev, { kind: "user", id: newId, text }]);
    setIsLoading(true);
    setTimeout(() => {
      setChat((prev) => [
        ...prev,
        {
          kind: "result",
          id: resultId,
          result: {
            formulaName: activeFormula?.name ?? "Juros Compostos",
            resultFormatted: "1.480,24",
            resultUnit: "R$",
            resultLabel: "montante final",
            formulaSymbolic: "M = C × (1 + i)ⁿ",
            formulaSubstituted: "M = 1000 × (1 + 0,01)³⁶",
          },
        },
      ]);
      setIsLoading(false);
    }, 1400);
  }, [query, isLoading, activeFormula]);

  const canSend = query.trim().length > 0 && !isLoading;

  const invertedData = [...chat].reverse();

  const renderItem = useCallback(
    ({ item, index }: { item: ChatItem; index: number }) => {
      const originalIndex = chat.length - 1 - index;
      if (item.kind === "user") return <UserBubble text={item.text} />;
      if (item.kind === "result") {
        const isSaved = savedIds.has(item.id) || originalIndex < chat.length - 2;
        return (
          <ResultRow
            result={item.result}
            onView={() => setScreen("calc")}
            isSaved={isSaved}
            onSave={() => {
              setSavedIds((prev) => new Set([...prev, item.id]));
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
          />
        );
      }
      return null;
    },
    [chat, savedIds]
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* ── DISPLAY PANEL ── */}
      <View style={[styles.displayPanel, { paddingTop: topPad + 10 }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable onPress={() => setScreen("menu")} style={styles.headerIconBtn} hitSlop={8}>
              <Feather name="menu" size={15} color={c.ghost} />
            </Pressable>
            <Text style={styles.logo}>sigma</Text>
          </View>
          <View style={styles.headerRight}>
            <Pressable onPress={handleNewSession} style={styles.headerIconBtn} hitSlop={8}>
              <Feather name="plus" size={16} color={c.ghost} />
            </Pressable>
            <Pressable onPress={() => setScreen("history")} style={styles.headerIconBtn} hitSlop={8}>
              <Feather name="clock" size={15} color={c.ghost} />
            </Pressable>
          </View>
        </View>

        {/* Big Number */}
        <View style={styles.numSection}>
          <View style={styles.numRow}>
            {hasResult && !!current.resultUnit && (
              <Text style={styles.numUnit}>{current.resultUnit}</Text>
            )}
            <Text style={[styles.numDisplay, { fontSize: numFontSize, color: hasResult ? c.text : c.ghost }]}>
              {displayNum}
            </Text>
          </View>
          <View style={styles.numMeta}>
            <Text style={[styles.numLabel, { color: hasResult ? c.faint : c.ghost }]}>
              {hasResult ? current.resultLabel : "resultado"}
            </Text>
            <Pressable
              onPress={() => { if (hasResult) setScreen("calc"); }}
              disabled={!hasResult}
              style={({ pressed }) => [
                styles.verCalcBtn,
                hasResult ? styles.verCalcBtnActive : styles.verCalcBtnInactive,
                pressed && hasResult && { backgroundColor: c.surface },
              ]}
            >
              <Text style={styles.sigmaSmall}>σ</Text>
              <Text style={[styles.verCalcText, { color: hasResult ? c.mid : c.ghost }]}>ver cálculo</Text>
              {hasResult && <Feather name="chevron-right" size={11} color={c.mid} />}
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── FORMULA ROW ── */}
      <View style={styles.formulaRow}>
        {/* Linha 1: label + chevron → navega para fórmulas */}
        <Pressable
          onPress={() => setScreen("formulas")}
          style={({ pressed }) => [styles.formulaRowHeader, pressed && { opacity: 0.6 }]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="book-open" size={11} color={c.ghost} />
            <Text style={styles.formulaRowLabel}>fórmula</Text>
          </View>
          <Feather name="chevron-right" size={11} color={c.ghost} />
        </Pressable>

        {/* Linha 2: estado da fórmula + ações */}
        <View style={styles.formulaRowState}>
          <Text
            style={[styles.formulaRowName, activeFormula ? styles.formulaRowNameActive : {}]}
            numberOfLines={1}
          >
            {activeFormula ? activeFormula.name : "Modo dinâmico"}
          </Text>
          <View style={styles.formulaRowActions}>
            <Pressable onPress={() => setScreen("formulas")} style={styles.alterBtn} hitSlop={8}>
              <Text style={styles.alterBtnText}>alterar</Text>
            </Pressable>
            {activeFormula && (
              <Pressable onPress={() => setActiveFormula(null)} style={styles.removeBtn} hitSlop={8}>
                <Feather name="x" size={11} color={c.faint} />
                <Text style={styles.removeBtnText}>remover</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* ── CHAT + INPUT ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={kbOffset}
      >
        <FlatList
          data={invertedData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          inverted
          contentContainerStyle={chat.length === 0 ? styles.chatContentEmpty : styles.chatContent}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={isLoading ? <LoadingDots /> : null}
          ListEmptyComponent={<EmptyChat onSuggest={(text) => { setQuery(text); inputRef.current?.focus(); }} />}
        />

        {/* INPUT BAR */}
        <View style={[styles.inputWrap, { paddingBottom: botPad + 12 }]}>
          <View style={styles.inputBox}>
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Descreva o cálculo…"
              placeholderTextColor={c.ghost}
              multiline
              style={styles.textInput}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
            <Pressable
              onPress={handleSend}
              disabled={!canSend}
              style={[styles.sendBtn, canSend ? styles.sendBtnActive : styles.sendBtnInactive]}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={c.ghost} />
              ) : (
                <Feather name="arrow-up" size={14} color={canSend ? c.background : c.ghost} strokeWidth={2.5} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ── OVERLAYS ── */}
      {screen === "calc" && <CalcOverlay onClose={() => setScreen("main")} />}
      {screen === "history" && <HistoryOverlay onClose={() => setScreen("main")} onSelect={() => setScreen("main")} />}
      {screen === "formulas" && (
        <FormulasScreen
          onSelect={(f) => { setActiveFormula(f); setScreen("main"); }}
          onClose={() => setScreen("main")}
        />
      )}
      {screen === "menu" && <MenuOverlay onClose={() => setScreen("main")} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  displayPanel: {
    flexShrink: 0,
    paddingHorizontal: 28,
    paddingBottom: 36,
    justifyContent: "space-between",
    minHeight: 300,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 36,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  headerRight: {
    flexDirection: "row",
    gap: 4,
  },
  headerIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#1A1A18",
    letterSpacing: -0.3,
  },
  numSection: {},
  numRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 6,
  },
  numUnit: {
    fontSize: 20,
    fontFamily: "Inter_400Regular",
    color: "#AEADA8",
    lineHeight: 24,
  },
  numDisplay: {
    fontFamily: "Inter_700Bold",
    letterSpacing: -2.5,
    lineHeight: 68,
  },
  numMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  numLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: "Inter_500Medium",
  },
  verCalcBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 9,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  verCalcBtnActive: {
    backgroundColor: "#EFEFEC",
  },
  verCalcBtnInactive: {
    backgroundColor: "transparent",
    opacity: 0.4,
  },
  sigmaSmall: {
    fontSize: 12,
    color: "#6B6B66",
    fontFamily: "Inter_400Regular",
  },
  verCalcText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  formulaRow: {
    flexShrink: 0,
    paddingHorizontal: 28,
    paddingVertical: 10,
    gap: 5,
  },
  formulaRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  formulaRowState: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  formulaRowLabel: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: "#AEADA8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  formulaRowName: {
    fontSize: 12,
    color: "#AEADA8",
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  formulaRowNameActive: {
    color: "#1A1A18",
    fontFamily: "Inter_600SemiBold",
  },
  formulaRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  alterBtn: {
    paddingVertical: 4,
  },
  alterBtnText: {
    fontSize: 11,
    color: "#AEADA8",
    fontFamily: "Inter_400Regular",
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
  },
  removeBtnText: {
    fontSize: 11,
    color: "#AEADA8",
    fontFamily: "Inter_400Regular",
  },
  chatContent: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    gap: 10,
  },
  chatContentEmpty: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 24,
    gap: 6,
  },
  emptyσ: {
    fontSize: 36,
    color: "#DEDED9",
    fontFamily: "Inter_400Regular",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#AEADA8",
    letterSpacing: -0.2,
  },
  emptySubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#C8C7C2",
    marginBottom: 16,
  },
  emptyChips: {
    width: "100%",
    gap: 6,
  },
  emptyChip: {
    backgroundColor: "#EFEFEC",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  emptyChipText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#6B6B66",
    lineHeight: 17,
  },
  userBubbleWrap: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  userBubble: {
    maxWidth: "72%",
    backgroundColor: "#EFEFEC",
    borderRadius: 14,
    borderBottomRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  userBubbleText: {
    fontSize: 13,
    color: "#1A1A18",
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
  },
  resultCard: {
    backgroundColor: "#EFEFEC",
    borderRadius: 12,
    overflow: "hidden",
  },
  resultCardTop: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  resultFormula: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#1A1A18",
    marginBottom: 2,
  },
  resultSubstituted: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#AEADA8",
  },
  resultRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  resultUnit: {
    fontSize: 11,
    color: "#AEADA8",
    fontFamily: "Inter_400Regular",
    marginBottom: 1,
  },
  resultNum: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#1A1A18",
    letterSpacing: -0.4,
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8E7E3",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  viewBtnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#6B6B66",
  },
  saveRow: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "#E8E7E3",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  saveText: {
    fontSize: 11,
    color: "#C8C7C2",
    fontFamily: "Inter_400Regular",
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  loadingDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#C8C7C2",
    marginTop: 14,
    flexShrink: 0,
  },
  loadingBubble: {
    paddingVertical: 11,
    paddingHorizontal: 15,
    backgroundColor: "#EFEFEC",
    borderRadius: 14,
    borderTopLeftRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrap: {
    paddingHorizontal: 28,
    paddingTop: 8,
    flexShrink: 0,
  },
  inputBox: {
    backgroundColor: "#EFEFEC",
    borderRadius: 16,
    paddingVertical: 12,
    paddingLeft: 18,
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    color: "#1A1A18",
    fontFamily: "Inter_400Regular",
    minHeight: 30,
    maxHeight: 100,
    lineHeight: 19,
    padding: 0,
    textAlignVertical: "center",
  },
  sendBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sendBtnActive: {
    backgroundColor: "#1A1A18",
  },
  sendBtnInactive: {
    backgroundColor: "#E8E7E3",
  },
});
