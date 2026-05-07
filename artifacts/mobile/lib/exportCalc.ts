import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import type { ResultData } from "@/lib/apiClient";

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

  const name = slugify(data.formulaName);
  return `sigma_${name}_${dd}${mm}${yyyy}.pdf`;
}

function buildHTML(data: ResultData): string {
  const title = data.formulaName;
  const dateStr = formatDate();
  const category = data.formulaCategory ?? "Cálculo";

  const varsRows = (data.variables ?? [])
    .map(
      (v) => `
      <tr>
        <td class="var-symbol">${v.symbol}</td>
        <td class="var-name">${v.name}</td>
        <td class="var-value">${v.value}</td>
      </tr>`
    )
    .join("");

  const stepsHTML = (data.steps ?? [])
    .map(
      (step, i) => `
      <div class="step">
        <span class="step-num">${String(i + 1).padStart(2, "0")}</span>
        <span class="step-text">${step}</span>
      </div>`
    )
    .join("");

  const noteHTML = data.note ? `<p class="note">* ${data.note}</p>` : "";
  const warningHTML = data.warning
    ? `<p class="warning">⚠ ${data.warning}</p>`
    : "";
  const unitHTML = data.resultUnit
    ? `<span class="result-unit">${data.resultUnit}</span>`
    : "";

  const contextoHTML = data.conversationalResponse
    ? `<div class="section-label">01 — Contexto</div>
       <p class="contexto-text">${data.conversationalResponse}</p>`
    : "";

  const proofHTML = data.proof
    ? `<div class="section-label">${data.conversationalResponse ? "06" : "05"} — Verificação</div>
       <div class="proof-box ${data.proof.verified ? "proof-ok" : "proof-warn"}">
         <div class="proof-header">
           <span class="proof-icon">${data.proof.verified ? "✓" : "⚠"}</span>
           <span class="proof-method">${data.proof.method}</span>
           <span class="proof-badge">${data.proof.verified ? "aprovado" : "revisar"}</span>
         </div>
         <p class="proof-detail">${data.proof.detail}</p>
       </div>`
    : "";

  const searchBadge = data.searchUsed
    ? `<span class="badge">pesquisa web</span>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="author" content="Sigma — Calculadora Inteligente" />
  <meta name="subject" content="${category}" />
  <meta name="description" content="${title} — ${data.resultLabel}: ${data.resultUnit} ${data.resultFormatted}" />
  <meta name="creator" content="Sigma App" />
  <meta name="created" content="${new Date().toISOString()}" />
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
    .id-card {
      background: #EFEFEC;
      border-radius: 14px;
      padding: 20px 24px;
      margin-bottom: 32px;
    }
    .id-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 14px;
      gap: 12px;
    }
    .id-title { font-size: 20px; font-weight: 700; color: #1A1A18; letter-spacing: -0.3px; }
    .badge {
      font-size: 10px;
      font-weight: 500;
      color: #6B6B66;
      background: #E8E7E3;
      padding: 3px 8px;
      border-radius: 6px;
      white-space: nowrap;
    }
    .id-meta { display: flex; gap: 24px; flex-wrap: wrap; }
    .id-meta-item { }
    .id-meta-label { font-size: 9px; color: #C8C7C2; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    .id-meta-value { font-size: 12px; font-weight: 600; color: #6B6B66; }
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
    .contexto-text { font-size: 13px; color: #6B6B66; line-height: 1.7; margin-top: 8px; }
    .formula-box {
      background: #EFEFEC;
      border-radius: 12px;
      padding: 16px 20px;
      margin-top: 8px;
    }
    .formula-symbolic { font-size: 12px; color: #AEADA8; margin-bottom: 4px; }
    .formula-sub-label { font-size: 10px; color: #C8C7C2; margin: 8px 0 4px; }
    .formula-substituted { font-size: 15px; font-weight: 700; color: #1A1A18; }
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
    .step-text { font-size: 13px; color: #6B6B66; line-height: 1.6; flex: 1; }
    .result-card {
      background: #1A1A18;
      border-radius: 12px;
      padding: 18px 22px;
      margin-top: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .result-label { font-size: 11px; color: #6B6B66; margin-bottom: 3px; }
    .result-unit { font-size: 13px; color: #AEADA8; }
    .result-num { font-size: 40px; font-weight: 700; color: #F7F6F3; letter-spacing: -2px; line-height: 1; }
    .proof-box {
      border-radius: 12px;
      padding: 14px 18px;
      margin-top: 8px;
    }
    .proof-ok { background: #F0FAF4; border: 1px solid #C0E8CE; }
    .proof-warn { background: #FBF8ED; border: 1px solid #E8DCA8; }
    .proof-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .proof-icon { font-size: 14px; }
    .proof-method { font-size: 12px; font-weight: 600; color: #1A1A18; flex: 1; }
    .proof-badge {
      font-size: 10px; font-weight: 600;
      padding: 2px 7px; border-radius: 5px;
      background: #C0E8CE; color: #1A5C38;
    }
    .proof-warn .proof-badge { background: #E8DCA8; color: #7A5010; }
    .proof-detail { font-size: 12px; color: #6B6B66; line-height: 1.5; }
    .note { font-size: 11px; color: #AEADA8; font-style: italic; margin-top: 20px; }
    .warning { font-size: 11px; color: #B07D1A; margin-top: 10px; }
    .footer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid #E8E7E3;
      font-size: 10px;
      color: #C8C7C2;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">σ <span>sigma</span></div>
      <div class="date">${dateStr}</div>
    </div>
    <div class="date" style="text-align:right;">${category}</div>
  </div>

  <div class="id-card">
    <div class="id-card-top">
      <div class="id-title">${title}</div>
      ${searchBadge}
    </div>
    <div class="id-meta">
      ${data.formulaCategory ? `<div class="id-meta-item"><div class="id-meta-label">Categoria</div><div class="id-meta-value">${data.formulaCategory}</div></div>` : ""}
      <div class="id-meta-item"><div class="id-meta-label">Data</div><div class="id-meta-value">${dateStr}</div></div>
      <div class="id-meta-item"><div class="id-meta-label">Resultado</div><div class="id-meta-value">${data.resultUnit ? data.resultUnit + " " : ""}${data.resultFormatted}</div></div>
    </div>
  </div>

  ${contextoHTML}

  ${data.formulaSymbolic || data.formulaSubstituted ? `
  <div class="section-label">${data.conversationalResponse ? "02" : "01"} — Fórmula</div>
  <div class="formula-box">
    ${data.formulaSymbolic ? `<div class="formula-symbolic">${data.formulaSymbolic}</div>` : ""}
    ${data.formulaSubstituted ? `<div class="formula-sub-label">com valores substituídos</div><div class="formula-substituted">${data.formulaSubstituted}</div>` : ""}
  </div>` : ""}

  ${varsRows ? `
  <div class="section-label">${data.conversationalResponse ? "03" : "02"} — Variáveis</div>
  <table>${varsRows}</table>` : ""}

  ${stepsHTML ? `
  <div class="section-label">${data.conversationalResponse ? "04" : "03"} — Desenvolvimento</div>
  <div class="steps">${stepsHTML}</div>` : ""}

  <div class="section-label">${data.conversationalResponse ? "05" : "04"} — Resultado</div>
  <div class="result-card">
    <div>
      <div class="result-label">${data.resultLabel}</div>
      ${data.resultUnit ? `<div class="result-unit">${data.resultUnit}</div>` : ""}
    </div>
    <div class="result-num">${data.resultFormatted}</div>
  </div>

  ${proofHTML}
  ${noteHTML}
  ${warningHTML}

  <div class="footer">
    <span>Gerado pelo Sigma — calculadora inteligente</span>
    <span>${dateStr}</span>
  </div>
</body>
</html>`;
}

