import React, { useState } from "react";
import { View, Platform } from "react-native";
import WebView from "react-native-webview";

interface Props {
  latex: string;
  color?: string;
  fontSize?: number;
}

/** Escapa $ dentro de \text{...} para evitar erros de KaTeX */
function sanitizeLatex(latex: string): string {
  // Substitui $ não escapados dentro de \text{...} por \$
  return latex.replace(/\\text\{([^}]*)\}/g, (_, inner: string) =>
    `\\text{${inner.replace(/(?<!\\)\$/g, "\\$")}}`
  );
}

function buildHtml(latex: string, color: string, fontSize: number): string {
  const safe = sanitizeLatex(latex);
  const escaped = safe
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`");

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { background: transparent; width: 100%; overflow: hidden; }
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 4px 8px;
    }
    .katex { color: ${color}; font-size: ${fontSize}px; }
    .katex-display { margin: 0; overflow-x: auto; overflow-y: hidden; }
    .katex-display > .katex { white-space: normal; }
  </style>
</head>
<body>
  <div id="math"></div>
  <script>
    function render() {
      try {
        katex.render(\`${escaped}\`, document.getElementById('math'), {
          displayMode: true,
          throwOnError: false,
          output: 'html',
          trust: false
        });
      } catch(e) {
        document.getElementById('math').textContent = \`${escaped}\`;
      }
      reportHeight();
    }
    function reportHeight() {
      var h = document.body.scrollHeight;
      window.ReactNativeWebView.postMessage(String(h));
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', render);
    } else {
      render();
    }
  </script>
</body>
</html>`;
}

export function MathView({ latex, color = "#3A3A38", fontSize = 18 }: Props) {
  const [height, setHeight] = useState(60);

  const html = buildHtml(latex, color, fontSize);

  return (
    <View style={{ width: "100%", height }}>
      <WebView
        source={{ html }}
        style={{ flex: 1, backgroundColor: "transparent" }}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={(e) => {
          const h = parseInt(e.nativeEvent.data, 10);
          if (!isNaN(h) && h > 0) setHeight(h);
        }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled={false}
        allowsInlineMediaPlayback={false}
        mediaPlaybackRequiresUserAction
        cacheEnabled={Platform.OS === "android"}
      />
    </View>
  );
}
