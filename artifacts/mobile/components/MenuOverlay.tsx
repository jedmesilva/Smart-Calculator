import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
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
};

export function MenuOverlay({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { user, userId, userName, signOut } = useAuth();
  const email = user?.email ?? "";
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(-280);
  const { data: carteira, isLoading: carteiraLoading } = useCarteira();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.ease) });
    translateX.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, []);

  const close = () => {
    opacity.value = withTiming(0, { duration: 180 });
    translateX.value = withTiming(-280, { duration: 220, easing: Easing.in(Easing.ease) }, (done) => {
      if (done) runOnJS(onClose)();
    });
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const drawerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  const displayName = userName ?? undefined;
  const initials = displayName
    ? displayName.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : (userId ?? "").slice(0, 2).toUpperCase();

  const handleSignOut = () => {
    Alert.alert(
      "Sair da conta",
      "Tem certeza que deseja sair?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sair",
          style: "destructive",
          onPress: async () => {
            close();
            setTimeout(() => signOut(), 300);
          },
        },
      ]
    );
  };

  const saldo = carteira?.saldo ?? null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View style={[styles.drawer, drawerStyle, { paddingTop: topPad, paddingBottom: botPad }]}>
        {/* Header */}
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerLogo}>Phormula</Text>
          <Pressable onPress={close} style={styles.closeBtn} hitSlop={12}>
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

        {/* Plan / Credits Card */}
        <View style={styles.creditsCard}>
          <View style={styles.planRow}>
            <Text style={styles.planBadge}>Gratuito</Text>
          </View>
          <View style={styles.creditsAmountRow}>
            {carteiraLoading ? (
              <ActivityIndicator size="small" color={c.faint} />
            ) : (
              <>
                <Text style={styles.creditsAmount}>
                  {saldo !== null ? saldo.toLocaleString("pt-BR") : "—"}
                </Text>
                <Text style={styles.creditsAmountLabel}> créditos disponíveis</Text>
              </>
            )}
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Menu Items */}
        <View style={styles.menuItems}>
          <MenuItem icon="clock" label="Histórico" onPress={close} />
          <MenuItem icon="book-open" label="Fórmulas" onPress={close} />
          <MenuItem icon="star" label="Favoritas" onPress={close} />
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
  creditsCard: {
    backgroundColor: c.panel,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    gap: 5,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  planBadge: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: c.faint,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  creditsAmountRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  creditsAmount: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -0.8,
  },
  creditsAmountLabel: {
    fontSize: 12,
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
    paddingHorizontal: 12,
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
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  signOutText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#ef4444",
  },
});
