import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCarteira } from "@/lib/queries";
import colors from "@/constants/colors";

const c = colors.light;

type Props = {
  onClose: () => void;
  onCalculations?: () => void;
  onHistory?: () => void;
  onPlan?: () => void;
  onUpgrade?: () => void;
};

export function MenuOverlay({ onClose, onCalculations, onHistory, onPlan, onUpgrade }: Props) {
  const insets = useSafeAreaInsets();
  const { user, userId, userName, signOut } = useAuth();
  const email = user?.email ?? "";
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(-280);
  const { data: carteira, isLoading: carteiraLoading } = useCarteira();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const topPad = insets.top;
  const botPad = insets.bottom;

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.ease) });
    translateX.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, []);

  const close = (afterClose?: () => void) => {
    const finish = () => {
      onClose();
      afterClose?.();
    };
    opacity.value = withTiming(0, { duration: 180 });
    translateX.value = withTiming(-280, { duration: 220, easing: Easing.in(Easing.ease) }, (done) => {
      if (done) runOnJS(finish)();
    });
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const drawerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  const displayName = userName ?? undefined;
  const initials = displayName
    ? displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : email
    ? email.split("@")[0].slice(0, 2).toUpperCase()
    : "?";

  const handleSignOut = () => {
    setShowSignOutConfirm(true);
  };

  const confirmSignOut = async () => {
    setShowSignOutConfirm(false);
    close();
    setTimeout(() => signOut(), 300);
  };

  const saldo = carteira?.saldo ?? null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View style={[styles.drawer, drawerStyle, { paddingTop: topPad, paddingBottom: botPad }]}>
        {/* Header */}
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerLogo}>Phormula</Text>
          <Pressable onPress={() => close()} style={styles.closeBtn} hitSlop={12}>
            <Feather name="x" size={18} color={c.faint} />
          </Pressable>
        </View>

        {/* User Card */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitials}>{initials}</Text>
          </View>
          <View style={styles.userInfo}>
            {displayName ? (
              <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
            ) : null}
            <Text style={styles.userEmail} numberOfLines={1}>{email}</Text>
          </View>
        </View>

        {/* Plan Card */}
        <Pressable
          style={({ pressed }) => [styles.planCard, pressed && { opacity: 0.85 }]}
          onPress={() => close(onPlan)}
        >
          <View style={styles.planCardTop}>
            <Text style={styles.planCardLabel}>GRATUITO</Text>
            <Pressable
              style={({ pressed }) => [styles.upgradeBtn, pressed && { opacity: 0.8 }]}
              onPress={(e) => { e.stopPropagation(); close(onUpgrade); }}
              hitSlop={8}
            >
              <Text style={styles.upgradeBtnText}>Upgrade</Text>
              <Feather name="chevron-right" size={12} color={c.background} />
            </Pressable>
          </View>
          <View style={styles.planCardBottom}>
            {carteiraLoading ? (
              <ActivityIndicator size={14} color={c.ghost} />
            ) : (
              <Text style={styles.planCardCredits}>
                <Text style={styles.planCardCreditsNum}>
                  {saldo !== null ? saldo.toLocaleString("pt-BR") : "—"}
                </Text>
                {"  "}
                <Text style={styles.planCardCreditsSuffix}>créditos disponíveis</Text>
              </Text>
            )}
          </View>
        </Pressable>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Menu Items */}
        <View style={styles.menuItems}>
          <MenuItem
            icon="hash"
            label="Cálculos"
            onPress={() => close(onCalculations)}
          />
          <MenuItem
            icon="clock"
            label="Histórico"
            onPress={() => close(onHistory)}
          />
        </View>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Divider */}
        <View style={styles.divider} />

        {/* Sign Out */}
        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}
        >
          <Feather name="log-out" size={15} color="#ef4444" />
          <Text style={styles.signOutText}>Sair da conta</Text>
        </Pressable>
      </Animated.View>

      {/* Sign Out Confirm Dialog */}
      <Modal
        visible={showSignOutConfirm}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowSignOutConfirm(false)}
      >
        <View style={styles.dialogBackdrop}>
          <View style={styles.dialogCard}>
            <View style={styles.dialogIconWrap}>
              <Feather name="log-out" size={20} color="#ef4444" />
            </View>
            <Text style={styles.dialogTitle}>Sair da conta</Text>
            <Text style={styles.dialogMessage}>
              Tem certeza que deseja encerrar sua sessão?
            </Text>
            <View style={styles.dialogActions}>
              <Pressable
                style={({ pressed }) => [styles.dialogBtnCancel, pressed && { opacity: 0.7 }]}
                onPress={() => setShowSignOutConfirm(false)}
              >
                <Text style={styles.dialogBtnCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.dialogBtnConfirm, pressed && { opacity: 0.8 }]}
                onPress={confirmSignOut}
              >
                <Text style={styles.dialogBtnConfirmText}>Sair</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: c.surface }]}
    >
      <Feather name={icon} size={15} color={c.mid} />
      <Text style={styles.menuItemText}>{label}</Text>
      <Feather name="chevron-right" size={13} color={c.ghost} style={{ marginLeft: "auto" }} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  drawer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 280,
    backgroundColor: c.background,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 16,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
    paddingTop: 8,
  },
  drawerLogo: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: c.panel,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.text,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarInitials: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: c.background,
    letterSpacing: -0.3,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  userName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
    letterSpacing: -0.2,
  },
  userEmail: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.faint,
  },
  planCard: {
    backgroundColor: c.panel,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    marginBottom: 10,
    gap: 10,
  },
  planCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  planCardLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: c.faint,
    letterSpacing: 0.8,
  },
  upgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: c.text,
    borderRadius: 20,
    paddingVertical: 7,
    paddingLeft: 13,
    paddingRight: 10,
  },
  upgradeBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: c.background,
    letterSpacing: -0.1,
  },
  planCardBottom: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  planCardCredits: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  planCardCreditsNum: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -0.5,
  },
  planCardCreditsSuffix: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.faint,
  },
  divider: {
    height: 1,
    backgroundColor: c.surface,
    marginVertical: 12,
  },
  menuItems: {
    gap: 2,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderRadius: 12,
  },
  menuItemText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: c.mid,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    marginBottom: 8,
  },
  signOutText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#ef4444",
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  dialogCard: {
    backgroundColor: c.background,
    borderRadius: 24,
    padding: 28,
    width: "100%",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 20,
  },
  dialogIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  dialogTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  dialogMessage: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.faint,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  dialogActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginTop: 4,
  },
  dialogBtnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: c.panel,
    alignItems: "center",
  },
  dialogBtnCancelText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.mid,
  },
  dialogBtnConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#ef4444",
    alignItems: "center",
  },
  dialogBtnConfirmText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
