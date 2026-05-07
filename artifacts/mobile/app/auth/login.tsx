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
  TextInputProps,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import colors from "@/constants/colors";

const c = colors.light;

function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("Email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (msg.includes("invalid format") || msg.includes("valid email")) return "Formato de e-mail inválido.";
  if (msg.includes("rate limit") || msg.includes("too many")) return "Muitas tentativas. Aguarde alguns minutos.";
  if (msg.includes("network") || msg.includes("fetch")) return "Erro de conexão. Verifique sua internet.";
  return msg;
}

type FieldProps = {
  label: string;
  error?: string;
  focused: boolean;
} & TextInputProps;

function Field({ label, error, focused, ...props }: FieldProps) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      <View
        style={[
          fieldStyles.inputContainer,
          focused && fieldStyles.inputFocused,
          !!error && fieldStyles.inputError,
        ]}
      >
        {props.children}
        <TextInput
          placeholderTextColor={c.ghost}
          style={fieldStyles.input}
          {...props}
        />
      </View>
      {!!error && (
        <View style={fieldStyles.errorRow}>
          <Feather name="alert-circle" size={11} color={c.destructive} />
          <Text style={fieldStyles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
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

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotFocused, setForgotFocused] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const topPad = Platform.OS === "web" ? 60 : insets.top;
  const botPad = Platform.OS === "web" ? 32 : insets.bottom;

  function validateFields(): boolean {
    let valid = true;
    setEmailError(null);
    setPasswordError(null);

    if (!email.trim()) {
      setEmailError("Informe seu e-mail.");
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError("Formato de e-mail inválido.");
      valid = false;
    }

    if (!password) {
      setPasswordError("Informe sua senha.");
      valid = false;
    }

    return valid;
  }

  async function handleLogin() {
    if (!validateFields()) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) setError(translateError(error.message));
    setLoading(false);
  }

  async function handleForgotPassword() {
    if (!forgotEmail.trim()) return;
    setForgotLoading(true);
    await supabase.auth.resetPasswordForEmail(forgotEmail.trim());
    setForgotLoading(false);
    setForgotSuccess(true);
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
          <Text style={styles.sigma}>σ</Text>
          <Text style={styles.title}>Entrar na sua conta</Text>
          <Text style={styles.subtitle}>
            Bem-vindo de volta. Digite suas credenciais abaixo.
          </Text>
        </View>

        <View style={styles.form}>
          <Field
            label="E-mail"
            error={emailError ?? undefined}
            focused={focusedField === "email"}
            value={email}
            onChangeText={(t) => { setEmail(t); setEmailError(null); setError(null); }}
            placeholder="voce@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            onFocus={() => setFocusedField("email")}
            onBlur={() => setFocusedField(null)}
          />

          <View style={fieldStyles.wrap}>
            <Text style={fieldStyles.label}>Senha</Text>
            <View
              style={[
                fieldStyles.inputContainer,
                focusedField === "password" && fieldStyles.inputFocused,
                !!passwordError && fieldStyles.inputError,
              ]}
            >
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={(t) => { setPassword(t); setPasswordError(null); setError(null); }}
                placeholder="Sua senha"
                placeholderTextColor={c.ghost}
                secureTextEntry={!showPass}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
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
            {!!passwordError && (
              <View style={fieldStyles.errorRow}>
                <Feather name="alert-circle" size={11} color={c.destructive} />
                <Text style={fieldStyles.errorText}>{passwordError}</Text>
              </View>
            )}
          </View>

          <Pressable
            onPress={() => { setForgotMode((v) => !v); setForgotSuccess(false); }}
            style={styles.forgotLink}
          >
            <Text style={styles.forgotLinkText}>
              {forgotMode ? "Cancelar" : "Esqueceu a senha?"}
            </Text>
          </Pressable>

          {forgotMode && (
            <View style={styles.forgotBox}>
              {forgotSuccess ? (
                <View style={styles.forgotSuccess}>
                  <Feather name="check-circle" size={15} color="#16a34a" />
                  <Text style={styles.forgotSuccessText}>
                    Link enviado! Verifique sua caixa de entrada.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.forgotDesc}>
                    Digite seu e-mail para receber o link de redefinição de senha.
                  </Text>
                  <View
                    style={[
                      fieldStyles.inputContainer,
                      forgotFocused && fieldStyles.inputFocused,
                    ]}
                  >
                    <TextInput
                      value={forgotEmail}
                      onChangeText={setForgotEmail}
                      placeholder="voce@email.com"
                      placeholderTextColor={c.ghost}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      onFocus={() => setForgotFocused(true)}
                      onBlur={() => setForgotFocused(false)}
                      style={fieldStyles.input}
                    />
                  </View>
                  <Pressable
                    onPress={handleForgotPassword}
                    disabled={forgotLoading || !forgotEmail.trim()}
                    style={({ pressed }) => [
                      styles.forgotSendBtn,
                      (pressed || forgotLoading || !forgotEmail.trim()) && { opacity: 0.6 },
                    ]}
                  >
                    {forgotLoading ? (
                      <ActivityIndicator size="small" color={c.background} />
                    ) : (
                      <Text style={styles.forgotSendText}>Enviar link</Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          )}

          {!!error && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={13} color={c.destructive} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={handleLogin}
            disabled={loading}
            style={({ pressed }) => [
              styles.submitBtn,
              (pressed || loading) && { opacity: 0.8 },
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={c.background} />
            ) : (
              <Text style={styles.submitText}>Entrar</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Não tem conta? </Text>
          <Pressable onPress={() => router.replace("/auth/signup")}>
            <Text style={styles.footerLink}>Criar conta</Text>
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
  sigma: {
    fontSize: 28,
    fontFamily: "Inter_400Regular",
    color: c.ghost,
    lineHeight: 34,
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
    flex: 1,
  },
  eyeBtn: {
    position: "absolute",
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  forgotLink: {
    alignSelf: "flex-end",
    marginTop: -4,
  },
  forgotLinkText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: c.mid,
  },
  forgotBox: {
    backgroundColor: c.panel,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  forgotDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.mid,
    lineHeight: 20,
  },
  forgotSendBtn: {
    backgroundColor: c.text,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  forgotSendText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: c.background,
  },
  forgotSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  forgotSuccessText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#16a34a",
    flex: 1,
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
