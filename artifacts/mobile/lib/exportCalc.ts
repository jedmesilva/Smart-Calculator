import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
// Note: web export branch removed — native only
import katex from "katex";
import type { ResultData } from "@/lib/apiClient";
import { supabase } from "@/lib/supabase";

const SAF_DIR_KEY = "@phormula/saf_dir";

async function saveToAndroidDownloads(pdfUri: string, fileName: string): Promise<void> {
  let directoryUri = await AsyncStorage.getItem(SAF_DIR_KEY).catch(() => null);

  const tryCreate = async (dirUri: string) => {
    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      dirUri,
      fileName,
      "application/pdf"
    );
    const base64 = await FileSystem.readAsStringAsync(pdfUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  };

  if (directoryUri) {
    try {
      await tryCreate(directoryUri);
      return;
    } catch {
      // URI expirou ou permissão revogada — pede novamente
      await AsyncStorage.removeItem(SAF_DIR_KEY).catch(() => {});
      directoryUri = null;
    }
  }

  // Primeira vez: abre o seletor de pasta pré-apontado para Downloads
  const downloadsUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot("Download");
  const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(downloadsUri);
  if (!result.granted) throw new Error("Permissão negada pelo usuário");

  await AsyncStorage.setItem(SAF_DIR_KEY, result.directoryUri).catch(() => {});
  await tryCreate(result.directoryUri);
}

function renderLatex(latex: string): string {
  try {
    return katex.renderToString(latex, {
      displayMode: true,
      throwOnError: false,
      output: "html",
    });
  } catch {
    return `<span style="font-family:monospace;color:#888">${latex}</span>`;
  }
}

function formatDate() {
  return new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildFileName(data: ResultData): string {
  const slugify = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);

  const date = new Date();
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();

  const name = slugify(data.meta?.titulo ?? "calculo");
  return `phormula_${name}_${dd}${mm}${yyyy}.pdf`;
}

