import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import colors from "@/constants/colors";
import type { ResultData } from "@/lib/apiClient";

const c = colors.light;

interface CalcSummaryCardProps {
  result: ResultData;
  onPress: () => void;
  variant?: "chat" | "list";
}

export function CalcSummaryCard({ result, onPress, variant = "chat" }: CalcSummaryCardProps) {
  const titulo = result.meta?.titulo ?? "";
  const subcategoria = result.meta?.subcategoria ?? "";
  const valor = result.resultado?.valor ?? "";
  const unidade = result.resultado?.unidade ?? "";
  const abstrata = result.formula?.abstrata ?? "";

  const numFontSize = valor.length > 10 ? 22 : valor.length > 6 ? 28 : 34;

  const inner = (
    <View style={styles.inner}>
      {/* Coluna esquerda: unidade + valor + meta */}
      <View style={styles.left}>
        {!!unidade && (
          <Text style={styles.unit}>{unidade}</Text>
        )}
        <Text style={[styles.value, { fontSize: numFontSize }]} numberOfLines={1}>
          {valor}
        </Text>
        <View style={styles.metaRow}>
          {!!titulo && (
            <Text style={styles.titulo} numberOfLines={1}>{titulo}</Text>
          )}
          {!!subcategoria && subcategoria !== titulo && (
            <Text style={styles.sub} numberOfLines={1}>{subcategoria}</Text>
          )}
          {!!abstrata && (
            <Text style={styles.abstrata} numberOfLines={1}>{abstrata}</Text>
          )}
        </View>
      </View>

      {/* Coluna direita: ação */}
      {variant === "chat" ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [styles.verBtn, pressed && styles.verBtnPressed]}
          hitSlop={8}
        >
          <Text style={styles.verBtnPhi}>Φ</Text>
          <Text style={styles.verBtnText}>ver</Text>
        </Pressable>
      ) : (
        <Feather name="chevron-right" size={15} color={c.ghost} style={styles.chevron} />
      )}
    </View>
  );

  if (variant === "chat") {
    return (
      <View style={styles.card}>
        {result.searchUsed && (
          <View style={styles.webBadge}>
            <Feather name="globe" size={8} color={c.mid} />
            <Text style={styles.webBadgeText}>verificado</Text>
          </View>
        )}
        {inner}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, pressed && styles.listRowPressed]}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#F0EFEB",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    overflow: "hidden",
  },
  listRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  listRowPressed: {
    backgroundColor: c.surface,
  },
  inner: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  left: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  unit: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: c.ghost,
    letterSpacing: 0.2,
    lineHeight: 15,
  },
  value: {
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -1.2,
    lineHeight: 38,
  },
  metaRow: {
    gap: 1,
    marginTop: 4,
  },
  titulo: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: c.mid,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  sub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.faint,
  },
  abstrata: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.ghost,
  },
  verBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 9,
    backgroundColor: "#E8E7E2",
    flexShrink: 0,
    marginBottom: 2,
  },
  verBtnPressed: {
    backgroundColor: c.surface,
  },
  verBtnPhi: {
    fontSize: 11,
    color: c.mid,
    fontFamily: "Inter_400Regular",
  },
  verBtnText: {
    fontSize: 11,
    color: c.mid,
    fontFamily: "Inter_600SemiBold",
  },
  chevron: {
    flexShrink: 0,
    marginBottom: 4,
  },
  webBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    alignSelf: "flex-start",
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 5,
    backgroundColor: "#E8E7E2",
    marginBottom: 8,
  },
  webBadgeText: {
    fontSize: 9,
    color: c.mid,
    fontFamily: "Inter_500Medium",
  },
});