export async function exportAsPDF(data: ResultData): Promise<void> {
  const html = buildHTML(data);
  const { uri: tmpUri } = await Print.printToFileAsync({ html, base64: false });

  const fileName = buildFileName(data);
  const destUri = (FileSystem.cacheDirectory ?? "") + fileName;
  await FileSystem.copyAsync({ from: tmpUri, to: destUri });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Compartilhamento não disponível neste dispositivo");
  }

  await Sharing.shareAsync(destUri, {
    mimeType: "application/pdf",
    dialogTitle: `${data.formulaName} — ${data.resultUnit} ${data.resultFormatted}`,
    UTI: "com.adobe.pdf",
  });

  await FileSystem.deleteAsync(tmpUri, { idempotent: true });
}

export function buildTextSummary(data: ResultData): string {
  const lines: string[] = [
    `σ Sigma — ${data.formulaName}`,
    ``,
    `Resultado: ${data.resultUnit} ${data.resultFormatted} (${data.resultLabel})`,
  ];

  if (data.formulaSymbolic) lines.push(`Fórmula: ${data.formulaSymbolic}`);
  if (data.formulaSubstituted) lines.push(`Cálculo: ${data.formulaSubstituted}`);

  if (data.variables?.length) {
    lines.push(``, `Variáveis:`);
    data.variables.forEach((v) => lines.push(`  ${v.symbol} = ${v.value} (${v.name})`));
  }

  if (data.steps?.length) {
    lines.push(``, `Passo a passo:`);
    data.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
  }

  if (data.proof) {
    lines.push(``, `Verificação: ${data.proof.method} — ${data.proof.verified ? "aprovado" : "revisar"}`);
    lines.push(`  ${data.proof.detail}`);
  }

  if (data.note) lines.push(``, `* ${data.note}`);
  if (data.warning) lines.push(`⚠ ${data.warning}`);

  lines.push(``, `Gerado pelo Sigma — calculadora inteligente`);
  return lines.join("\n");
}

export async function copyToClipboard(data: ResultData): Promise<void> {
  await Clipboard.setStringAsync(buildTextSummary(data));
}