function buildHTML(data: ResultData): string {
  const objetivo = data.objetivo ?? "";
  const subcategoria = data.meta?.subcategoria ?? "";
  const resultValor = data.resultado?.valor ?? "";
  const resultUnidade = data.resultado?.unidade ?? "";
  const resultInterpretacao = data.resultado?.interpretacao ?? "";
  const formulaAbstrata = data.formula?.abstrata ?? "";
  const variaveis = data.variaveis ?? [];
  const desenvolvimento = data.desenvolvimento ?? [];
  const dateStr = formatDate();

  const varsRows = variaveis
    .map(
      (v) => `
      <tr>
        <td class="var-symbol">${v.simbolo}</td>
        <td class="var-name">${v.descricao}</td>
        <td class="var-value">${v.unidade ? v.unidade + " " : ""}${v.valor}</td>
      </tr>`
    )
    .join("");

  const stepsHTML = desenvolvimento
    .map(
      (step) => `
      <div class="step">
        <span class="step-num">${String(step.ordem).padStart(2, "0")}</span>
        <div class="step-body">
          <span class="step-text">${step.descricao}</span>
          ${step.latex ? `<div class="step-latex">${renderLatex(step.latex)}</div>` : ""}
          ${step.tipo !== "resultado" ? `<span class="step-tipo">${step.tipo}</span>` : ""}
        </div>
      </div>`
    )
    .join("");

  const hasFormula = !!formulaAbstrata;
  const hasVars = varsRows.length > 0;
  const hasSteps = stepsHTML.length > 0;

  let secIdx = 0;

  const formulaLatexDoc = data.formula?.latex;
  const formulaHTML = hasFormula
    ? `<div class="section-label">${String(++secIdx).padStart(2, "0")} — Fórmula</div>
       <div class="formula-box">
         ${formulaLatexDoc
           ? `<div class="step-latex">${renderLatex(formulaLatexDoc)}</div>`
           : `<div class="formula-symbolic">${formulaAbstrata}</div>`}
       </div>`
    : "";

  const varsHTML = hasVars
    ? `<div class="section-label">${String(++secIdx).padStart(2, "0")} — Variáveis</div>
       <table>${varsRows}</table>`
    : "";

  const desenvolHTML = hasSteps
    ? `<div class="section-label">${String(++secIdx).padStart(2, "0")} — Desenvolvimento</div>
       <div class="steps">${stepsHTML}</div>`
    : "";

  const resSecNum = ++secIdx;

  const searchBadge = data.searchUsed
    ? `<span class="badge">pesquisa web</span>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${objetivo || "Cálculo"}</title>
  <meta name="author" content="Phormula — Calculadora Inteligente" />
  <meta name="description" content="${objetivo}" />
  <meta name="creator" content="Phormula" />
  <meta name="created" content="${new Date().toISOString()}" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      background: #F7F6F3;
      color: #1A1A18;
      padding: 48px 40px;
      font-size: 14px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 1px solid #E8E7E3;
    }
    .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; color: #1A1A18; }
    .logo span { color: #AEADA8; font-weight: 400; }
    .date { font-size: 11px; color: #AEADA8; margin-top: 4px; }
    .badge {
      font-size: 10px;
      font-weight: 500;
      color: #6B6B66;
      background: #E8E7E3;
      padding: 3px 8px;
      border-radius: 6px;
      white-space: nowrap;
    }
    .objetivo-hero {
      margin-bottom: 32px;
    }
    .objetivo-label {
      font-size: 9px;
      font-weight: 600;
      color: #C8C7C2;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 6px;
    }
    .objetivo-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .objetivo-text {
      font-size: 22px;
      font-weight: 700;
      color: #1A1A18;
      letter-spacing: -0.4px;
      line-height: 1.3;
    }
    .section-label {
      font-size: 10px;
      font-weight: 600;
      color: #AEADA8;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      margin-bottom: 8px;
      margin-top: 28px;
      padding-bottom: 6px;
      border-bottom: 1px solid #E8E7E3;
    }
    .formula-box {
      background: #EFEFEC;
      border-radius: 12px;
      padding: 16px 20px;
      margin-top: 8px;
    }
    .formula-symbolic { font-size: 13px; color: #1A1A18; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    tr { border-bottom: 1px solid #E8E7E3; }
    tr:last-child { border-bottom: none; }
    td { padding: 10px 4px; vertical-align: middle; }
    .var-symbol { font-weight: 700; color: #1A1A18; width: 32px; font-size: 13px; }
    .var-name { color: #AEADA8; flex: 1; font-size: 13px; }
    .var-value { font-weight: 600; text-align: right; font-size: 13px; color: #1A1A18; }
    .step {
      display: flex;
      gap: 16px;
      padding: 10px 0;
      border-bottom: 1px solid #E8E7E3;
      align-items: flex-start;
    }
    .step:last-child { border-bottom: none; }
    .step-num { font-weight: 700; font-size: 10px; color: #C8C7C2; min-width: 20px; padding-top: 2px; }
    .step-body { display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .step-text { font-size: 13px; color: #6B6B66; line-height: 1.6; }
    .step-tipo { font-size: 9px; color: #C8C7C2; text-transform: uppercase; letter-spacing: 0.5px; }
    .result-card {
      background: #F0EFEB;
      border-radius: 16px;
      padding: 16px 22px;
      margin-top: 8px;
    }
    .result-unit { font-size: 11px; font-weight: 500; color: #AEADA8; letter-spacing: 0.2px; margin-bottom: 2px; }
    .result-num { font-size: 40px; font-weight: 700; color: #1A1A18; letter-spacing: -2px; line-height: 1.1; }
    .result-label { font-size: 11px; font-weight: 500; color: #6B6B66; text-transform: uppercase; letter-spacing: 0.2px; margin-top: 6px; }
    .result-interpretacao { font-size: 11px; color: #AEADA8; margin-top: 4px; font-style: italic; }
    .step-latex { text-align: center; padding: 6px 0; color: #1A1A18; }
    .footer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid #E8E7E3;
      font-size: 10px;
      color: #C8C7C2;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      @page { margin: 1.5cm; size: A4; }
      body { background: white; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .result-card { background: #F0EFEB !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">Φ <span>Phormula</span></div>
      <div class="date">${dateStr}</div>
    </div>
  </div>

  ${objetivo ? `
  <div class="objetivo-hero">
    <div class="objetivo-meta">
      <div class="objetivo-label">Objetivo</div>
      ${searchBadge}
    </div>
    <div class="objetivo-text">${objetivo}</div>
  </div>` : ""}

  ${formulaHTML}
  ${varsHTML}
  ${desenvolHTML}

  <div class="section-label">${String(resSecNum).padStart(2, "0")} — Resultado</div>
  <div class="result-card">
    ${resultUnidade ? `<div class="result-unit">${resultUnidade}</div>` : ""}
    <div class="result-num">${resultValor}</div>
    ${subcategoria ? `<div class="result-label">${subcategoria}</div>` : ""}
    ${resultInterpretacao ? `<div class="result-interpretacao">${resultInterpretacao}</div>` : ""}
  </div>

  <div class="footer">
    <span>Gerado pelo Phormula — calculadora inteligente</span>
    <span>${dateStr}</span>
  </div>
</body>
</html>`;
}

