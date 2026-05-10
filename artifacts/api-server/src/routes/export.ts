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

function esc(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildHTML(data: any): string {
  // ── cores idênticas ao app (constants/colors.ts) ──
  const C = {
    bg:      "#F7F6F3",
    panel:   "#EFEFEC",
    surface: "#E8E7E3",
    text:    "#1A1A18",
    mid:     "#6B6B66",
    faint:   "#AEADA8",
    ghost:   "#C8C7C2",
    result:  "#F0EFEB",
  };

  const objetivo       = data.objetivo ?? "";
  const subcategoria   = data.meta?.subcategoria ?? "";
  const resultValor    = data.resultado?.valor ?? "";
  const resultUnidade  = data.resultado?.unidade ?? "";
  const resultInterp   = data.resultado?.interpretacao ?? "";
  const formulaAbstrata = data.formula?.abstrata ?? "";
  const formulaLatex   = data.formula?.latex ?? null;
  const variaveis: any[]    = data.variaveis ?? [];
  const desenvolvimento: any[] = data.desenvolvimento ?? [];

  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit", minute: "2-digit",
  });

  const hasFormula = !!(formulaLatex || formulaAbstrata);
  const hasVars    = variaveis.length > 0;
  const hasSteps   = desenvolvimento.length > 0;

  let secIdx = 0;
  const nextSec = () => String(++secIdx).padStart(2, "0");

  // ── seção genérica (replica DocSection) ──
  function section(num: string, titulo: string, body: string): string {
    return `
    <div class="doc-section">
      <div class="doc-sec-header">
        <span class="doc-sec-num">${num}</span>
        <span class="doc-sec-title">${titulo}</span>
      </div>
      <div class="doc-sec-divider"></div>
      ${body}
    </div>`;
  }

  // ── Fórmula ──
  const formulaBody = hasFormula ? section(nextSec(), "Fórmula", `
    <div class="formula-box">
      ${formulaLatex
        ? `<div class="formula-latex">${renderLatex(formulaLatex)}</div>`
        : `<div class="formula-symbolic">${esc(formulaAbstrata)}</div>`}
    </div>`) : "";

  // ── Variáveis ──
  const varsBody = hasVars ? section(nextSec(), "Variáveis", `
    <div class="vars">
      ${variaveis.map((v, i) => `
        <div class="var-row${i < variaveis.length - 1 ? " var-border" : ""}">
          <div class="var-top">
            <span class="var-symbol">${esc(v.simbolo)}</span>
            <span class="var-name">${esc(v.descricao)}</span>
            <span class="var-value">${v.unidade ? esc(v.unidade) + " " : ""}${esc(v.valor)}</span>
          </div>
          ${v.papel && v.papel !== v.descricao
            ? `<div class="var-bottom"><span class="var-papel">${esc(v.papel)}</span></div>`
            : ""}
        </div>`).join("")}
    </div>`) : "";

  // ── Desenvolvimento ──
  const stepsBody = hasSteps ? `
    <div class="doc-section">
      <div class="doc-sec-header">
        <span class="doc-sec-num">${nextSec()}</span>
        <span class="doc-sec-title">Desenvolvimento</span>
      </div>
      <div class="doc-sec-divider"></div>
      <div class="steps">
        ${desenvolvimento.map((step, i) => {
          const isLast = i === desenvolvimento.length - 1;
          const isResult = step.tipo === "resultado";
          return `
          <div class="step-row">
            <div class="step-track">
              <div class="step-dot${isResult ? " step-dot-result" : ""}"></div>
              ${!isLast ? `<div class="step-line"></div>` : ""}
            </div>
            <div class="step-content">
              <span class="step-text">${esc(step.descricao)}</span>
              ${step.justificativa ? `<span class="step-just">${esc(step.justificativa)}</span>` : ""}
              ${step.latex ? `<div class="step-latex">${renderLatex(step.latex)}</div>` : ""}
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>` : "";

  // ── Resultado ──
  const valorLen = String(resultValor).length;
  const numFontSize = valorLen > 10 ? 22 : valorLen > 6 ? 28 : 36;
  const resultBody = section(nextSec(), "Resultado", `
    <div class="result-card">
      ${resultUnidade ? `<span class="result-unit">${esc(resultUnidade)}</span>` : ""}
      <div class="result-num" style="font-size:${numFontSize}px;line-height:${numFontSize + 6}px">${esc(resultValor)}</div>
      ${subcategoria ? `<span class="result-label">${esc(subcategoria)}</span>` : ""}
      ${resultInterp ? `<span class="result-interp">${esc(resultInterp)}</span>` : ""}
    </div>`);

  const searchBadge = data.searchUsed
    ? `<span class="badge">🌐 pesquisa web</span>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(objetivo) || "Cálculo"}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"/>
  <style>
    @page { size: A4; margin: 0; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', -apple-system, 'Helvetica Neue', sans-serif;
      background: ${C.bg};
      color: ${C.text};
      font-size: 13px;
      line-height: 1.5;
      padding: 44px 44px 40px 44px;
      width: 210mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Header ── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 28px;
      padding-bottom: 16px;
      border-bottom: 1px solid ${C.surface};
      break-inside: avoid; page-break-inside: avoid;
    }
    .logo { font-size: 15px; font-weight: 700; color: ${C.text}; }
    .logo-sub { font-weight: 400; color: ${C.faint}; }
    .header-date { font-size: 10px; color: ${C.faint}; margin-top: 3px; }
    .badge {
      font-size: 10px; font-weight: 500; color: ${C.mid};
      background: ${C.surface}; padding: 3px 8px; border-radius: 7px;
    }

    /* ── Objetivo hero ── */
    .objetivo-hero { margin-bottom: 24px; display: flex; flex-direction: column; gap: 6px; }
    .objetivo-label {
      font-size: 9px; font-weight: 600; color: ${C.ghost};
      text-transform: uppercase; letter-spacing: 1px;
    }
    .objetivo-meta { display: flex; align-items: center; gap: 8px; }
    .objetivo-text { font-size: 20px; font-weight: 600; color: ${C.text}; line-height: 28px; }

    /* ── DocSection ── */
    .doc-section { margin-bottom: 28px; break-inside: avoid; page-break-inside: avoid; }
    .doc-sec-header {
      display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px;
    }
    .doc-sec-num {
      font-size: 10px; font-weight: 600; color: ${C.ghost}; letter-spacing: 0.5px;
    }
    .doc-sec-title {
      font-size: 10px; font-weight: 600; color: ${C.faint};
      letter-spacing: 1px; text-transform: uppercase;
    }
    .doc-sec-divider {
      height: 1px; background: ${C.surface}; margin-bottom: 14px;
    }

    /* ── Fórmula ── */
    .formula-box {
      background: ${C.panel}; border-radius: 12px; padding: 16px;
      display: flex; justify-content: center; align-items: center;
    }
    .formula-symbolic { font-size: 14px; color: ${C.text}; text-align: center; }
    .formula-latex { text-align: center; }

    /* ── Variáveis ── */
    .vars { display: flex; flex-direction: column; }
    .var-row {
      padding: 12px 0; display: flex; flex-direction: column; gap: 3px;
      break-inside: avoid; page-break-inside: avoid;
    }
    .var-border { border-bottom: 1px solid ${C.surface}; }
    .var-top { display: flex; align-items: center; gap: 10px; }
    .var-symbol { font-size: 13px; font-weight: 700; color: ${C.text}; min-width: 22px; }
    .var-name   { font-size: 13px; color: ${C.faint}; flex: 1; }
    .var-value  { font-size: 13px; font-weight: 600; color: ${C.text}; text-align: right; }
    .var-bottom { padding-left: 32px; }
    .var-papel  { font-size: 11px; color: ${C.ghost}; font-style: normal; line-height: 16px; }

    /* ── Desenvolvimento ── */
    .steps { display: flex; flex-direction: column; }
    .step-row {
      display: flex; gap: 14px; align-items: stretch; padding: 2px 0;
      break-inside: avoid; page-break-inside: avoid;
    }
    .step-track {
      display: flex; flex-direction: column; align-items: center; width: 10px; padding-top: 5px;
    }
    .step-dot {
      width: 7px; height: 7px; border-radius: 50%; background: ${C.ghost}; flex-shrink: 0;
    }
    .step-dot-result { background: ${C.text}; }
    .step-line {
      flex: 1; width: 1px; background: ${C.surface}; margin-top: 4px; min-height: 12px;
    }
    .step-content {
      flex: 1; display: flex; flex-direction: column; gap: 6px; padding-bottom: 16px;
    }
    .step-text { font-size: 13px; color: ${C.mid}; line-height: 20px; }
    .step-just { font-size: 11px; color: ${C.ghost}; font-style: italic; line-height: 17px; }
    .step-latex { text-align: center; padding: 4px 0; }

    /* ── Resultado ── */
    .result-card {
      background: ${C.result}; border-radius: 16px;
      padding: 16px 18px; display: flex; flex-direction: column; gap: 2px;
    }
    .result-unit  { font-size: 11px; font-weight: 500; color: ${C.ghost}; line-height: 15px; }
    .result-num   { font-weight: 700; color: ${C.text}; letter-spacing: -1.2px; }
    .result-label { font-size: 11px; font-weight: 500; color: ${C.mid}; text-transform: uppercase; letter-spacing: 0.2px; margin-top: 4px; }
    .result-interp { font-size: 11px; color: ${C.ghost}; font-style: italic; line-height: 16px; margin-top: 2px; }

    /* ── KaTeX ── */
    .katex { font-size: 1em; }
    .katex-display { display: block; text-align: center; margin: 0.4em 0; }

    /* ── Footer ── */
    .doc-footer {
      display: flex; justify-content: space-between; align-items: center;
      padding-top: 20px; border-top: 1px solid ${C.surface}; margin-top: 4px;
      break-inside: avoid; page-break-inside: avoid;
    }
    .doc-footer-text { font-size: 10px; color: ${C.ghost}; }
  </style>
</head>
<body>

  <div class="header">
    <div>
      <div class="logo">Φ <span class="logo-sub">Phormula</span></div>
      <div class="header-date">${dateStr} · ${timeStr}</div>
    </div>
  </div>

  ${objetivo ? `
  <div class="objetivo-hero">
    <div class="objetivo-meta">
      <span class="objetivo-label">Objetivo</span>
      ${searchBadge}
    </div>
    <div class="objetivo-text">${esc(objetivo)}</div>
  </div>` : ""}

  ${formulaBody}
  ${varsBody}
  ${stepsBody}
  ${resultBody}

  <div class="doc-footer">
    <span class="doc-footer-text">Φ Phormula</span>
    <span class="doc-footer-text">${dateStr} · ${timeStr}</span>
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
