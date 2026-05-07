import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
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

function buildHTML(data: ResultData): string {
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

  const noteHTML = data.note
    ? `<p class="note">* ${data.note}</p>`
    : "";

  const unitHTML = data.resultUnit ? `<span class="result-unit">${data.resultUnit}</span>` : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
      margin-bottom: 40px;
    }
    .logo {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: #1A1A18;
    }
    .logo span { color: #AEADA8; font-weight: 400; }
    .date { font-size: 11px; color: #AEADA8; margin-top: 4px; }
    .formula-name {
      font-size: 13px;
      font-weight: 600;
      color: #6B6B66;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .result-block {
      background: #EFEFEC;
      border-radius: 16px;
      padding: 28px 32px;
      margin-bottom: 32px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .result-formula-box { flex: 1; }
    .result-symbolic { font-size: 12px; color: #AEADA8; margin-bottom: 6px; }
    .result-substituted { font-size: 15px; font-weight: 700; color: #1A1A18; }
    .result-number-box { text-align: right; }
    .result-label { font-size: 11px; color: #AEADA8; margin-bottom: 4px; }
    .result-unit { font-size: 20px; color: #6B6B66; font-weight: 400; margin-right: 4px; }
    .result-num { font-size: 44px; font-weight: 700; color: #1A1A18; letter-spacing: -2px; line-height: 1; }
    .section-label {
      font-size: 10px;
      font-weight: 600;
      color: #AEADA8;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      margin-bottom: 12px;
      margin-top: 28px;
    }
    table { width: 100%; border-collapse: collapse; }
    tr { border-bottom: 1px solid #E8E7E3; }
    tr:last-child { border-bottom: none; }
    td { padding: 10px 4px; vertical-align: middle; }
    .var-symbol { font-weight: 700; color: #6B6B66; width: 32px; font-size: 13px; }
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
    .note { font-size: 11px; color: #AEADA8; font-style: italic; margin-top: 20px; }
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
      <div class="date">${formatDate()}</div>
    </div>
  </div>

  <div class="formula-name">${data.formulaName}</div>

  <div class="result-block">
    <div class="result-formula-box">
      ${data.formulaSymbolic ? `<div class="result-symbolic">${data.formulaSymbolic}</div>` : ""}
      ${data.formulaSubstituted ? `<div class="result-substituted">${data.formulaSubstituted}</div>` : ""}
    </div>
    <div class="result-number-box">
      <div class="result-label">${data.resultLabel}</div>
      <div>
        ${unitHTML}
        <span class="result-num">${data.resultFormatted}</span>
      </div>
    </div>
  </div>

  ${
    varsRows
      ? `<div class="section-label">Variáveis</div>
         <table>${varsRows}</table>`
      : ""
  }

  ${
    stepsHTML
      ? `<div class="section-label">Passo a passo</div>
         <div class="steps">${stepsHTML}</div>`
      : ""
  }

  ${noteHTML}

  <div class="footer">
    <span>Gerado pelo Sigma — calculadora inteligente</span>
    <span>${data.resultUnit} ${data.resultFormatted}</span>
  </div>
</body>
</html>`;
}

export async function exportAsPDF(data: ResultData): Promise<void> {
  const html = buildHTML(data);
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Compartilhamento não disponível neste dispositivo");
  }

  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: `${data.formulaName} — ${data.resultUnit} ${data.resultFormatted}`,
    UTI: "com.adobe.pdf",
  });
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

  if (data.note) lines.push(``, `* ${data.note}`);

  lines.push(``, `Gerado pelo Sigma — calculadora inteligente`);
  return lines.join("\n");
}

export async function copyToClipboard(data: ResultData): Promise<void> {
  await Clipboard.setStringAsync(buildTextSummary(data));
}