export async function exportAsPDF(data: ResultData): Promise<void> {
  const fileName = buildFileName(data);
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";

  const apiBase = process.env.EXPO_PUBLIC_API_URL
    ? process.env.EXPO_PUBLIC_API_URL
    : `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

  const response = await fetch(`${apiBase}/export/pdf`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error ?? "Erro ao gerar PDF no servidor");
  }

  // Converte a resposta para base64 e salva no filesystem
  const arrayBuffer = await response.arrayBuffer();
  const base64 = btoa(
    new Uint8Array(arrayBuffer).reduce((acc, byte) => acc + String.fromCharCode(byte), "")
  );

  const tmpUri = (FileSystem.cacheDirectory ?? "") + fileName;
  await FileSystem.writeAsStringAsync(tmpUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  try {
    if (Platform.OS === "android") {
      await saveToAndroidDownloads(tmpUri, fileName);
      await FileSystem.deleteAsync(tmpUri, { idempotent: true });
      return;
    }

    // iOS: share sheet nativa
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) throw new Error("Compartilhamento não disponível neste dispositivo");

    await Sharing.shareAsync(tmpUri, {
      mimeType: "application/pdf",
      dialogTitle: "Salvar cálculo",
      UTI: "com.adobe.pdf",
    });

    await FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
  } catch (err) {
    await FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => {});
    throw err;
  }
}

export function buildTextSummary(data: ResultData): string {
  const objetivo = data.objetivo ?? "";
  const subcategoria = data.meta?.subcategoria ?? "";
  const resultValor = data.resultado?.valor ?? "";
  const resultUnidade = data.resultado?.unidade ?? "";
  const resultInterpretacao = data.resultado?.interpretacao ?? "";
  const formulaAbstrata = data.formula?.abstrata ?? "";
  const variaveis = data.variaveis ?? [];
  const desenvolvimento = data.desenvolvimento ?? [];

  const dateStr = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const sep = "─────────────────────────────";
  const lines: string[] = [];

  // Cabeçalho
  lines.push(`Φ Phormula — Calculadora Inteligente`);
  lines.push(sep);
  lines.push(`Data: ${dateStr}`);
  if (data.searchUsed) lines.push(`[pesquisa web utilizada]`);

  // Objetivo
  if (objetivo) {
    lines.push(``);
    lines.push(`OBJETIVO`);
    lines.push(sep);
    lines.push(objetivo);
  }

  let secIdx = 0;
  const sec = (label: string) => {
    secIdx++;
    return `${String(secIdx).padStart(2, "0")} — ${label}`;
  };

  // Fórmula
  if (formulaAbstrata) {
    lines.push(``);
    lines.push(sec("FÓRMULA"));
    lines.push(sep);
    lines.push(formulaAbstrata);
  }

  // Variáveis
  if (variaveis.length > 0) {
    lines.push(``);
    lines.push(sec("VARIÁVEIS"));
    lines.push(sep);
    variaveis.forEach((v) => {
      const valor = `${v.unidade ? v.unidade + " " : ""}${v.valor}`;
      const papel = v.papel && v.papel !== v.descricao ? ` — ${v.papel}` : "";
      lines.push(`  ${v.simbolo} = ${valor}  (${v.descricao}${papel})`);
    });
  }

  // Desenvolvimento
  if (desenvolvimento.length > 0) {
    lines.push(``);
    lines.push(sec("DESENVOLVIMENTO"));
    lines.push(sep);
    desenvolvimento.forEach((step) => {
      lines.push(`  ${String(step.ordem).padStart(2, "0")}. ${step.descricao}`);
      if (step.justificativa) lines.push(`      → ${step.justificativa}`);
    });
  }

  // Resultado
  lines.push(``);
  lines.push(sec("RESULTADO"));
  lines.push(sep);
  if (resultUnidade) lines.push(`Unidade: ${resultUnidade}`);
  lines.push(`Valor: ${resultValor}`);
  if (subcategoria) lines.push(`Tipo: ${subcategoria}`);
  if (resultInterpretacao) lines.push(`Interpretação: ${resultInterpretacao}`);

  // Rodapé
  lines.push(``);
  lines.push(sep);
  lines.push(`Gerado pelo Phormula — calculadora inteligente`);
  lines.push(dateStr);

  return lines.join("\n");
}

export async function copyToClipboard(data: ResultData): Promise<void> {
  await Clipboard.setStringAsync(buildTextSummary(data));
}
