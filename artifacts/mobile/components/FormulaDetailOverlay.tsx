import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { requestLlmVerify, publishFormula, unpublishFormula } from "@/lib/apiClient";
import {
  useFormulaVerifications,
  useFormulaNotes,
  useUpsertVerification,
  useRemoveVerification,
  useAddNote,
  useDeleteNote,
  useInvalidateFormula,
  useSavedFormulaIds,
  useToggleSaveFormula,
  type DbFormula,
  type FormulaVerification,
  type FormulaNote,
} from "@/lib/queries";

const c = colors.light;

/* ── Badge de verificação LLM ── */
function LlmBadge({ verdict, detail }: { verdict: "approved" | "flagged" | null; detail?: string | null }) {
  if (!verdict) return null;
  const ok = verdict === "approved";
  return (
    <View style={[styles.llmBadge, ok ? styles.llmBadgeOk : styles.llmBadgeWarn]}>
      <Feather name={ok ? "cpu" : "cpu"} size={11} color={ok ? "#2A7A4B" : "#B07D1A"} />
      <Text style={[styles.llmBadgeText, ok ? styles.llmBadgeTextOk : styles.llmBadgeTextWarn]}>
        {ok ? "IA verificou" : "IA sinalizou"}
      </Text>
    </View>
  );
}

/* ── Item de verificação ── */
function VerificationItem({
  item,
  isOwn,
  onRemove,
}: {
  item: FormulaVerification;
  isOwn: boolean;
  onRemove: () => void;
}) {
  const ok = item.verdict === "approved";
  const name = item.profiles?.full_name ?? "Usuário";
  return (
    <View style={styles.verItem}>
      <View style={[styles.verIcon, ok ? styles.verIconOk : styles.verIconWarn]}>
        <Feather name={ok ? "check" : "alert-triangle"} size={11} color={ok ? "#2A7A4B" : "#B07D1A"} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.verName}>{name}</Text>
        {!!item.detail && <Text style={styles.verDetail}>{item.detail}</Text>}
      </View>
      {isOwn && (
        <Pressable onPress={onRemove} hitSlop={8} style={styles.removeVerBtn}>
          <Feather name="x" size={12} color={c.ghost} />
        </Pressable>
      )}
    </View>
  );
}

/* ── Item de nota ── */
function NoteItem({
  item,
  isOwn,
  onDelete,
}: {
  item: FormulaNote;
  isOwn: boolean;
  onDelete: () => void;
}) {
  const name = item.profiles?.full_name ?? "Usuário";
  return (
    <View style={styles.noteItem}>
      <View style={{ flex: 1 }}>
        <Text style={styles.noteName}>{name}</Text>
        <Text style={styles.noteContent}>{item.content}</Text>
      </View>
      {isOwn && (
        <Pressable onPress={onDelete} hitSlop={8} style={styles.removeVerBtn}>
          <Feather name="x" size={12} color={c.ghost} />
        </Pressable>
      )}
    </View>
  );
}

