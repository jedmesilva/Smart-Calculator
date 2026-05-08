import React from "react";
import { View, Text } from "react-native";

interface Props {
  latex: string;
  color?: string;
  fontSize?: number;
}

export function MathView({ latex, color = "#3A3A38", fontSize = 16 }: Props) {
  return (
    <View style={{ width: "100%", alignItems: "center", padding: 4 }}>
      <Text style={{ color, fontSize, fontFamily: "monospace", textAlign: "center" }}>
        {latex}
      </Text>
    </View>
  );
}
