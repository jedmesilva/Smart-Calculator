import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import colors from "@/constants/colors";

const c = colors.light;

function translateError(msg: string): string {
  if (msg.includes("User already registered") || msg.includes("already been registered")) return "Este e-mail já está cadastrado.";
  if (msg.includes("Password should be at least")) return "A senha deve ter pelo menos 6 caracteres.";
  if (msg.includes("invalid format") || msg.includes("valid email")) return "Formato de e-mail inválido.";
  if (msg.includes("rate limit") || msg.includes("too many")) return "Muitas tentativas. Aguarde alguns minutos.";
  if (msg.includes("network") || msg.includes("fetch")) return "Erro de conexão. Verifique sua internet.";
  return msg;
}

function getPasswordStrength(password: string): 0 | 1 | 2 | 3 {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password) || /[0-9]/.test(password) || /[^a-zA-Z0-9]/.test(password)) score++;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
}

const strengthLabel = ["", "Fraca", "Média", "Forte"];
const strengthColor = ["", "#ef4444", "#f59e0b", "#16a34a"];

type FocusKey = "name" | "email" | "password" | "confirm" | null;

function FieldLabel({ text }: { text: string }) {
  return <Text style={fieldStyles.label}>{text}</Text>;
}

const fieldStyles = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: c.faint,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.panel,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  inputFocused: {
    borderColor: c.text,
  },
  inputError: {
    borderColor: c.destructive,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: c.text,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  errorText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.destructive,
    flex: 1,
  },
});

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<FocusKey>(null);
  const [error, setError] = useState<string | null>(null);

  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const topPad = insets.top;
  const botPad = insets.bottom;

  const strength = getPasswordStrength(password);

  function validateFields(): boolean {
    let valid = true;
    setNameError(null);
    setEmailError(null);
    setPasswordError(null);
    setConfirmError(null);

    if (!name.trim()) {
      setNameError("Informe seu nome.");
      valid = false;
    }

    if (!email.trim()) {
      setEmailError("Informe seu e-mail.");
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError("Formato de e-mail inválido.");
      valid = false;
    }

    if (!password) {
      setPasswordError("Escolha uma senha.");
      valid = false;
    } else if (password.length < 6) {
      setPasswordError("A senha deve ter pelo menos 6 caracteres.");
      valid = false;
    }

    if (!confirm) {
      setConfirmError("Confirme sua senha.");
      valid = false;
    } else if (confirm !== password) {
      setConfirmError("As senhas não coincidem.");
      valid = false;
    }

    return valid;
  }

  async function handleSignup() {
    if (!validateFields()) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    });

    if (error) setError(translateError(error.message));
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPad + 8, paddingBottom: botPad + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={10}
        >
          <Feather name="arrow-left" size={20} color={c.text} />
        </Pressable>

        <View style={styles.header}>
          <Image
            source={require("@/assets/images/logo-symbol.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.title}>Criar sua conta</Text>
          <Text style={styles.subtitle}>
            Preencha os campos abaixo para começar a usar o Phormula.
          </Text>
        </View>

        <View style={styles.form}>
          {/* Nome */}
          <View style={fieldStyles.wrap}>
            <FieldLabel text="Nome" />
            <View
              style={[
                fieldStyles.inputContainer,
                focused === "name" && fieldStyles.inputFocused,
                !!nameError && fieldStyles.inputError,
              ]}
            >
              <TextInput
                value={name}
                onChangeText={(t) => { setName(t); setNameError(null); }}
                placeholder="Seu nome"
                placeholderTextColor={c.ghost}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                onFocus={() => setFocused("name")}
                onBlur={() => setFocused(null)}
                style={fieldStyles.input}
              />
            </View>
            {!!nameError && (
              <View style={fieldStyles.errorRow}>
                <Feather name="alert-circle" size={11} color={c.destructive} />
                <Text style={fieldStyles.errorText}>{nameError}</Text>
              </View>
            )}
          </View>

          {/* E-mail */}
          <View style={fieldStyles.wrap}>
            <FieldLabel text="E-mail" />
            <View
              style={[
                fieldStyles.inputContainer,
                focused === "email" && fieldStyles.inputFocused,
                !!emailError && fieldStyles.inputError,
              ]}
            >
              <TextInput
                ref={emailRef}
                value={email}
                onChangeText={(t) => { setEmail(t); setEmailError(null); setError(null); }}
                placeholder="voce@email.com"
                placeholderTextColor={c.ghost}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
                style={fieldStyles.input}
              />
            </View>
            {!!emailError && (
              <View style={fieldStyles.errorRow}>
                <Feather name="alert-circle" size={11} color={c.destructive} />
                <Text style={fieldStyles.errorText}>{emailError}</Text>
              </View>
            )}
          </View>

          {/* Senha */}
          <View style={fieldStyles.wrap}>
            <FieldLabel text="Senha" />
            <View
              style={[
                fieldStyles.inputContainer,
                focused === "password" && fieldStyles.inputFocused,
                !!passwordError && fieldStyles.inputError,
              ]}
            >
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={(t) => { setPassword(t); setPasswordError(null); }}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={c.ghost}
                secureTextEntry={!showPass}
                autoCapitalize="none"
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
                style={[fieldStyles.input, { paddingRight: 52 }]}
              />
              <Pressable
                onPress={() => setShowPass((v) => !v)}
                style={styles.eyeBtn}
                hitSlop={8}
              >
                <Feather
                  name={showPass ? "eye-off" : "eye"}
                  size={16}
                  color={c.faint}
                />
              </Pressable>
            </View>

            {password.length > 0 && (
              <View style={styles.strengthRow}>
                <View style={styles.strengthDots}>
                  {[1, 2, 3].map((i) => (
                    <View
                      key={i}
                      style={[
                        styles.strengthDot,
                        strength >= i && { backgroundColor: strengthColor[strength] },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.strengthLabel, { color: strengthColor[strength] }]}>
                  {strengthLabel[strength]}
                </Text>
              </View>
            )}

            {!!passwordError && (
              <View style={fieldStyles.errorRow}>
                <Feather name="alert-circle" size={11} color={c.destructive} />
                <Text style={fieldStyles.errorText}>{passwordError}</Text>
              </View>
            )}
          </View>

          {/* Confirmar senha */}
          <View style={fieldStyles.wrap}>
            <FieldLabel text="Confirmar senha" />
            <View
              style={[
                fieldStyles.inputContainer,
                focused === "confirm" && fieldStyles.inputFocused,
                !!confirmError && fieldStyles.inputError,
              ]}
            >
              <TextInput
                ref={confirmRef}
                value={confirm}
                onChangeText={(t) => { setConfirm(t); setConfirmError(null); }}
                placeholder="Repita a senha"
                placeholderTextColor={c.ghost}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleSignup}
                onFocus={() => setFocused("confirm")}
                onBlur={() => setFocused(null)}
                style={[fieldStyles.input, { paddingRight: 52 }]}
              />
              <Pressable
                onPress={() => setShowConfirm((v) => !v)}
                style={styles.eyeBtn}
                hitSlop={8}
              >
                <Feather
                  name={showConfirm ? "eye-off" : "eye"}
                  size={16}
                  color={c.faint}
                />
              </Pressable>
            </View>
            {confirm.length > 0 && confirm === password && !confirmError && (
              <View style={fieldStyles.errorRow}>
                <Feather name="check-circle" size={11} color="#16a34a" />
                <Text style={[fieldStyles.errorText, { color: "#16a34a" }]}>Senhas coincidem.</Text>
              </View>
            )}
            {!!confirmError && (
              <View style={fieldStyles.errorRow}>
                <Feather name="alert-circle" size={11} color={c.destructive} />
                <Text style={fieldStyles.errorText}>{confirmError}</Text>
              </View>
            )}
          </View>

          {!!error && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={13} color={c.destructive} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={handleSignup}
            disabled={loading}
            style={({ pressed }) => [
              styles.submitBtn,
              (pressed || loading) && { opacity: 0.8 },
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={c.background} />
            ) : (
              <Text style={styles.submitText}>Criar conta</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Já tem conta? </Text>
          <Pressable onPress={() => router.replace("/auth/login")}>
            <Text style={styles.footerLink}>Entrar</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: c.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: c.panel,
    marginBottom: 28,
  },
  header: {
    gap: 8,
    marginBottom: 32,
  },
  logoImage: {
    width: 40,
    height: 40,
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -0.7,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.mid,
    lineHeight: 21,
  },
  form: {
    gap: 16,
  },
  eyeBtn: {
    position: "absolute",
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  strengthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  strengthDots: {
    flexDirection: "row",
    gap: 5,
  },
  strengthDot: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.surface,
  },
  strengthLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    padding: 13,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.destructive,
    flex: 1,
  },
  submitBtn: {
    backgroundColor: c.text,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
    marginTop: 4,
  },
  submitText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.background,
    letterSpacing: -0.2,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 8,
  },
  footerText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.mid,
  },
  footerLink: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
  },
});
