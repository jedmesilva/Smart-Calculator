/* ═══════════════════════════════════════════════════════
   Renderizador de LaTeX → SVG (server-side via MathJax)
   Inicializa uma única instância e reutiliza para todas as chamadas.
   ═══════════════════════════════════════════════════════ */

import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

const EX_TO_PX = 10;

let _doc: ReturnType<typeof mathjax.document> | null = null;

function getDoc() {
  if (!_doc) {
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    _doc = mathjax.document("", {
      InputJax: new TeX({ packages: AllPackages }),
      OutputJax: new SVG({ fontCache: "local" }),
    });
  }
  return _doc;
}

export function latexToSvg(latex: string): string | null {
  try {
    const doc = getDoc();
    const node = doc.convert(latex, { display: true });
    const adaptor = (doc as any).adaptor ?? liteAdaptor();
    const html: string = adaptor.outerHTML(node);

    const svgMatch = html.match(/<svg[\s\S]*<\/svg>/);
    if (!svgMatch) return null;

    let svg = svgMatch[0];
    svg = svg.replace(/width="([\d.]+)ex"/, (_, v) =>
      `width="${(parseFloat(v) * EX_TO_PX).toFixed(1)}"`
    );
    svg = svg.replace(/height="([\d.]+)ex"/, (_, v) =>
      `height="${(parseFloat(v) * EX_TO_PX).toFixed(1)}"`
    );
    svg = svg.replace(/style="vertical-align:[^"]*"/, "");

    return svg;
  } catch {
    return null;
  }
}
