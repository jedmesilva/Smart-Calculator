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
  Animated,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import colors from "@/constants/colors";
import { CalcOverlay, HistoryOverlay, FormulasScreen } from "@/components/Overlays";
import { MenuOverlay } from "@/components/MenuOverlay";
import { useAuth } from "@/contexts/AuthContext";
import { calculate, type ResultData, type MissingVariable } from "@/lib/apiClient";
import { buildContext } from "@/lib/contextBuilder";
import { createSession, saveMessages, touchSession, fetchSessionSummary, useSavedFormulaIds, useSaveFormulaFromChat } from "@/lib/queries";
import type { DbFormula } from "@/lib/queries";

const c = colors.light;

type ChatItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "result"; id: string; result: ResultData }
  | { kind: "question"; id: string; message: string; missing: MissingVariable[] }
  | { kind: "error"; id: string; message: string };

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

/* ─── ASSISTANT BUBBLE (resposta conversacional) ─── */
function AssistantBubble({ text }: { text: string }) {
  return (
    <View style={styles.assistantBubble}>
      <Text style={styles.assistantText}>{text}</Text>
    </View>
  );
}

/* ─── QUESTION BUBBLE ─── */
function QuestionBubble({ message, missing }: { message: string; missing: MissingVariable[] }) {
  const validMissing = missing.filter((m) => m.name || m.symbol || m.description);
  return (
    <View style={styles.questionBubble}>
      <Text style={styles.questionMessage}>{message}</Text>
      <View style={styles.missingList}>
        {validMissing.length === 0 ? (
          <Text style={styles.missingDesc}>Informe os dados necessários para continuar.</Text>
        ) : (
          validMissing.map((m, i) => (
            <View key={i} style={styles.missingItem}>
              <Text style={styles.missingDot}>•</Text>
              <View style={styles.missingContent}>
                <Text style={styles.missingName}>
                  {m.name || m.symbol}
                  {m.symbol && m.name ? <Text style={styles.missingSymbol}> ({m.symbol})</Text> : null}
                </Text>
                {!!m.description && (
                  <Text style={styles.missingDesc}>{m.description}</Text>
                )}
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

/* ─── ERROR BUBBLE ─── */
function ErrorBubble({ message }: { message: string }) {
  return (
    <View style={styles.errorBubble}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <Feather name="alert-circle" size={14} color="#D93025" />
        <Text style={styles.errorTitle}>Atenção</Text>
      </View>
      <Text style={styles.errorText}>{message}</Text>
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
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleSave = () => {
    if (isSaved) return;
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1.04,
        useNativeDriver: true,
        speed: 50,
        bounciness: 6,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 50,
        bounciness: 4,
      }),
    ]).start();
    onSave();
  };

  return (
    <View style={{ gap: 8 }}>
      <Animated.View style={[styles.resultCard, { transform: [{ scale: scaleAnim }] }]}>
        <View style={styles.resultCardTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <Text style={styles.resultFormula}>{result.formulaName}</Text>
              {result.searchUsed && (
                <View style={styles.searchUsedTag}>
                  <Feather name="globe" size={8} color={c.mid} />
                  <Text style={styles.searchUsedText}>verificado</Text>
                </View>
              )}
              {result.proof && !result.proof.verified && (
                <View style={styles.proofWarningTag}>
                  <Feather name="alert-triangle" size={8} color="#B07D1A" />
                  <Text style={styles.proofWarningText}>revisar</Text>
                </View>
              )}
            </View>
            <Text style={styles.resultSubstituted} numberOfLines={1}>
              {result.formulaSubstituted}
            </Text>
          </View>
          <View style={styles.resultRight}>
            <View style={{ alignItems: "flex-end" }}>
              {!!result.resultUnit && (
                <Text style={styles.resultUnit}>{result.resultUnit}</Text>
              )}
              <Text style={styles.resultNum}>{result.resultFormatted}</Text>
            </View>
            <Pressable
              onPress={onView}
              style={({ pressed }) => [styles.viewBtn, pressed && { backgroundColor: c.ghost }]}
            >
              <Text style={styles.sigmaSmall}>σ</Text>
              <Text style={styles.viewBtnText}>ver</Text>
            </Pressable>
          </View>
        </View>
        {!isSaved ? (
          <Pressable
            onPress={handleSave}
            style={({ pressed }) => [
              styles.saveRow,
              pressed && styles.saveRowPressed,
            ]}
          >
            <Feather name="bookmark" size={11} color={c.mid} />
            <Text style={styles.saveText}>Salvar como minha fórmula</Text>
          </Pressable>
        ) : (
          <View style={[styles.saveRow, styles.saveRowSaved]}>
            <Feather name="bookmark" size={11} color={c.text} />
            <Text style={[styles.saveText, styles.saveTextSaved]}>
              Salvo em Minhas fórmulas
            </Text>
          </View>
        )}
      </Animated.View>

      {result.warning && (
        <View style={styles.warningRow}>
          <Feather name="alert-triangle" size={12} color="#B07D1A" />
          <Text style={styles.warningText}>{result.warning}</Text>
        </View>
      )}
    </View>
  );
}

/* ─── LOADING DOTS ─── */
function LoadingDots() {
  return (
    <View style={styles.loadingBubble}>
      <ActivityIndicator size="small" color={c.ghost} />
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
            <Text style={styles.emptyChipText} numberOfLines={2}>
              {s}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/* ─── MAIN ─── */
export default function SigmaScreen() {
  const insets = useSafeAreaInsets();
  const { userId, userName, setUserName } = useAuth();
  const queryClient = useQueryClient();

  const { data: savedFormulaIds = new Set<string>() } = useSavedFormulaIds();
  const saveMutation = useSaveFormulaFromChat();

  const [query, setQuery] = useState("");
  const [screen, setScreen] = useState<"main" | "calc" | "history" | "formulas" | "menu">("main");
  const [activeFormula, setActiveFormula] = useState<DbFormula | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [savedResultIds, setSavedResultIds] = useState<Set<string>>(new Set());
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [viewingResult, setViewingResult] = useState<ResultData | null>(null);
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
    setSavedResultIds(new Set());
    setActiveFormula(null);
    setCurrentSessionId(null);
    setSessionSummary(null);
    setMessageCount(0);
    setScreen("main");
  }, []);

  const handleSend = useCallback(async () => {
    if (!query.trim() || isLoading) return;
    const text = query.trim();
    setQuery("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const msgId = Date.now().toString() + Math.random().toString(36).slice(2, 6);

    const contextSnapshot = chat;
    setChat((prev) => [...prev, { kind: "user", id: msgId, text }]);
    setIsLoading(true);

    const context = buildContext(contextSnapshot);

    try {
      const response = await calculate({
        query: text,
        formulaId: activeFormula?.id,
        context,
        sessionId: currentSessionId ?? undefined,
        sessionSummary: sessionSummary ?? undefined,
        messageCount,
        userName: userName ?? undefined,
      });

      const resultId = msgId + "_r";
      const assistantId = msgId + "_a";

      // Salva nome capturado pelo Phormula (fire-and-forget)
      if (!userName) {
        const capturedName =
          response.status === "success" || response.status === "conversational"
            ? response.capturedName
            : undefined;
        if (capturedName) {
          setUserName(capturedName);
        }
      }

      if (response.status === "success") {
        const items: ChatItem[] = [];
        // Remove literal "" or '' that the LLM sometimes returns as "empty" signal
        const conv = (response.result.conversationalResponse ?? "")
          .replace(/^["'\s]+$/, "")
          .trim();
        if (conv) {
          items.push({ kind: "assistant", id: assistantId, text: conv });
        }
        items.push({ kind: "result", id: resultId, result: response.result });
        setChat((prev) => [...prev, ...items]);
      } else if (response.status === "conversational") {
        setChat((prev) => [...prev, { kind: "assistant", id: resultId, text: response.message }]);
      } else if (response.status === "needs_input") {
        setChat((prev) => [
          ...prev,
          { kind: "question", id: resultId, message: response.message, missing: response.missing },
        ]);
      } else if (response.status === "wrong_formula") {
        const msg = response.suggestion
          ? `${response.message}\n\nSugestão: ${response.suggestion}`
          : response.message;
        setChat((prev) => [...prev, { kind: "error", id: resultId, message: msg }]);
        // Remove a fórmula incorreta para evitar loop
        setActiveFormula(null);
      } else if (response.status === "formula_error") {
        setChat((prev) => [...prev, { kind: "error", id: resultId, message: response.message }]);
      }

      // Persist to Supabase
      let sessId = currentSessionId;
      if (!sessId) {
        sessId = await createSession(text);
        if (sessId) {
          setCurrentSessionId(sessId);
          queryClient.invalidateQueries({ queryKey: ["sessions"] });
        }
      } else {
        touchSession(sessId);
      }

      if (sessId && response.status === "success") {
        await saveMessages(sessId, text, response.result);
        // Incrementa contador (user msg + result = 2)
        const newCount = messageCount + 2;
        setMessageCount(newCount);
        // Busca resumo atualizado (fire-and-forget — pode ter sido gerado pelo servidor)
        fetchSessionSummary(sessId).then((s) => {
          if (s) setSessionSummary(s);
        });
      }
    } catch (err: any) {
      const errId = msgId + "_e";
      setChat((prev) => [
        ...prev,
        {
          kind: "error",
          id: errId,
          message: err?.message ?? "Não foi possível processar o cálculo. Tente novamente.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [query, isLoading, session, activeFormula, currentSessionId, sessionSummary, messageCount, queryClient, chat, userName, setUserName]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSend = query.trim().length > 0 && !isLoading;
  const invertedData = [...chat].reverse();

  const renderItem = useCallback(
    ({ item, index }: { item: ChatItem; index: number }) => {
      const originalIndex = chat.length - 1 - index;
      if (item.kind === "user") return <UserBubble text={item.text} />;
      if (item.kind === "assistant") return <AssistantBubble text={item.text} />;
      if (item.kind === "question") return <QuestionBubble message={item.message} missing={item.missing} />;
      if (item.kind === "error") return <ErrorBubble message={item.message} />;
      if (item.kind === "result") {
        const isSavedByFormulaId = !!item.result.formulaId && savedFormulaIds.has(item.result.formulaId);
        const isSavedLocally = savedResultIds.has(item.id);
        const isSaved = isSavedByFormulaId || isSavedLocally;
        return (
          <ResultRow
            result={item.result}
            onView={() => {
              setViewingResult(item.result);
              setScreen("calc");
            }}
            isSaved={isSaved}
            onSave={() => {
              if (isSaved) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setSavedResultIds((prev) => new Set([...prev, item.id]));
              saveMutation.mutate(item.result);
            }}
          />
        );
      }
      return null;
    },
    [chat, savedResultIds, savedFormulaIds, saveMutation]
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* ── DISPLAY PANEL ── */}
      <View style={[styles.displayPanel, { paddingTop: topPad + 10 }]}>
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

        <View style={styles.numSection}>
          <View style={styles.numRow}>
            {hasResult && !!current.resultUnit && (
              <Text style={styles.numUnit}>{current.resultUnit}</Text>
            )}
            <Text
              style={[
                styles.numDisplay,
                { fontSize: numFontSize, color: hasResult ? c.text : c.ghost },
              ]}
            >
              {displayNum}
            </Text>
          </View>
          <View style={styles.numMeta}>
            <Text style={[styles.numLabel, { color: hasResult ? c.faint : c.ghost }]}>
              {hasResult ? current.resultLabel : "resultado"}
            </Text>
            <Pressable
              onPress={() => {
                if (hasResult) {
                  setViewingResult(current);
                  setScreen("calc");
                }
              }}
              disabled={!hasResult}
              style={({ pressed }) => [
                styles.verCalcBtn,
                hasResult ? styles.verCalcBtnActive : styles.verCalcBtnInactive,
                pressed && hasResult && { backgroundColor: c.surface },
              ]}
            >
              <Text style={styles.sigmaSmall}>σ</Text>
              <Text style={[styles.verCalcText, { color: hasResult ? c.mid : c.ghost }]}>
                ver cálculo
              </Text>
              {hasResult && <Feather name="chevron-right" size={11} color={c.mid} />}
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── FORMULA ROW ── */}
      <View style={styles.formulaRow}>
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={kbOffset}>
        <FlatList
          data={invertedData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          inverted
          contentContainerStyle={
            chat.length === 0 ? styles.chatContentEmpty : styles.chatContent
          }
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={isLoading ? <LoadingDots /> : null}
          ListEmptyComponent={
            <EmptyChat
              onSuggest={(text) => {
                setQuery(text);
                inputRef.current?.focus();
              }}
            />
          }
        />

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
              style={[
                styles.sendBtn,
                canSend ? styles.sendBtnActive : styles.sendBtnInactive,
              ]}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={c.ghost} />
              ) : (
                <Feather
                  name="arrow-up"
                  size={14}
                  color={canSend ? c.background : c.ghost}
                  strokeWidth={2.5}
                />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ── OVERLAYS ── */}
      {screen === "calc" && viewingResult && (
        <CalcOverlay data={viewingResult} onClose={() => setScreen("main")} />
      )}
      {screen === "history" && (
        <HistoryOverlay
          onClose={() => setScreen("main")}
          onSelect={() => setScreen("main")}
        />
      )}
      {screen === "formulas" && (
        <FormulasScreen
          onSelect={(f) => {
            setActiveFormula(f);
            setScreen("main");
          }}
          onClose={() => setScreen("main")}
        />
      )}
      {screen === "menu" && <MenuOverlay onClose={() => setScreen("main")} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  headerRight: { flexDirection: "row", gap: 4 },
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
  verCalcBtnActive: { backgroundColor: "#EFEFEC" },
  verCalcBtnInactive: { backgroundColor: "transparent", opacity: 0.4 },
  sigmaSmall: {
    fontSize: 12,
    color: "#6B6B66",
    fontFamily: "Inter_400Regular",
  },
  verCalcText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
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
  formulaRowNameActive: { color: "#1A1A18", fontFamily: "Inter_600SemiBold" },
  formulaRowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  alterBtn: { paddingVertical: 4 },
  alterBtnText: { fontSize: 11, color: "#AEADA8", fontFamily: "Inter_400Regular" },
  removeBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingVertical: 4 },
  removeBtnText: { fontSize: 11, color: "#AEADA8", fontFamily: "Inter_400Regular" },
  chatContent: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    gap: 10,
  },
  chatContentEmpty: { flex: 1 },
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
    fontSize: 13,
    color: "#CECDC8",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 20,
  },
  emptyChips: {
    width: "100%",
    gap: 8,
  },
  emptyChip: {
    backgroundColor: "#F0EFEB",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  emptyChipText: {
    fontSize: 12,
    color: "#6B6B66",
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  loadingDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#EFEFEC",
    marginTop: 2,
    flexShrink: 0,
  },
  loadingBubble: {
    backgroundColor: "#F0EFEB",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minWidth: 60,
    alignItems: "center",
  },
  assistantBubble: {
    backgroundColor: "#F0EFEB",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flex: 1,
    maxWidth: "88%",
  },
  assistantText: {
    fontSize: 14,
    color: "#3A3A36",
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  questionBubble: {
    backgroundColor: "#FBF8F0",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: "88%",
    gap: 8,
  },
  questionMessage: {
    fontSize: 13,
    color: "#5A5240",
    fontFamily: "Inter_500Medium",
    lineHeight: 20,
  },
  missingList: { gap: 6 },
  missingItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  missingContent: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
  },
  missingDot: {
    fontSize: 12,
    color: "#B09A60",
    fontFamily: "Inter_700Bold",
    lineHeight: 20,
    marginTop: 1,
  },
  missingSymbol: {
    fontSize: 11,
    color: "#908060",
    fontFamily: "Inter_400Regular",
  },
  missingName: {
    fontSize: 13,
    color: "#4A4030",
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
    flexShrink: 1,
  },
  missingDesc: {
    fontSize: 12,
    color: "#7A6A50",
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    flexShrink: 1,
  },
  errorBubble: {
    backgroundColor: "#FDF2F1",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: "88%",
  },
  errorTitle: {
    fontSize: 12,
    color: "#D93025",
    fontFamily: "Inter_600SemiBold",
  },
  errorText: {
    fontSize: 13,
    color: "#7A2020",
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  resultCard: {
    backgroundColor: "#F0EFEB",
    borderRadius: 16,
    overflow: "hidden",
  },
  resultCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
  },
  resultFormula: {
    fontSize: 11,
    color: "#6B6B66",
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  resultSubstituted: {
    fontSize: 12,
    color: "#9A9991",
    fontFamily: "Inter_400Regular",
  },
  resultRight: {
    alignItems: "flex-end",
    gap: 8,
    flexShrink: 0,
  },
  resultUnit: {
    fontSize: 11,
    color: "#9A9991",
    fontFamily: "Inter_500Medium",
  },
  resultNum: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#1A1A18",
    letterSpacing: -1,
    lineHeight: 30,
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#E8E7E2",
  },
  viewBtnText: {
    fontSize: 11,
    color: "#6B6B66",
    fontFamily: "Inter_600SemiBold",
  },
  saveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "#E8E7E2",
  },
  saveRowPressed: { backgroundColor: "#E8E7E2" },
  saveRowSaved: { opacity: 0.5 },
  saveText: {
    fontSize: 11,
    color: "#9A9991",
    fontFamily: "Inter_400Regular",
  },
  saveTextSaved: {
    color: "#1A1A18",
    fontFamily: "Inter_600SemiBold",
  },
  searchUsedTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 5,
    backgroundColor: "#E8E7E2",
  },
  searchUsedText: {
    fontSize: 9,
    color: "#6B6B66",
    fontFamily: "Inter_500Medium",
  },
  proofWarningTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 5,
    backgroundColor: "#FBF3E0",
  },
  proofWarningText: {
    fontSize: 9,
    color: "#B07D1A",
    fontFamily: "Inter_500Medium",
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 4,
  },
  warningText: {
    fontSize: 11,
    color: "#B07D1A",
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 16,
  },
  userBubbleWrap: {
    alignItems: "flex-end",
  },
  userBubble: {
    backgroundColor: "#1A1A18",
    borderRadius: 18,
    borderBottomRightRadius: 5,
    paddingVertical: 10,
    paddingHorizontal: 16,
    maxWidth: "80%",
  },
  userBubbleText: {
    fontSize: 14,
    color: "#F7F6F3",
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  inputWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#F0EFEB",
    borderRadius: 20,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: "#1A1A18",
    fontFamily: "Inter_400Regular",
    maxHeight: 120,
    paddingTop: 4,
    paddingBottom: 4,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sendBtnActive: { backgroundColor: "#1A1A18" },
  sendBtnInactive: { backgroundColor: "#DEDED9" },
});
