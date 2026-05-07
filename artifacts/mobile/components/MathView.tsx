import React from "react";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";

interface Props {
  svg: string;
  color?: string;
}

function injectColor(svg: string, color: string): string {
  if (color === "#000000" || color === "black") return svg;
  return svg.replace(/<svg/, `<svg fill="${color}" color="${color}"`);
}

export function MathView({ svg, color = "#3A3A38" }: Props) {
  const colored = injectColor(svg, color);

  const widthMatch = colored.match(/width="([\d.]+)"/);
  const heightMatch = colored.match(/height="([\d.]+)"/);
  const w = widthMatch ? parseFloat(widthMatch[1]) : 200;
  const h = heightMatch ? parseFloat(heightMatch[1]) : 60;

  return (
    <View style={{ alignItems: "center", width: "100%" }}>
      <SvgXml xml={colored} width={w} height={h} />
    </View>
  );
}