/* ── Componente principal ── */
export function FormulaDetailOverlay({
  formula,
  onClose,
  onUse,
  currentUserId,
}: {
  formula: DbFormula;
  onClose: () => void;
  onUse?: (f: DbFormula) => void;
  currentUserId: string | null;
}) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 0 : insets.top;
  const botPad = Platform.OS === "web" ? 0 : insets.bottom;
  const { session } = useAuth();

  const isOwner = !!currentUserId && formula.user_id === currentUserId;

  const { data: verifications = [], isLoading: loadingVer } = useFormulaVerifications(formula.id);
  const { data: notes = [], isLoading: loadingNotes } = useFormulaNotes(formula.id);
  const { data: savedIds = new Set<string>() } = useSavedFormulaIds();
  const toggleSave = useToggleSaveFormula();
  const upsertVer = useUpsertVerification();
  const removeVer = useRemoveVerification();
  const addNote = useAddNote();
  const deleteNote = useDeleteNote();
  const invalidateFormula = useInvalidateFormula();

  const [noteText, setNoteText] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [flagText, setFlagText] = useState("");
  const [showFlagInput, setShowFlagInput] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);

  const isSaved = savedIds.has(formula.id);
  const myVerification = verifications.find((v) => v.user_id === currentUserId);
  const approvedCount = verifications.filter((v) => v.verdict === "approved").length;
  const flaggedCount = verifications.filter((v) => v.verdict === "flagged").length;

  /* ── Ações ── */
  const handleApprove = () => {
    if (!currentUserId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    upsertVer.mutate({ formulaId: formula.id, verdict: "approved" });
    setShowFlagInput(false);
  };

  const handleFlag = () => {
    if (!currentUserId) return;
    setShowNoteInput(false);
    setShowFlagInput((v) => !v);
  };

  const handleSubmitFlag = () => {
    if (!flagText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    upsertVer.mutate({ formulaId: formula.id, verdict: "flagged", detail: flagText.trim() });
    setFlagText("");
    setShowFlagInput(false);
  };

  const handleRemoveVer = () => {
    if (!currentUserId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    removeVer.mutate(formula.id);
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addNote.mutate({ formulaId: formula.id, content: noteText.trim() });
    setNoteText("");
    setShowNoteInput(false);
  };

  const handleRequestLlmVerify = async () => {
    if (!session || llmLoading) return;
    setLlmLoading(true);
    try {
      await requestLlmVerify(formula.id, session.access_token);
      invalidateFormula(formula.id);
      Alert.alert("Verificação concluída", "A IA verificou sua fórmula. Recarregue para ver o resultado.");
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Falha na verificação. Tente novamente.");
    } finally {
      setLlmLoading(false);
    }
  };

  const handlePublish = async (force = false) => {
    if (!session || publishLoading) return;
    setPublishLoading(true);
    try {
      const result = await publishFormula(formula.id, session.access_token, force);
      invalidateFormula(formula.id);

      if (result.published) {
        Alert.alert("Publicada!", "Sua fórmula está disponível na comunidade.");
      } else if (result.verdict === "flagged" && !force) {
        Alert.alert(
          "IA sinalizou um problema",
          result.detail + "\n\nDeseja publicar mesmo assim?",
          [
            { text: "Corrigir primeiro", style: "cancel" },
            { text: "Publicar mesmo assim", style: "destructive", onPress: () => handlePublish(true) },
          ]
        );
      }
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Falha ao publicar.");
    } finally {
      setPublishLoading(false);
    }
  };

  const handleUnpublish = async () => {
    if (!session) return;
    Alert.alert("Despublicar", "A fórmula ficará visível apenas para você. Confirmar?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Despublicar",
        style: "destructive",
        onPress: async () => {
          try {
            await unpublishFormula(formula.id, session.access_token);
            invalidateFormula(formula.id);
          } catch (err: any) {
            Alert.alert("Erro", err?.message ?? "Falha ao despublicar.");
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.overlay, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{formula.name}</Text>
          <Text style={styles.category}>{formula.category}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {onUse && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onUse(formula); }}
              style={styles.useBtn}
            >
              <Text style={styles.useBtnText}>usar</Text>
            </Pressable>
          )}
          <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
            <Feather name="x" size={18} color={c.faint} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.body, { paddingBottom: botPad + 28 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Fórmula info */}
        <View style={styles.infoCard}>
          {!!formula.symbolic && (
            <Text style={styles.symbolic}>{formula.symbolic}</Text>
          )}
          {!!formula.description && (
            <Text style={styles.description}>{formula.description}</Text>
          )}

          <View style={styles.badgeRow}>
            {formula.is_system && (
              <View style={styles.systemBadge}>
                <Feather name="star" size={10} color="#5A5A55" />
                <Text style={styles.systemBadgeText}>oficial</Text>
              </View>
            )}
            {formula.is_public && !formula.is_system && (
              <View style={styles.communityBadge}>
                <Feather name="globe" size={10} color="#3A6B9A" />
                <Text style={styles.communityBadgeText}>comunidade</Text>
              </View>
            )}
            <LlmBadge verdict={formula.llm_verdict} detail={formula.llm_verdict_detail} />
            {!formula.is_system && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(isSaved ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
                  toggleSave.mutate({ formulaId: formula.id, isSaved });
                }}
                style={[styles.saveBadge, isSaved && styles.saveBadgeSaved]}
              >
                <Feather name="bookmark" size={10} color={isSaved ? "#fff" : c.ghost} />
                <Text style={[styles.saveBadgeText, isSaved && styles.saveBadgeTextSaved]}>
                  {isSaved ? "salva" : "salvar"}
                </Text>
              </Pressable>
            )}
          </View>

          {formula.llm_verdict_detail && (
            <View style={[styles.llmDetail, formula.llm_verdict === "approved" ? styles.llmDetailOk : styles.llmDetailWarn]}>
              <Text style={styles.llmDetailText}>{formula.llm_verdict_detail}</Text>
            </View>
          )}
        </View>

        {/* Verificações da comunidade */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Verificações</Text>
            <View style={styles.verCounts}>
              {approvedCount > 0 && (
                <View style={styles.verCountBadge}>
                  <Feather name="check" size={10} color="#2A7A4B" />
                  <Text style={styles.verCountText}>{approvedCount}</Text>
                </View>
              )}
              {flaggedCount > 0 && (
                <View style={[styles.verCountBadge, styles.verCountBadgeWarn]}>
                  <Feather name="alert-triangle" size={10} color="#B07D1A" />
                  <Text style={[styles.verCountText, styles.verCountTextWarn]}>{flaggedCount}</Text>
                </View>
              )}
            </View>
          </View>

          {loadingVer ? (
            <ActivityIndicator size="small" color={c.ghost} style={{ marginVertical: 12 }} />
          ) : verifications.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma verificação ainda</Text>
          ) : (
            verifications.map((v) => (
              <VerificationItem
                key={v.id}
                item={v}
                isOwn={v.user_id === currentUserId}
                onRemove={handleRemoveVer}
              />
            ))
          )}

          {/* Ações de verificação (usuário não-dono) */}
          {currentUserId && !formula.is_system && (
            <View style={styles.actionRow}>
              <Pressable
                onPress={myVerification?.verdict === "approved" ? handleRemoveVer : handleApprove}
                style={[
                  styles.actionBtn,
                  myVerification?.verdict === "approved" && styles.actionBtnActiveOk,
                ]}
                disabled={upsertVer.isPending || removeVer.isPending}
              >
                <Feather
                  name="check"
                  size={13}
                  color={myVerification?.verdict === "approved" ? "#fff" : "#2A7A4B"}
                />
                <Text style={[
                  styles.actionBtnText,
                  myVerification?.verdict === "approved" ? styles.actionBtnTextWhite : styles.actionBtnTextOk,
                ]}>
                  {myVerification?.verdict === "approved" ? "aprovado" : "aprovar"}
                </Text>
              </Pressable>

              <Pressable
                onPress={myVerification?.verdict === "flagged" ? handleRemoveVer : handleFlag}
                style={[
                  styles.actionBtn,
                  myVerification?.verdict === "flagged" && styles.actionBtnActiveWarn,
                ]}
                disabled={upsertVer.isPending || removeVer.isPending}
              >
                <Feather
                  name="flag"
                  size={13}
                  color={myVerification?.verdict === "flagged" ? "#fff" : "#B07D1A"}
                />
                <Text style={[
                  styles.actionBtnText,
                  myVerification?.verdict === "flagged" ? styles.actionBtnTextWhite : styles.actionBtnTextWarn,
                ]}>
                  {myVerification?.verdict === "flagged" ? "sinalizado" : "sinalizar"}
                </Text>
              </Pressable>
            </View>
          )}

          {showFlagInput && (
            <View style={styles.inputCard}>
              <TextInput
                value={flagText}
                onChangeText={setFlagText}
                placeholder="Descreva o problema encontrado…"
                placeholderTextColor={c.ghost}
                style={styles.textInput}
                multiline
                autoFocus
              />
              <View style={styles.inputActions}>
                <Pressable onPress={() => { setShowFlagInput(false); setFlagText(""); }} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmitFlag}
                  disabled={!flagText.trim()}
                  style={[styles.submitBtn, !flagText.trim() && { opacity: 0.4 }]}
                >
                  <Text style={styles.submitBtnText}>enviar</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* Notas */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Notas</Text>
            {currentUserId && (
              <Pressable onPress={() => { setShowFlagInput(false); setShowNoteInput((v) => !v); }} hitSlop={8}>
                <Text style={styles.addNoteBtn}>+ nota</Text>
              </Pressable>
            )}
          </View>

          {showNoteInput && (
            <View style={styles.inputCard}>
              <TextInput
                value={noteText}
                onChangeText={setNoteText}
                placeholder="Adicione uma nota sobre esta fórmula…"
                placeholderTextColor={c.ghost}
                style={styles.textInput}
                multiline
                autoFocus
              />
              <View style={styles.inputActions}>
                <Pressable onPress={() => { setShowNoteInput(false); setNoteText(""); }} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={handleAddNote}
                  disabled={!noteText.trim() || addNote.isPending}
                  style={[styles.submitBtn, (!noteText.trim() || addNote.isPending) && { opacity: 0.4 }]}
                >
                  <Text style={styles.submitBtnText}>salvar</Text>
                </Pressable>
              </View>
            </View>
          )}

          {loadingNotes ? (
            <ActivityIndicator size="small" color={c.ghost} style={{ marginVertical: 12 }} />
          ) : notes.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma nota ainda</Text>
          ) : (
            notes.map((n) => (
              <NoteItem
                key={n.id}
                item={n}
                isOwn={n.user_id === currentUserId}
                onDelete={() => deleteNote.mutate({ noteId: n.id, formulaId: formula.id })}
              />
            ))
          )}
        </View>

        {/* Ações do dono */}
        {isOwner && (
          <View style={styles.ownerSection}>
            <Text style={styles.sectionLabel}>Minha fórmula</Text>

            <Pressable
              onPress={handleRequestLlmVerify}
              disabled={llmLoading}
              style={[styles.ownerBtn, llmLoading && { opacity: 0.6 }]}
            >
              {llmLoading ? (
                <ActivityIndicator size="small" color={c.mid} />
              ) : (
                <Feather name="cpu" size={14} color={c.mid} />
              )}
              <Text style={styles.ownerBtnText}>
                {llmLoading ? "verificando…" : "Solicitar verificação da IA"}
              </Text>
            </Pressable>

            {!formula.is_public ? (
              <Pressable
                onPress={() => handlePublish(false)}
                disabled={publishLoading}
                style={[styles.ownerBtnPrimary, publishLoading && { opacity: 0.6 }]}
              >
                {publishLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="globe" size={14} color="#fff" />
                )}
                <Text style={styles.ownerBtnPrimaryText}>
                  {publishLoading ? "publicando…" : "Publicar na comunidade"}
                </Text>
              </Pressable>
            ) : (
              <Pressable onPress={handleUnpublish} style={styles.ownerBtnDanger}>
                <Feather name="eye-off" size={14} color="#C0392B" />
                <Text style={styles.ownerBtnDangerText}>Despublicar</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: c.background,
    zIndex: 70,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.surface,
  },
  title: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: c.text,
  },
  category: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.ghost,
    marginTop: 1,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  useBtn: {
    backgroundColor: c.text,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 9,
  },
  useBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  iconBtn: {
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 20,
  },
  infoCard: {
    backgroundColor: c.panel,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  symbolic: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
    lineHeight: 22,
  },
  description: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.mid,
    lineHeight: 20,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  systemBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "#EFEFEC",
  },
  systemBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#5A5A55",
  },
  communityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "#EBF3FB",
  },
  communityBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#3A6B9A",
  },
  llmBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  llmBadgeOk: { backgroundColor: "#F0FAF4" },
  llmBadgeWarn: { backgroundColor: "#FBF8ED" },
  llmBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  llmBadgeTextOk: { color: "#2A7A4B" },
  llmBadgeTextWarn: { color: "#B07D1A" },
  saveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: c.surface,
  },
  saveBadgeSaved: { backgroundColor: c.text },
  saveBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: c.ghost },
  saveBadgeTextSaved: { color: "#fff" },
  llmDetail: {
    borderRadius: 8,
    padding: 10,
  },
  llmDetailOk: { backgroundColor: "#F0FAF4" },
  llmDetailWarn: { backgroundColor: "#FBF8ED" },
  llmDetailText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.mid,
    lineHeight: 18,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: c.faint,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  verCounts: {
    flexDirection: "row",
    gap: 6,
  },
  verCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: "#F0FAF4",
  },
  verCountBadgeWarn: { backgroundColor: "#FBF8ED" },
  verCountText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#2A7A4B",
  },
  verCountTextWarn: { color: "#B07D1A" },
  verItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.surface,
  },
  verIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  verIconOk: { backgroundColor: "#F0FAF4" },
  verIconWarn: { backgroundColor: "#FBF8ED" },
  verName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
  },
  verDetail: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.mid,
    lineHeight: 18,
    marginTop: 2,
  },
  removeVerBtn: {
    padding: 4,
  },
  noteItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.surface,
  },
  noteName: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
    marginBottom: 2,
  },
  noteContent: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.mid,
    lineHeight: 19,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: c.surface,
  },
  actionBtnActiveOk: { backgroundColor: "#2A7A4B" },
  actionBtnActiveWarn: { backgroundColor: "#B07D1A" },
  actionBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  actionBtnTextOk: { color: "#2A7A4B" },
  actionBtnTextWarn: { color: "#B07D1A" },
  actionBtnTextWhite: { color: "#fff" },
  addNoteBtn: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: c.mid,
  },
  inputCard: {
    backgroundColor: c.panel,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  textInput: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.text,
    minHeight: 60,
    textAlignVertical: "top",
  },
  inputActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  cancelBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: c.ghost,
  },
  submitBtn: {
    backgroundColor: c.text,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  submitBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  ownerSection: {
    gap: 8,
    paddingTop: 4,
  },
  ownerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: c.panel,
  },
  ownerBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: c.mid,
  },
  ownerBtnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: c.text,
  },
  ownerBtnPrimaryText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  ownerBtnDanger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: "#FEF0EE",
  },
  ownerBtnDangerText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#C0392B",
  },
  emptyText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.ghost,
    paddingVertical: 8,
  },
});
