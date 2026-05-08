import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
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

  const name = slugify(data.meta?.titulo ?? "calculo");
  return `phormula_${name}_${dd}${mm}${yyyy}.pdf`;
}

function proofTipoLabel(tipo: string): string {
  switch (tipo) {
    case "inversa": return "Prova real";
    case "derivacao": return "Derivação analítica";
    case "substituicao": return "Verificação por substituição";
    case "razoabilidade": return "Verificação de razoabilidade";
    default: return "Verificação";
  }
}

function buildHTML(data: ResultData): string {
  const titulo = data.meta?.titulo ?? "Cálculo";
  const categoria = data.meta?.categoria ?? "Cálculo";
  const subcategoria = data.meta?.subcategoria ?? "";
  const resultValor = data.resultado?.valor ?? "";
  const resultUnidade = data.resultado?.unidade ?? "";
  const formulaAbstrata = data.formula?.abstrata ?? "";
  const variaveis = data.variaveis ?? [];
  const desenvolvimento = data.desenvolvimento ?? [];
  const prova = data.prova ?? null;
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
          ${step.tipo !== "resultado" ? `<span class="step-tipo">${step.tipo}</span>` : ""}
        </div>
      </div>`
    )
    .join("");

  const warningHTML = data.warning
    ? `<p class="warning">⚠ ${data.warning}</p>`
    : "";

  const contextoHTML = data.conversationalResponse
    ? `<div class="section-label">01 — Contexto</div>
       <p class="contexto-text">${data.conversationalResponse}</p>`
    : "";

  const secBase = data.conversationalResponse ? 1 : 0;
  const hasFormula = !!formulaAbstrata;
  const hasVars = varsRows.length > 0;
  const hasSteps = stepsHTML.length > 0;

  let secIdx = secBase;

  const formulaHTML = hasFormula
    ? `<div class="section-label">${String(++secIdx).padStart(2, "0")} — Fórmula</div>
       <div class="formula-box">
         <div class="formula-symbolic">${formulaAbstrata}</div>
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
  const proofSecNum = resSecNum + 1;

  const proofStepsHTML = prova?.steps?.length
    ? `<div class="proof-steps">${prova.steps.map((s) => `<div class="proof-step">$$${s.latex}$$</div>`).join("")}</div>`
    : prova?.latex
      ? `<div class="proof-steps"><div class="proof-step">$$${prova.latex}$$</div></div>`
      : "";

  const proofHTML = prova
    ? `<div class="section-label">${String(proofSecNum).padStart(2, "0")} — Verificação</div>
       <div class="proof-box ${prova.valido ? "proof-ok" : "proof-warn"}">
         <div class="proof-header">
           <span class="proof-icon">${prova.valido ? "✓" : "⚠"}</span>
           <span class="proof-method">${proofTipoLabel(prova.tipo)}</span>
           <span class="proof-badge">${prova.valido ? "aprovado" : "revisar"}</span>
         </div>
         ${proofStepsHTML || `<p class="proof-detail">${prova.descricao}</p>`}
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
  <title>${titulo}</title>
  <meta name="author" content="Phormula — Calculadora Inteligente" />
  <meta name="subject" content="${categoria}" />
  <meta name="description" content="${titulo} — ${subcategoria}: ${resultUnidade} ${resultValor}" />
  <meta name="creator" content="Phormula" />
  <meta name="created" content="${new Date().toISOString()}" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"
    onload="renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false})"></script>
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
    .proof-steps { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
    .proof-step { text-align: center; padding: 6px 0; }
    .warning { font-size: 11px; color: #B07D1A; margin-top: 20px; }
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
      .id-card { background: #EFEFEC !important; }
      .result-card { background: #1A1A18 !important; }
      .proof-ok { background: #F0FAF4 !important; }
      .proof-warn { background: #FBF8ED !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">Φ <span>Phormula</span></div>
      <div class="date">${dateStr}</div>
    </div>
    <div class="date" style="text-align:right;">${categoria}</div>
  </div>

  <div class="id-card">
    <div class="id-card-top">
      <div class="id-title">${titulo}</div>
      ${searchBadge}
    </div>
    <div class="id-meta">
      ${categoria ? `<div class="id-meta-item"><div class="id-meta-label">Categoria</div><div class="id-meta-value">${categoria}</div></div>` : ""}
      <div class="id-meta-item"><div class="id-meta-label">Data</div><div class="id-meta-value">${dateStr}</div></div>
      <div class="id-meta-item"><div class="id-meta-label">Resultado</div><div class="id-meta-value">${resultUnidade ? resultUnidade + " " : ""}${resultValor}</div></div>
    </div>
  </div>

  ${contextoHTML}
  ${formulaHTML}
  ${varsHTML}
  ${desenvolHTML}

  <div class="section-label">${String(resSecNum).padStart(2, "0")} — Resultado</div>
  <div class="result-card">
    <div>
      <div class="result-label">${subcategoria}</div>
      ${resultUnidade ? `<div class="result-unit">${resultUnidade}</div>` : ""}
    </div>
    <div class="result-num">${resultValor}</div>
  </div>

  ${proofHTML}
  ${warningHTML}

  <div class="footer">
    <span>Gerado pelo Phormula — calculadora inteligente</span>
    <span>${dateStr}</span>
  </div>
</body>
</html>`;
}

