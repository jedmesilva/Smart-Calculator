import React, { useRef, useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  Modal,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import colors from "@/constants/colors";
import type { ResultData } from "@/lib/apiClient";

const c = colors.light;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const SHEET_HEIGHT = Math.round(SCREEN_HEIGHT * 0.64);

/* ─── BASE BOTTOM SHEET ─── */
function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 68,
          friction: 11,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SHEET_HEIGHT,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 170,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  }, [onClose, slideAnim, backdropAnim]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "rgba(0,0,0,0.22)", opacity: backdropAnim },
          ]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

        <Animated.View
          style={[
            styles.sheet,
            {
              height: SHEET_HEIGHT,
              paddingBottom: (Platform.OS === "web" ? 0 : insets.bottom) + 16,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={handleClose} hitSlop={12} style={styles.sheetCloseBtn}>
              <Feather name="x" size={17} color={c.faint} />
            </Pressable>
          </View>

          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ─── SESSION CALCS SHEET ─── */
export function SessionCalcsSheet({
  visible,
  onClose,
  results,
  onView,
}: {
  visible: boolean;
  onClose: () => void;
  results: ResultData[];
  onView: (r: ResultData) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Cálculos da sessão">
      {results.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>Φ</Text>
          <Text style={styles.emptyTitle}>Nenhum cálculo ainda</Text>
          <Text style={styles.emptySubtitle}>
            Os cálculos feitos nesta sessão aparecerão aqui
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.calcsList}
          showsVerticalScrollIndicator={false}
        >
          {[...results].reverse().map((r, i) => {
            const titulo = r.meta?.titulo ?? "Cálculo";
            const subcategoria = r.meta?.subcategoria ?? "";
            const valor = r.resultado?.valor ?? "";
            const unidade = r.resultado?.unidade ?? "";
            const abstrata = r.formula?.abstrata ?? "";
            return (
              <Pressable
                key={i}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onView(r);
                }}
                style={({ pressed }) => [styles.calcItem, pressed && styles.calcItemPressed]}
              >
                <View style={styles.calcItemLeft}>
                  <Text style={styles.calcItemTitle} numberOfLines={1}>
                    {titulo}
                  </Text>
                  {!!subcategoria && (
                    <Text style={styles.calcItemSub} numberOfLines={1}>
                      {subcategoria}
                    </Text>
                  )}
                  {!!abstrata && (
                    <Text style={styles.calcItemFormula} numberOfLines={1}>
                      {abstrata}
                    </Text>
                  )}
                </View>
                <View style={styles.calcItemRight}>
                  {!!unidade && (
                    <Text style={styles.calcItemUnit}>{unidade}</Text>
                  )}
                  <Text style={styles.calcItemVal} numberOfLines={1}>
                    {valor}
                  </Text>
                  <Feather name="chevron-right" size={13} color={c.ghost} />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

/* ─── SESSION NOTES SHEET ─── */
export function SessionNotesSheet({
  visible,
  onClose,
  note,
  onChangeNote,
}: {
  visible: boolean;
  onClose: () => void;
  note: string;
  onChangeNote: (text: string) => void;
}) {
  const charCount = note.length;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Notas">
      <View style={styles.notesBody}>
        <TextInput
          value={note}
          onChangeText={onChangeNote}
          placeholder="Escreva anotações sobre essa sessão…"
          placeholderTextColor={c.ghost}
          multiline
          style={styles.notesInput}
          textAlignVertical="top"
          autoFocus
        />
        <View style={styles.notesFooter}>
          <Text style={styles.charCount}>{charCount > 0 ? `${charCount} caracteres` : ""}</Text>
          {note.trim().length > 0 && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onChangeNote("");
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.6 }]}
            >
              <Feather name="trash-2" size={13} color={c.ghost} />
              <Text style={styles.clearBtnText}>limpar</Text>
            </Pressable>
          )}
        </View>
      </View>
    </BottomSheet>
  );
}

/* ─── QUICK ACTIONS BAR ─── */
type QuickAction = {
  id: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
};

export function QuickActionsBar({ actions }: { actions: QuickAction[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.barContent}
      style={styles.bar}
    >
      {actions.map((action) => (
        <Pressable
          key={action.id}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            action.onPress();
          }}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
        >
          <View style={styles.actionIconWrap}>
            <Feather name={action.icon} size={18} color={c.mid} />
          </View>
          <Text style={styles.actionLabel} numberOfLines={1}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const BTN_SIZE = 52;

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: c.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.ghost,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  sheetTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
    letterSpacing: -0.2,
  },
  sheetCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 6,
    paddingBottom: 40,
  },
  emptyIcon: {
    fontSize: 32,
    color: c.ghost,
    fontFamily: "Inter_400Regular",
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: c.faint,
    letterSpacing: -0.1,
  },
  emptySubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.ghost,
    textAlign: "center",
    lineHeight: 18,
  },
  calcsList: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 4,
  },
  calcItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  calcItemPressed: {
    backgroundColor: c.surface,
  },
  calcItemLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  calcItemTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
    letterSpacing: -0.1,
  },
  calcItemSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.mid,
  },
  calcItemFormula: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.ghost,
  },
  calcItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  calcItemUnit: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: c.ghost,
  },
  calcItemVal: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -0.8,
  },
  notesBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 10,
  },
  notesInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.text,
    lineHeight: 22,
  },
  notesFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  charCount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.ghost,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  clearBtnText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.ghost,
  },
  bar: {
    flexShrink: 0,
  },
  barContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  actionBtn: {
    alignItems: "center",
    gap: 5,
  },
  actionBtnPressed: {
    opacity: 0.6,
  },
  actionIconWrap: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: 14,
    backgroundColor: c.card,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: c.mid,
    letterSpacing: 0.1,
  },
});
