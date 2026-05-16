import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useGuest } from "@/contexts/GuestContext";
import colors from "@/constants/colors";

const c = colors.light;

export function AuthBottomSheet() {
  const { showAuthSheet, setShowAuthSheet, guestCredits } = useGuest();
  const router = useRouter();
  const sheetRef = useRef<BottomSheet>(null);

  const snapPoints = ["42%"];

  const handleClose = useCallback(() => {
    setShowAuthSheet(false);
    sheetRef.current?.close();
  }, [setShowAuthSheet]);

  const handleLogin = useCallback(() => {
    handleClose();
    router.push("/auth/login" as any);
  }, [handleClose, router]);

  const handleSignup = useCallback(() => {
    handleClose();
    router.push("/auth/signup" as any);
  }, [handleClose, router]);

  const handleEmailSignup = useCallback(() => {
    handleClose();
    router.push("/auth/signup" as any);
  }, [handleClose, router]);

  if (!showAuthSheet) return null;

  const outOfCredits = guestCredits <= 0;

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={handleClose}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {outOfCredits ? "Créditos esgotados" : "Continue sem limites"}
          </Text>
          <Text style={styles.subtitle}>
            {outOfCredits
              ? "Seus créditos de visitante acabaram. Crie uma conta gratuita e ganhe créditos diários para continuar calculando."
              : "Crie uma conta gratuita e ganhe créditos diários para calcular à vontade."}
          </Text>
        </View>

        <Pressable
          onPress={handleLogin}
          style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.loginBtnText}>Entrar</Text>
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Ou criar conta com</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          onPress={handleEmailSignup}
          style={({ pressed }) => [styles.optionBtn, pressed && { opacity: 0.7 }]}
        >
          <Feather name="mail" size={16} color={c.text} />
          <Text style={styles.optionBtnText}>E-mail</Text>
        </Pressable>

        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.skipText}>Agora não</Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: "#FAFAF8",
    borderRadius: 24,
  },
  handle: {
    backgroundColor: c.ghost,
    width: 36,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 12,
  },
  header: {
    gap: 6,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.mid,
    lineHeight: 21,
  },
  loginBtn: {
    backgroundColor: c.text,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  loginBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.background,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: c.border,
  },
  dividerText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.ghost,
  },
  optionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: c.card,
    borderRadius: 14,
    paddingVertical: 13,
  },
  optionBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: c.text,
  },
  skipBtn: {
    alignItems: "center",
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.ghost,
  },
});
