import React, { useState } from "react";
import { View, ScrollView } from "react-native";
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
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const colored = injectColor(svg, color);

  const widthMatch = colored.match(/width="([\d.]+)"/);
  const heightMatch = colored.match(/height="([\d.]+)"/);
  const naturalW = widthMatch ? parseFloat(widthMatch[1]) : 200;
  const naturalH = heightMatch ? parseFloat(heightMatch[1]) : 60;

  const needsScroll = containerWidth > 0 && naturalW > containerWidth;
  const scale = containerWidth > 0 && naturalW > containerWidth
    ? containerWidth / naturalW
    : 1;
  const displayW = naturalW * scale;
  const displayH = naturalH * scale;

  return (
    <View
      style={{ width: "100%" }}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {containerWidth > 0 && (
        needsScroll ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ alignItems: "center", paddingHorizontal: 4 }}
          >
            <SvgXml xml={colored} width={naturalW} height={naturalH} />
          </ScrollView>
        ) : (
          <View style={{ alignItems: "center" }}>
            <SvgXml xml={colored} width={displayW} height={displayH} />
          </View>
        )
      )}
    </View>
  );
}