export async function exportAsPDF(data: ResultData): Promise<void> {
  const html = buildHTML(data);

  if (Platform.OS === "web") {
    const popup = window.open("", "_blank");
    if (!popup) {
      throw new Error("Pop-up bloqueado. Habilite pop-ups para este site e tente novamente.");
    }
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.addEventListener("load", () => {
      popup.focus();
      popup.print();
    });
    setTimeout(() => {
      try { popup.focus(); popup.print(); } catch {}
    }, 800);
    return;
  }

  const { uri: tmpUri } = await Print.printToFileAsync({ html, base64: false });

  const fileName = buildFileName(data);
  const destUri = (FileSystem.cacheDirectory ?? "") + fileName;
  await FileSystem.copyAsync({ from: tmpUri, to: destUri });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Compartilhamento não disponível neste dispositivo");
  }

  const titulo = data.meta?.titulo ?? "Cálculo";
  const resultUnidade = data.resultado?.unidade ?? "";
  const resultValor = data.resultado?.valor ?? "";

  await Sharing.shareAsync(destUri, {
    mimeType: "application/pdf",
    dialogTitle: `${titulo} — ${resultUnidade} ${resultValor}`,
    UTI: "com.adobe.pdf",
  });

  await FileSystem.deleteAsync(tmpUri, { idempotent: true });
}

export function buildTextSummary(data: ResultData): string {
  const titulo = data.meta?.titulo ?? "Cálculo";
  const subcategoria = data.meta?.subcategoria ?? "";
  const resultValor = data.resultado?.valor ?? "";
  const resultUnidade = data.resultado?.unidade ?? "";
  const formulaAbstrata = data.formula?.abstrata ?? "";
  const variaveis = data.variaveis ?? [];
  const desenvolvimento = data.desenvolvimento ?? [];
  const prova = data.prova ?? null;

  const lines: string[] = [
    `Phormula — ${titulo}`,
    ``,
    `Resultado: ${resultUnidade ? resultUnidade + " " : ""}${resultValor}${subcategoria ? " (" + subcategoria + ")" : ""}`,
  ];

  if (formulaAbstrata) lines.push(`Fórmula: ${formulaAbstrata}`);

  if (variaveis.length > 0) {
    lines.push(``, `Variáveis:`);
    variaveis.forEach((v) =>
      lines.push(`  ${v.simbolo} = ${v.unidade ? v.unidade + " " : ""}${v.valor} (${v.descricao})`)
    );
  }

  if (desenvolvimento.length > 0) {
    lines.push(``, `Passo a passo:`);
    desenvolvimento.forEach((step) => lines.push(`  ${step.ordem}. ${step.descricao}`));
  }

  if (prova) {
    const label = proofTipoLabel(prova.tipo);
    lines.push(``, `Verificação: ${label} — ${prova.valido ? "aprovado" : "revisar"}`);
    lines.push(`  ${prova.descricao}`);
  }

  if (data.warning) lines.push(``, `⚠ ${data.warning}`);

  lines.push(``, `Gerado pelo Phormula — calculadora inteligente`);
  return lines.join("\n");
}

export async function copyToClipboard(data: ResultData): Promise<void> {
  await Clipboard.setStringAsync(buildTextSummary(data));
}
