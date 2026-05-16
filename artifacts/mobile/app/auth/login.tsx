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
  inputFocused: { borderColor: c.text },
  inputError: { borderColor: c.destructive },
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

  const topPad = insets.top;
  const botPad = insets.bottom;

  function validateFields(): boolean {
    let valid = true;
    setEmailError(null);
    setPasswordError(null);
    if (!email.trim()) { setEmailError("Informe seu e-mail."); valid = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setEmailError("Formato de e-mail inválido."); valid = false; }
    if (!password) { setPasswordError("Informe sua senha."); valid = false; }
    return valid;
  }

  async function handleLogin() {
    if (!validateFields()) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
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

  function enterForgotMode() {
    setForgotMode(true);
    setForgotEmail(email);
    setForgotSuccess(false);
    setError(null);
  }

  function exitForgotMode() {
    setForgotMode(false);
    setForgotSuccess(false);
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
          onPress={forgotMode ? exitForgotMode : () => router.back()}
          style={styles.backBtn}
          hitSlop={10}
        >
          <Feather name="arrow-left" size={20} color={c.text} />
        </Pressable>

        {/* Header — muda conforme o modo */}
        <View style={styles.header}>
          <Image
            source={require("@/assets/images/logo-symbol.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
          {forgotMode ? (
            <>
              <Text style={styles.title}>Recuperar senha</Text>
              <Text style={styles.subtitle}>
                Informe seu e-mail e enviaremos um link para redefinir sua senha.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>Entrar na sua conta</Text>
              <Text style={styles.subtitle}>
                Bem-vindo de volta. Digite suas credenciais abaixo.
              </Text>
            </>
          )}
        </View>

        {/* Formulário de recuperação de senha */}
        {forgotMode ? (
          <View style={styles.form}>
            {forgotSuccess ? (
              <View style={styles.successBox}>
                <Feather name="check-circle" size={20} color="#16a34a" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.successTitle}>Link enviado!</Text>
                  <Text style={styles.successDesc}>
                    Verifique sua caixa de entrada e siga as instruções para redefinir a senha.
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <Field
                  label="E-mail"
                  focused={forgotFocused}
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  placeholder="voce@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleForgotPassword}
                  onFocus={() => setForgotFocused(true)}
                  onBlur={() => setForgotFocused(false)}
                />

                <Pressable
                  onPress={handleForgotPassword}
                  disabled={forgotLoading || !forgotEmail.trim()}
                  style={({ pressed }) => [
                    styles.submitBtn,
                    (pressed || forgotLoading || !forgotEmail.trim()) && { opacity: 0.6 },
                  ]}
                >
                  {forgotLoading ? (
                    <ActivityIndicator size="small" color={c.background} />
                  ) : (
                    <Text style={styles.submitText}>Enviar link</Text>
                  )}
                </Pressable>
              </>
            )}

            <Pressable onPress={exitForgotMode} style={styles.backToLoginBtn}>
              <Text style={styles.backToLoginText}>Voltar para o login</Text>
            </Pressable>
          </View>
        ) : (
          /* Formulário de login */
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
                  <Feather name={showPass ? "eye-off" : "eye"} size={16} color={c.faint} />
                </Pressable>
              </View>
              {!!passwordError && (
                <View style={fieldStyles.errorRow}>
                  <Feather name="alert-circle" size={11} color={c.destructive} />
                  <Text style={fieldStyles.errorText}>{passwordError}</Text>
                </View>
              )}
            </View>

            <Pressable onPress={enterForgotMode} style={styles.forgotLink}>
              <Text style={styles.forgotLinkText}>Esqueceu a senha?</Text>
            </Pressable>

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

            <View style={styles.footer}>
              <Text style={styles.footerText}>Não tem conta? </Text>
              <Pressable onPress={() => router.replace("/auth/signup")}>
                <Text style={styles.footerLink}>Criar conta</Text>
              </Pressable>
            </View>
          </View>
        )}
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
  successBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#f0fdf4",
    borderRadius: 14,
    padding: 16,
  },
  successTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#16a34a",
  },
  successDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#15803d",
    lineHeight: 20,
  },
  backToLoginBtn: {
    alignItems: "center",
    paddingVertical: 4,
  },
  backToLoginText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: c.mid,
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
    paddingTop: 12,
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
