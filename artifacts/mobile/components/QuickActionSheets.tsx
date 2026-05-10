import React, { useMemo, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import colors from "@/constants/colors";
import type { ResultData } from "@/lib/apiClient";
import { CalcSummaryCard } from "@/components/CalcSummaryCard";

const c = colors.light;

/* ─── SHARED BACKDROP ─── */
function Backdrop(props: BottomSheetBackdropProps) {
  return (
    <BottomSheetBackdrop
      {...props}
      disappearsOnIndex={-1}
      appearsOnIndex={0}
      opacity={0.22}
    />
  );
}

/* ─── SESSION CALCS SHEET ─── */
export interface SessionCalcsSheetHandle {
  open(): void;
  close(): void;
}

export const SessionCalcsSheet = forwardRef<
  SessionCalcsSheetHandle,
  {
    onClose?: () => void;
    results: ResultData[];
    onView: (r: ResultData) => void;
    bottomInset?: number;
  }
>(function SessionCalcsSheet({ onClose, results, onView, bottomInset = 0 }, ref) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["64%"], []);

  useImperativeHandle(ref, () => ({
    open: () => sheetRef.current?.present(),
    close: () => sheetRef.current?.dismiss(),
  }));

  /* onDismiss fires AFTER the modal is already gone — only notify parent, never dismiss again */
  const handleDismiss = useCallback(() => {
    onClose?.();
  }, [onClose]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      onDismiss={handleDismiss}
      backdropComponent={Backdrop}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.handle}
      enablePanDownToClose
    >
      <BottomSheetView style={{ flex: 1 }}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Cálculos da sessão</Text>
          {/* dismiss directly on the internal ref — never through the forwarded handle */}
          <Pressable
            onPress={() => sheetRef.current?.dismiss()}
            hitSlop={12}
            style={styles.sheetCloseBtn}
          >
            <Feather name="x" size={17} color={c.faint} />
          </Pressable>
        </View>

        {results.length === 0 ? (
          <View style={[styles.emptyState, { paddingBottom: bottomInset + 24 }]}>
            <Text style={styles.emptyIcon}>Φ</Text>
            <Text style={styles.emptyTitle}>Nenhum cálculo ainda</Text>
            <Text style={styles.emptySubtitle}>
              Os cálculos feitos nesta sessão aparecerão aqui
            </Text>
          </View>
        ) : (
          <BottomSheetScrollView
            contentContainerStyle={[styles.calcsList, { paddingBottom: bottomInset + 16 }]}
            showsVerticalScrollIndicator={false}
          >
            {[...results].reverse().map((r, i) => (
              <View key={i}>
                <CalcSummaryCard
                  result={r}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onView(r);
                  }}
                  variant="list"
                />
                {i < results.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </BottomSheetScrollView>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

/* ─── SESSION NOTES SHEET ─── */
export interface SessionNotesSheetHandle {
  open(): void;
  close(): void;
}

export const SessionNotesSheet = forwardRef<
  SessionNotesSheetHandle,
  {
    onClose?: () => void;
    note: string;
    onChangeNote: (text: string) => void;
  }
>(function SessionNotesSheet({ onClose, note, onChangeNote }, ref) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["50%"], []);

  useImperativeHandle(ref, () => ({
    open: () => sheetRef.current?.present(),
    close: () => sheetRef.current?.dismiss(),
  }));

  /* onDismiss fires AFTER the modal is already gone — only notify parent, never dismiss again */
  const handleDismiss = useCallback(() => {
    onClose?.();
  }, [onClose]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      onDismiss={handleDismiss}
      backdropComponent={Backdrop}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.handle}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetView style={[styles.notesBody, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Notas</Text>
          {/* dismiss directly on the internal ref — never through the forwarded handle */}
          <Pressable
            onPress={() => sheetRef.current?.dismiss()}
            hitSlop={12}
            style={styles.sheetCloseBtn}
          >
            <Feather name="x" size={17} color={c.faint} />
          </Pressable>
        </View>
        <TextInput
          value={note}
          onChangeText={onChangeNote}
          placeholder="Escreva anotações sobre essa sessão…"
          placeholderTextColor={c.ghost}
          multiline
          style={styles.notesInput}
          textAlignVertical="top"
        />
        <View style={styles.notesFooter}>
          <Text style={styles.charCount}>{note.length > 0 ? `${note.length} caracteres` : ""}</Text>
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
      </BottomSheetView>
    </BottomSheetModal>
  );
});

/* ─── QUICK ACTIONS BAR ─── */
type QuickAction = {
  id: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
};

const BTN_SIZE = 52;

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

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: c.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handle: {
    backgroundColor: c.ghost,
    width: 36,
    height: 4,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 14,
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
    paddingHorizontal: 0,
  },
  divider: {
    height: 1,
    backgroundColor: c.border,
    marginHorizontal: 24,
  },
  notesBody: {
    flex: 1,
    paddingTop: 16,
    gap: 10,
  },
  notesInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.text,
    lineHeight: 22,
    paddingHorizontal: 24,
  },
  notesFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  charCount: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.ghost,
  },
  clearBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  clearBtnText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.ghost,
  },
  bar: {
    flexShrink: 0,
    flexGrow: 0,
  },
  barContent: {
    paddingHorizontal: 24,
    paddingVertical: 4,
    gap: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  actionBtn: { alignItems: "center", gap: 5 },
  actionBtnPressed: { opacity: 0.6 },
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
