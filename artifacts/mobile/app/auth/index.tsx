import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import colors from "@/constants/colors";

const c = colors.light;

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const topPad = insets.top;
  const botPad = insets.bottom;

  return (
    <View style={[styles.root, { paddingTop: topPad, paddingBottom: botPad + 24 }]}>
      <View style={styles.brand}>
        <Image
          source={require("@/assets/images/logo-name-symbol.png")}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text style={styles.tagline}>CALCULADORA INTELIGENTE</Text>
      </View>

      <View style={styles.middle}>
        <Text style={styles.headline}>
          Calcule qualquer coisa.{"\n"}Entenda cada passo.
        </Text>
        <Text style={styles.sub}>
          Descreva o que quer calcular e receba o resultado
          completo: fórmula, variáveis e passo a passo.
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => router.push("/auth/login")}
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.82 }]}
        >
          <Text style={styles.primaryBtnText}>Entrar</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/auth/signup")}
          style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.secondaryBtnText}>Criar conta</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: c.background,
    paddingHorizontal: 28,
    justifyContent: "space-between",
  },
  brand: {
    alignItems: "center",
    paddingTop: 32,
    gap: 8,
  },
  logoImage: {
    width: 180,
    height: 180,
  },
  tagline: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: c.faint,
    letterSpacing: 2.5,
    marginTop: 2,
  },
  middle: {
    gap: 14,
  },
  headline: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -1,
    lineHeight: 38,
  },
  sub: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: c.mid,
    lineHeight: 23,
  },
  actions: {
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: c.text,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.background,
    letterSpacing: -0.2,
  },
  secondaryBtn: {
    backgroundColor: c.panel,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
  },
  secondaryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
    letterSpacing: -0.2,
  },
});
