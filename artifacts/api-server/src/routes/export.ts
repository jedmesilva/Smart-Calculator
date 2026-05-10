import { Router, type IRouter } from "express";
import puppeteer from "puppeteer-core";
import katex from "katex";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ??
  "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";

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

function buildFileName(titulo: string): string {
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

  const name = slugify(titulo || "calculo");
  return `phormula_${name}_${dd}${mm}${yyyy}.pdf`;
}

function buildHTML(data: any): string {
  const objetivo = data.objetivo ?? "";
  const subcategoria = data.meta?.subcategoria ?? "";
  const resultValor = data.resultado?.valor ?? "";
  const resultUnidade = data.resultado?.unidade ?? "";
  const resultInterpretacao = data.resultado?.interpretacao ?? "";
  const formulaAbstrata = data.formula?.abstrata ?? "";
  const variaveis: any[] = data.variaveis ?? [];
  const desenvolvimento: any[] = data.desenvolvimento ?? [];
  const dateStr = formatDate();

  const katexCSS = `
    .katex { font-size: 1.1em; }
    .katex-display { display: block; text-align: center; margin: 0.5em 0; }
  `;

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
    ? `<div class="section-block">
         <div class="section-label">${String(++secIdx).padStart(2, "0")} — Fórmula</div>
         <div class="formula-box">
           ${formulaLatexDoc
             ? `<div class="step-latex">${renderLatex(formulaLatexDoc)}</div>`
             : `<div class="formula-symbolic">${formulaAbstrata}</div>`}
         </div>
       </div>`
    : "";

  const varsHTML = hasVars
    ? `<div class="section-block">
         <div class="section-label">${String(++secIdx).padStart(2, "0")} — Variáveis</div>
         <table>${varsRows}</table>
       </div>`
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
  <title>${objetivo || "Cálculo"}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
  <style>
    ${katexCSS}
    @page {
      size: A4;
      margin: 0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Arial, Helvetica, sans-serif;
      background: #F7F6F3;
      color: #1A1A18;
      font-size: 11px;
      line-height: 1.5;
      padding: 40px 44px 36px 44px;
      width: 210mm;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 14px;
      border-bottom: 1px solid #E0DFD9;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .logo { font-size: 14px; font-weight: 700; color: #1A1A18; }
    .logo span { color: #AEADA8; font-weight: 400; }
    .date { font-size: 9px; color: #AEADA8; margin-top: 3px; }
    .badge {
      font-size: 9px; font-weight: 500; color: #6B6B66;
      background: #E8E7E3; padding: 2px 7px; border-radius: 5px; white-space: nowrap;
    }
    .objetivo-hero {
      margin-bottom: 24px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .objetivo-label {
      font-size: 8px; font-weight: 600; color: #C8C7C2;
      text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;
    }
    .objetivo-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .objetivo-text {
      font-size: 18px; font-weight: 700; color: #1A1A18;
      line-height: 1.25;
    }
    .section-block {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .section-label {
      font-size: 8px; font-weight: 600; color: #AEADA8;
      text-transform: uppercase; letter-spacing: 1.2px;
      margin-bottom: 6px; margin-top: 22px;
      padding-bottom: 5px; border-bottom: 1px solid #E0DFD9;
      break-after: avoid;
      page-break-after: avoid;
    }
    .formula-box {
      background: #EFEFEC; border-radius: 10px; padding: 12px 16px; margin-top: 6px;
      break-inside: avoid; page-break-inside: avoid;
    }
    .formula-symbolic { font-size: 11px; color: #1A1A18; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    tr {
      border-bottom: 1px solid #E0DFD9;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    tr:last-child { border-bottom: none; }
    td { padding: 7px 4px; vertical-align: middle; }
    .var-symbol { font-weight: 700; color: #1A1A18; width: 36px; font-size: 11px; }
    .var-name { color: #AEADA8; font-size: 11px; }
    .var-value { font-weight: 600; text-align: right; font-size: 11px; color: #1A1A18; }
    .steps { margin-top: 6px; }
    .step {
      display: flex; gap: 14px; padding: 8px 0;
      border-bottom: 1px solid #E0DFD9; align-items: flex-start;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .step:last-child { border-bottom: none; }
    .step-num { font-weight: 700; font-size: 9px; color: #C8C7C2; min-width: 18px; padding-top: 2px; }
    .step-body { display: flex; flex-direction: column; gap: 3px; flex: 1; }
    .step-text { font-size: 11px; color: #6B6B66; line-height: 1.55; }
    .step-tipo { font-size: 8px; color: #C8C7C2; text-transform: uppercase; letter-spacing: 0.5px; }
    .result-section {
      break-before: avoid;
      page-break-before: avoid;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .result-card {
      background: #EFEFEC; border-radius: 12px; padding: 14px 18px; margin-top: 6px;
      break-inside: avoid; page-break-inside: avoid;
    }
    .result-unit { font-size: 9px; font-weight: 500; color: #AEADA8; letter-spacing: 0.2px; margin-bottom: 2px; }
    .result-num { font-size: 34px; font-weight: 700; color: #1A1A18; letter-spacing: -1px; line-height: 1.1; }
    .result-label { font-size: 9px; font-weight: 500; color: #6B6B66; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 5px; }
    .result-interpretacao { font-size: 10px; color: #AEADA8; margin-top: 3px; font-style: italic; }
    .katex { font-size: 1em; }
    .katex-display { display: block; text-align: center; margin: 0.4em 0; }
    .step-latex { text-align: center; padding: 4px 0; color: #1A1A18; }
    .footer {
      margin-top: 36px; padding-top: 12px; border-top: 1px solid #E0DFD9;
      font-size: 9px; color: #C8C7C2;
      display: flex; justify-content: space-between;
      break-inside: avoid; page-break-inside: avoid;
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

  <div class="result-section">
    <div class="section-label">${String(resSecNum).padStart(2, "0")} — Resultado</div>
    <div class="result-card">
      ${resultUnidade ? `<div class="result-unit">${resultUnidade}</div>` : ""}
      <div class="result-num">${resultValor}</div>
      ${subcategoria ? `<div class="result-label">${subcategoria}</div>` : ""}
      ${resultInterpretacao ? `<div class="result-interpretacao">${resultInterpretacao}</div>` : ""}
    </div>
  </div>

  <div class="footer">
    <span>Gerado pelo Phormula — calculadora inteligente</span>
    <span>${dateStr}</span>
  </div>
</body>
</html>`;
}

router.post("/export/pdf", requireAuth, async (req, res) => {
  try {
    const data = req.body;

    if (!data || !data.resultado) {
      res.status(400).json({ error: "Dados do cálculo inválidos" });
      return;
    }

    const html = buildHTML(data);
    const fileName = buildFileName(data.meta?.titulo ?? "calculo");

    const browser = await puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0", timeout: 15000 });
      const pdfBuffer = await page.pdf({
        format: "A4",
        margin: { top: "0", bottom: "0", left: "0", right: "0" },
        printBackground: true,
        preferCSSPageSize: true,
      });
      await browser.close();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(Buffer.from(pdfBuffer));
    } catch (err) {
      await browser.close();
      throw err;
    }
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao gerar PDF", detail: err?.message });
  }
});

export default router;
