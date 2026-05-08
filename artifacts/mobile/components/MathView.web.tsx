import React, { useRef, useEffect } from "react";
import { View } from "react-native";
import katex from "katex";

let cssInjected = false;
function ensureKatexCss() {
  if (cssInjected || typeof document === "undefined") return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
  document.head.appendChild(link);
  cssInjected = true;
}

function sanitizeLatex(latex: string): string {
  return latex.replace(/\\text\{([^}]*)\}/g, (_, inner: string) =>
    `\\text{${inner.replace(/(?<!\\)\$/g, "\\$")}}`
  );
}

interface Props {
  latex: string;
  color?: string;
  fontSize?: number;
}

export function MathView({ latex, color = "#3A3A38", fontSize = 18 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureKatexCss();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      katex.render(sanitizeLatex(latex), el, {
        displayMode: true,
        throwOnError: false,
        output: "html",
        trust: false,
      });
      const katexEl = el.querySelector(".katex") as HTMLElement | null;
      if (katexEl) {
        katexEl.style.color = color;
        katexEl.style.fontSize = `${fontSize}px`;
      }
    } catch {
      el.textContent = latex;
    }
  }, [latex, color, fontSize]);

  return (
    <View style={{ width: "100%", alignItems: "center", paddingVertical: 4 }}>
      <div ref={ref} style={{ color, textAlign: "center" as const }} />
    </View>
  );
}
