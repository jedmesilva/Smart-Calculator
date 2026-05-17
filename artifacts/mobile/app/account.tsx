import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { deleteAccount } from "@/lib/apiClient";
import colors from "@/constants/colors";

const c = colors.light;

type Section = "main" | "name" | "password";

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, userName, setUserName, signOut } = useAuth();

  const [section, setSection] = useState<Section>("main");

  /* name */
  const [nameValue, setNameValue] = useState(userName ?? "");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);

  /* password */
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  /* delete */
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const email = user?.email ?? "";

  const initials = (userName ?? email)
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  /* ── handlers ── */

  const handleSaveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) { setNameError("Informe um nome."); return; }
    setNameError(null);
    setNameSaving(true);
    try {
      await setUserName(trimmed);
      setNameSuccess(true);
      setTimeout(() => { setNameSuccess(false); setSection("main"); }, 1200);
    } catch {
      setNameError("Não foi possível salvar. Tente novamente.");
    } finally {
      setNameSaving(false);
    }
  };

  const handleSavePassword = async () => {
    if (newPassword.length < 6) { setPasswordError("A senha deve ter pelo menos 6 caracteres."); return; }
    if (newPassword !== confirmPassword) { setPasswordError("As senhas não coincidem."); return; }
    setPasswordError(null);
    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => { setPasswordSuccess(false); setSection("main"); }, 1400);
    } catch (err: any) {
      setPasswordError(err?.message ?? "Não foi possível alterar a senha.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount();
      await signOut();
    } catch (err: any) {
      setDeleteError(err?.message ?? "Não foi possível excluir a conta.");
      setDeleting(false);
    }
  };

  const handleBack = () => {
    if (section !== "main") {
      setSection("main");
    } else {
      router.back();
    }
  };

  /* ── sub-sections ── */

  const renderMain = () => (
    <ScrollView
      contentContainerStyle={styles.mainContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Profile card */}
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>{initials}</Text>
        </View>
        <View style={styles.profileInfo}>
          {userName ? <Text style={styles.profileName}>{userName}</Text> : null}
          <Text style={styles.profileEmail}>{email}</Text>
        </View>
      </View>

      {/* Settings group */}
      <View style={styles.group}>
        <Text style={styles.groupLabel}>CONTA</Text>
        <SettingsRow
          icon="user"
          label="Alterar nome"
          value={userName ?? "Não definido"}
          onPress={() => {
            setNameValue(userName ?? "");
            setNameError(null);
            setNameSuccess(false);
            setSection("name");
          }}
        />
        <View style={styles.rowSep} />
        <SettingsRow
          icon="lock"
          label="Alterar senha"
          value="••••••••"
          onPress={() => {
            setNewPassword("");
            setConfirmPassword("");
            setPasswordError(null);
            setPasswordSuccess(false);
            setSection("password");
          }}
        />
      </View>

      {/* Danger zone */}
      <View style={styles.dangerGroup}>
        <Text style={[styles.groupLabel, styles.dangerGroupLabel]}>ZONA DE PERIGO</Text>
        <Pressable
          style={({ pressed }) => [styles.dangerRow, pressed && { opacity: 0.7 }]}
          onPress={() => {
            setDeleteConfirmText("");
            setDeleteError(null);
            setShowDeleteConfirm(true);
          }}
        >
          <View style={styles.dangerIconWrap}>
            <Feather name="trash-2" size={16} color="#ef4444" />
          </View>
          <View style={styles.dangerTexts}>
            <Text style={styles.dangerLabel}>Excluir conta</Text>
            <Text style={styles.dangerDesc}>Seus dados serão desativados permanentemente</Text>
          </View>
          <Feather name="chevron-right" size={14} color="#ef4444" style={{ opacity: 0.6 }} />
        </Pressable>
      </View>
    </ScrollView>
  );

  const renderNameSection = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={styles.sectionContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Alterar nome</Text>
        <Text style={styles.sectionDesc}>Este nome aparece no seu perfil e nas conversas.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Nome completo</Text>
          <TextInput
            value={nameValue}
            onChangeText={(t) => { setNameValue(t); setNameError(null); }}
            placeholder="Seu nome"
            placeholderTextColor={c.ghost}
            autoFocus
            style={[styles.input, nameError ? styles.inputError : null]}
          />
          {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
        </View>

        {nameSuccess ? (
          <View style={styles.successBanner}>
            <Feather name="check-circle" size={15} color="#16a34a" />
            <Text style={styles.successText}>Nome salvo com sucesso!</Text>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { opacity: 0.85 },
              nameSaving && { opacity: 0.6 },
            ]}
            onPress={handleSaveName}
            disabled={nameSaving}
          >
            {nameSaving
              ? <ActivityIndicator size="small" color={c.background} />
              : <Text style={styles.primaryBtnText}>Salvar</Text>
            }
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderPasswordSection = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={styles.sectionContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Alterar senha</Text>
        <Text style={styles.sectionDesc}>Defina uma nova senha para a sua conta.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Nova senha</Text>
          <View style={[styles.inputRow, passwordError ? styles.inputError : null]}>
            <TextInput
              value={newPassword}
              onChangeText={(t) => { setNewPassword(t); setPasswordError(null); }}
              placeholder="Mínimo 6 caracteres"
              placeholderTextColor={c.ghost}
              secureTextEntry={!showNew}
              autoFocus
              style={styles.inputRowText}
            />
            <Pressable onPress={() => setShowNew(!showNew)} hitSlop={8} style={styles.eyeBtn}>
              <Feather name={showNew ? "eye-off" : "eye"} size={16} color={c.faint} />
            </Pressable>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Confirmar nova senha</Text>
          <View style={[styles.inputRow, passwordError ? styles.inputError : null]}>
            <TextInput
              value={confirmPassword}
              onChangeText={(t) => { setConfirmPassword(t); setPasswordError(null); }}
              placeholder="Repita a senha"
              placeholderTextColor={c.ghost}
              secureTextEntry={!showConfirm}
              style={styles.inputRowText}
            />
            <Pressable onPress={() => setShowConfirm(!showConfirm)} hitSlop={8} style={styles.eyeBtn}>
              <Feather name={showConfirm ? "eye-off" : "eye"} size={16} color={c.faint} />
            </Pressable>
          </View>
          {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
        </View>

        {passwordSuccess ? (
          <View style={styles.successBanner}>
            <Feather name="check-circle" size={15} color="#16a34a" />
            <Text style={styles.successText}>Senha alterada com sucesso!</Text>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { opacity: 0.85 },
              passwordSaving && { opacity: 0.6 },
            ]}
            onPress={handleSavePassword}
            disabled={passwordSaving}
          >
            {passwordSaving
              ? <ActivityIndicator size="small" color={c.background} />
              : <Text style={styles.primaryBtnText}>Salvar nova senha</Text>
            }
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={handleBack}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={12}
        >
          <Feather
            name={section === "main" ? "arrow-left" : "arrow-left"}
            size={18}
            color={c.mid}
          />
        </Pressable>
        <Text style={styles.headerTitle}>
          {section === "main"
            ? "Minha conta"
            : section === "name"
            ? "Alterar nome"
            : "Alterar senha"}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Content */}
      <View style={[styles.body, { paddingBottom: insets.bottom }]}>
        {section === "main" && renderMain()}
        {section === "name" && renderNameSection()}
        {section === "password" && renderPasswordSection()}
      </View>

      {/* Delete confirmation modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <Feather name="alert-triangle" size={22} color="#ef4444" />
            </View>
            <Text style={styles.modalTitle}>Excluir conta</Text>
            <Text style={styles.modalMessage}>
              Esta ação é permanente. Seu acesso será revogado imediatamente e todos os seus dados serão desativados.
            </Text>
            <Text style={styles.modalMessage}>
              Para confirmar, digite{" "}
              <Text style={{ fontFamily: "Inter_700Bold", color: c.text }}>EXCLUIR</Text>{" "}abaixo:
            </Text>
            <TextInput
              value={deleteConfirmText}
              onChangeText={(t) => { setDeleteConfirmText(t); setDeleteError(null); }}
              placeholder="EXCLUIR"
              placeholderTextColor={c.ghost}
              autoCapitalize="characters"
              style={styles.deleteInput}
            />
            {deleteError ? <Text style={styles.errorText}>{deleteError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable
                style={({ pressed }) => [styles.modalCancelBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.modalDeleteBtn,
                  pressed && { opacity: 0.85 },
                  (deleteConfirmText !== "EXCLUIR" || deleting) && { opacity: 0.35 },
                ]}
                onPress={handleDeleteAccount}
                disabled={deleteConfirmText !== "EXCLUIR" || deleting}
              >
                {deleting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalDeleteText}>Excluir conta</Text>
                }
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.settingsRow, pressed && { backgroundColor: c.surface }]}
    >
      <View style={styles.settingsIconWrap}>
        <Feather name={icon} size={15} color={c.mid} />
      </View>
      <View style={styles.settingsTexts}>
        <Text style={styles.settingsLabel}>{label}</Text>
        <Text style={styles.settingsValue} numberOfLines={1}>{value}</Text>
      </View>
      <Feather name="chevron-right" size={14} color={c.ghost} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.surface,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: c.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
    letterSpacing: -0.3,
  },
  body: {
    flex: 1,
  },
  mainContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 20,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: c.panel,
    borderRadius: 18,
    padding: 18,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: c.text,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  profileAvatarText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: c.background,
    letterSpacing: -0.3,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  profileName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
    letterSpacing: -0.2,
  },
  profileEmail: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.faint,
  },
  group: {
    backgroundColor: c.panel,
    borderRadius: 18,
    overflow: "hidden",
    paddingBottom: 4,
  },
  groupLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: c.faint,
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  settingsIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  settingsTexts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  settingsLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: c.text,
    letterSpacing: -0.1,
  },
  settingsValue: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.faint,
  },
  rowSep: {
    height: 1,
    backgroundColor: c.surface,
    marginHorizontal: 16,
  },
  dangerGroup: {
    backgroundColor: "#fef2f2",
    borderRadius: 18,
    overflow: "hidden",
    paddingBottom: 4,
  },
  dangerGroupLabel: {
    color: "#f87171",
  },
  dangerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  dangerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  dangerTexts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  dangerLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#ef4444",
    letterSpacing: -0.1,
  },
  dangerDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#f87171",
  },
  sectionContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 32,
    gap: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -0.5,
  },
  sectionDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.faint,
    lineHeight: 20,
    marginTop: -12,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: c.mid,
  },
  input: {
    backgroundColor: c.panel,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: c.text,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.panel,
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  inputRowText: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: c.text,
  },
  eyeBtn: {
    paddingLeft: 10,
    paddingVertical: 4,
  },
  inputError: {
    borderColor: "#ef4444",
  },
  errorText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#ef4444",
    marginTop: -4,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 14,
  },
  successText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#16a34a",
  },
  primaryBtn: {
    backgroundColor: c.text,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.background,
    letterSpacing: -0.1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  modalCard: {
    backgroundColor: c.background,
    borderRadius: 24,
    padding: 28,
    width: "100%",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 24,
  },
  modalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -0.4,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.faint,
    textAlign: "center",
    lineHeight: 21,
  },
  deleteInput: {
    width: "100%",
    backgroundColor: c.panel,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#ef4444",
    textAlign: "center",
    letterSpacing: 1,
    borderWidth: 1.5,
    borderColor: "#fecaca",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginTop: 6,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: c.panel,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.mid,
  },
  modalDeleteBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#ef4444",
    alignItems: "center",
  },
  modalDeleteText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
