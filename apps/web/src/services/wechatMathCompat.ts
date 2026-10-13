import { loadMathJax } from "../utils/mathJaxLoader";
import {
  BOLDSYMBOL_COMMAND,
  getMathJaxLatexCandidates,
  normalizeBoldSymbolText,
} from "./math/formulaLatexPolicy";

const MATHJAX_LOAD_TIMEOUT_MS = 4000;

export interface MathImageRenderResult {
  imageCount: number;
  fallbackCount: number;
}

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> => {
  let timeoutId = 0;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

/** MathJax 在按需加载扩展时会抛出带 retry 承诺的错误，重试耗尽后按普通失败处理 */
const MAX_MATHJAX_RETRIES = 5;

const renderWithMathJaxRetries = async (
  render: () => HTMLElement | Promise<HTMLElement>,
  retriesLeft = MAX_MATHJAX_RETRIES,
): Promise<HTMLElement> => {
  try {
    return await render();
  } catch (error) {
    const retry =
      typeof error === "object" && error !== null && "retry" in error
        ? error.retry
        : undefined;
    if (
      !retry ||
      retriesLeft <= 0 ||
      (typeof retry !== "object" && typeof retry !== "function") ||
      !("then" in retry) ||
      typeof retry.then !== "function"
    ) {
      throw error;
    }

    await retry;
    return renderWithMathJaxRetries(render, retriesLeft - 1);
  }
};

const applyCurrentColor = (svg: SVGElement): void => {
  const isDefaultBlack = (value: string): boolean =>
    ["black", "#000", "#000000", "rgb(0,0,0)", "rgba(0,0,0,1)"].includes(
      value.trim().toLowerCase().replace(/\s+/g, ""),
    );

  const retarget = (el: Element) => {
    // MathJax marks \colorbox / \bbox background shapes explicitly.
    // Recoloring those shapes would make their contents disappear.
    if (el.hasAttribute("data-bgcolor")) return;

    for (const attr of ["fill", "stroke"] as const) {
      const value = el.getAttribute(attr);
      if (value && isDefaultBlack(value)) {
        el.setAttribute(attr, "currentColor");
      }

      if ("style" in el && el.style instanceof CSSStyleDeclaration) {
        const styleValue = el.style.getPropertyValue(attr);
        if (isDefaultBlack(styleValue)) {
          el.style.setProperty(attr, "currentColor");
        }
      }
    }
  };

  retarget(svg);
  svg.querySelectorAll("[fill], [stroke], [style]").forEach(retarget);
};

const renderLatexToSvg = async (
  latex: string,
  display: boolean,
): Promise<SVGElement> => {
  const mathJax = window.MathJax;
  if (!mathJax?.tex2svg && !mathJax?.tex2svgPromise) {
    throw new Error("复杂公式渲染失败");
  }
  if (typeof mathJax.texReset === "function") mathJax.texReset();

  let lastError: unknown;
  for (const candidate of getMathJaxLatexCandidates(latex)) {
    try {
      const container = await renderWithMathJaxRetries(() =>
        mathJax.tex2svgPromise
          ? mathJax.tex2svgPromise(candidate, { display })
          : mathJax.tex2svg!(candidate, { display }),
      );
      if (
        container.textContent?.includes(BOLDSYMBOL_COMMAND) ||
        container.querySelector("mjx-merror, merror, [data-mjx-error]")
      ) {
        throw new Error("MathJax 输出包含未解析的 boldsymbol");
      }
      const svg = container.querySelector("svg");
      if (!svg) throw new Error("MathJax 未输出 SVG");
      const clone = svg.cloneNode(true) as SVGElement;
      const width =
        clone.getAttribute("width") ||
        clone.style.width ||
        clone.style.minWidth;
      const height = clone.getAttribute("height") || clone.style.height;
      const hasViewBox = clone.hasAttribute("viewBox");
      clone.removeAttribute("width");
      clone.removeAttribute("height");
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.style.removeProperty("min-width");
      if (width) clone.style.width = width;
      clone.style.height = hasViewBox || !height ? "auto" : height;
      clone.style.maxWidth = "100%";
      applyCurrentColor(clone);
      if (display) {
        clone.style.display = "block";
        clone.style.margin = "1em auto";
      }
      return clone;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("复杂公式渲染失败");
};

export const renderHighRiskMathAsImages = async (
  container: HTMLElement,
): Promise<MathImageRenderResult> => {
  const formulaNodes = Array.from(
    container.querySelectorAll<HTMLElement>(
      ".inline-equation[data-latex], .block-equation[data-latex]",
    ),
  );

  if (formulaNodes.length === 0) return { imageCount: 0, fallbackCount: 0 };

  await withTimeout(loadMathJax(), MATHJAX_LOAD_TIMEOUT_MS, "MathJax 加载超时");
  if (!window.MathJax?.tex2svg && !window.MathJax?.tex2svgPromise) {
    throw new Error("复杂公式渲染失败");
  }

  let imageCount = 0;
  let fallbackCount = 0;
  for (const node of formulaNodes) {
    const latex = node.getAttribute("data-latex") || "";
    const display = node.classList.contains("block-equation");
    try {
      node.replaceChildren(await renderLatexToSvg(latex, display));
      imageCount += 1;
    } catch {
      // A single unsupported formula should not prevent copying the article.
      // Plain text is less pretty but survives WeChat sanitization reliably.
      node.textContent = display ? `$$${latex}$$` : `$${latex}$`;
      fallbackCount += 1;
    }
    node.removeAttribute("data-latex");
  }

  return { imageCount, fallbackCount };
};

/**
 * 微信复制公式兼容处理。
 * KaTeX 会输出隐藏 MathML 与 TeX annotation，微信清洗后可能暴露源码。
 */
export const stripHiddenMathMarkupForWechat = (
  container: HTMLElement,
): void => {
  container.querySelectorAll(".katex-mathml").forEach((node) => {
    node.remove();
  });

  container
    .querySelectorAll('annotation[encoding="application/x-tex"]')
    .forEach((node) => {
      node.remove();
    });

  container.querySelectorAll<HTMLElement>("[data-latex]").forEach((node) => {
    node.removeAttribute("data-latex");
  });

  normalizeBoldSymbolText(container);

  container
    .querySelectorAll<HTMLElement>(".katex, .katex-html, .base")
    .forEach((node) => {
      node.style.setProperty("white-space", "nowrap", "important");
    });

  container.querySelectorAll<HTMLElement>(".katex-html").forEach((node) => {
    node.style.setProperty("display", "inline-block", "important");
  });

  container.querySelectorAll<HTMLElement>(".base").forEach((node) => {
    node.style.setProperty("display", "inline-block", "important");
    node.style.setProperty("width", "auto", "important");
    node.style.setProperty("min-width", "0", "important");
  });
};
