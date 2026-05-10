import React, { useState, useRef, useCallback, useEffect } from "react";
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
  Dimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import colors from "@/constants/colors";
import { CalcOverlay, HistoryOverlay, CalculationsScreen, PlansScreen, PlanManagementScreen } from "@/components/Overlays";
import { CalcSummaryCard } from "@/components/CalcSummaryCard";
import { QuickActionsBar, SessionCalcsSheet } from "@/components/QuickActionSheets";
import type { SessionCalcsSheetHandle } from "@/components/QuickActionSheets";
import { MenuOverlay } from "@/components/MenuOverlay";
import { useAuth } from "@/contexts/AuthContext";
import { calculateStream, type ResultData, type MissingVariable } from "@/lib/apiClient";
import { buildContext } from "@/lib/contextBuilder";
import { createSession, saveMessages, touchSession, fetchSessionSummary } from "@/lib/queries";

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
function ResultRow({ result, onView }: { result: ResultData; onView: () => void }) {
  return <CalcSummaryCard result={result} onPress={onView} variant="chat" />;
}

/* ─── THINKING BAR ─── */
function ThinkingBar({ message }: { message: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [displayed, setDisplayed] = useState(message);

  useEffect(() => {
    Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setDisplayed(message);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }, [message]); // eslint-disable-line react-hooks/exhaustive-deps

  const dotAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(dotAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [dotAnim]);

  return (
    <View style={styles.thinkingBar}>
      <Animated.View
        style={[
          styles.thinkingDot,
          { opacity: dotAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
        ]}
      />
      <Animated.Text style={[styles.thinkingText, { opacity }]} numberOfLines={1}>
        {displayed}
      </Animated.Text>
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
export default function PhormulаScreen() {
  const insets = useSafeAreaInsets();
  const sheetBottomInset = Math.max(
    insets.bottom,
    Dimensions.get("screen").height - Dimensions.get("window").height
  );
  const { userId, userName, setUserName } = useAuth();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [screen, setScreen] = useState<"main" | "calc" | "history" | "menu" | "calculations" | "plans" | "plan-management">("main");
  const [isLoading, setIsLoading] = useState(false);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<string | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [viewingResult, setViewingResult] = useState<ResultData | null>(null);
  const [calcOrigin, setCalcOrigin] = useState<"main" | "calculations">("main");
  const [thinkingMessage, setThinkingMessage] = useState<string | null>(null);
  const sessionCalcsRef = useRef<SessionCalcsSheetHandle>(null);
  const inputRef = useRef<TextInput>(null);

  const lastResult = [...chat].reverse().find((x) => x.kind === "result");
  const current = lastResult?.kind === "result" ? lastResult.result : null;
  const hasResult = !!current;
  const displayNum = current?.resultado?.valor ?? "0";
  const numFontSize = displayNum.length > 12 ? 38 : displayNum.length > 8 ? 50 : 64;

  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const botPad = Platform.OS === "web" ? 0 : insets.bottom;
  const kbOffset = Platform.OS === "ios" ? 0 : 0;

  const handleNewSession = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setChat([]);
    setQuery("");
    setCurrentSessionId(null);
    setSessionSummary(null);
    setMessageCount(0);
    setScreen("main");
  }, []);

  const handleSend = useCallback(async () => {
    if (!query.trim() || isLoading) return;
    const text = query.trim();
    setQuery("");
    if (Platform.OS === "web") {
      const el = document.getElementById("phormula-chat-input") as HTMLTextAreaElement | null;
      if (el) el.style.height = "auto";
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const msgId = Date.now().toString() + Math.random().toString(36).slice(2, 6);

    const contextSnapshot = chat;
    setChat((prev) => [...prev, { kind: "user", id: msgId, text }]);
    setIsLoading(true);

    const context = buildContext(contextSnapshot);

    try {
      const response = await calculateStream(
        {
          query: text,
          context,
          sessionId: currentSessionId ?? undefined,
          sessionSummary: sessionSummary ?? undefined,
          messageCount,
          userName: userName ?? undefined,
        },
        (msg) => setThinkingMessage(msg),
      );

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
      // Realtime (Supabase) atualiza o saldo automaticamente via subscription
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
      setThinkingMessage(null);
    }
  }, [query, isLoading, currentSessionId, sessionSummary, messageCount, queryClient, chat, userName, setUserName]); // eslint-disable-line react-hooks/exhaustive-deps

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
        return (
          <ResultRow
            result={item.result}
            onView={() => {
              setViewingResult(item.result);
              setCalcOrigin("main");
              setScreen("calc");
            }}
          />
        );
      }
      return null;
    },
    [chat]
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
            <Text style={styles.logo}>Phormula</Text>
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
            {hasResult && !!current.resultado?.unidade && (
              <Text style={styles.numUnit}>{current.resultado.unidade}</Text>
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
              {hasResult ? (current.meta?.subcategoria || current.meta?.titulo || "resultado") : "resultado"}
            </Text>
            <Pressable
              onPress={() => {
                if (hasResult) {
                  setViewingResult(current);
                  setCalcOrigin("main");
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
              <Text style={styles.sigmaSmall}>Φ</Text>
              <Text style={[styles.verCalcText, { color: hasResult ? c.mid : c.ghost }]}>
                ver cálculo
              </Text>
              {hasResult && <Feather name="chevron-right" size={11} color={c.mid} />}
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── QUICK ACTIONS ── */}
      <QuickActionsBar
        actions={[
          {
            id: "calcs",
            icon: "hash",
            label: "Cálculos",
            onPress: () => sessionCalcsRef.current?.open(),
          },
        ]}
      />

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
          ListHeaderComponent={
            isLoading && thinkingMessage
              ? <ThinkingBar message={thinkingMessage} />
              : isLoading
              ? <ThinkingBar message="Processando…" />
              : null
          }
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
              onChangeText={(text) => {
                setQuery(text);
                if (Platform.OS === "web") {
                  const el = document.getElementById("phormula-chat-input") as HTMLTextAreaElement | null;
                  if (el) {
                    el.style.height = "auto";
                    el.style.height = Math.min(el.scrollHeight, 120) + "px";
                  }
                }
              }}
              nativeID={Platform.OS === "web" ? "phormula-chat-input" : undefined}
              placeholder="Descreva o cálculo…"
              placeholderTextColor={c.ghost}
              multiline
              style={styles.textInput}
              returnKeyType={Platform.OS === "web" ? "default" : "send"}
              onSubmitEditing={Platform.OS !== "web" ? handleSend : undefined}
              blurOnSubmit={false}
              onKeyPress={Platform.OS === "web" ? (e: any) => {
                if (e.nativeEvent.key === "Enter" && (e.nativeEvent.ctrlKey || e.nativeEvent.metaKey)) {
                  e.preventDefault?.();
                  handleSend();
                }
              } : undefined}
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
        <CalcOverlay data={viewingResult} onClose={() => setScreen(calcOrigin)} />
      )}
      {screen === "history" && (
        <HistoryOverlay
          onClose={() => setScreen("main")}
          onSelect={() => setScreen("main")}
        />
      )}
      {screen === "calculations" && (
        <CalculationsScreen
          onClose={() => setScreen("main")}
          onView={(result) => {
            setViewingResult(result);
            setCalcOrigin("calculations");
            setScreen("calc");
          }}
        />
      )}
      {screen === "plan-management" && (
        <PlanManagementScreen
          onClose={() => setScreen("main")}
          onViewPlans={() => setScreen("plans")}
        />
      )}
      {screen === "plans" && (
        <PlansScreen onClose={() => setScreen("plan-management")} />
      )}
      {screen === "menu" && (
        <MenuOverlay
          onClose={() => setScreen("main")}
          onCalculations={() => setScreen("calculations")}
          onHistory={() => setScreen("history")}
          onPlan={() => setScreen("plan-management")}
          onUpgrade={() => setScreen("plans")}
        />
      )}
      {/* ── BOTTOM SHEETS ── */}
      <SessionCalcsSheet
        ref={sessionCalcsRef}
        bottomInset={sheetBottomInset}
        results={chat.filter((x) => x.kind === "result").map((x) => (x as any).result as ResultData)}
        onView={(result) => {
          sessionCalcsRef.current?.close();
          setViewingResult(result);
          setCalcOrigin("main");
          setScreen("calc");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  displayPanel: {
    flexShrink: 0,
    paddingHorizontal: 20,
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
  chatContent: {
    paddingHorizontal: 16,
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
    paddingTop: 100,
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
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 4,
  },
  thinkingBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    marginBottom: 4,
  },
  thinkingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.faint,
    flexShrink: 0,
  },
  thinkingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: c.faint,
    flex: 1,
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
    minHeight: 32,
    maxHeight: 120,
    paddingTop: Platform.OS === "web" ? 6 : 0,
    paddingBottom: Platform.OS === "web" ? 6 : 0,
    textAlignVertical: Platform.OS === "web" ? "auto" : "center",
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
