/**
 * Markdown 源文格式化：一组确定性的文本规则，每条规则可单独开关。
 * 代码块、公式块以渲染器实际识别的范围为准整块跳过（含引用、列表里的代码块），
 * front matter、引用定义、行内代码、公式、链接目标、HTML 属性先遮蔽再还原。
 */
import type MarkdownIt from "markdown-it";
import type Ruler from "markdown-it/lib/ruler";
import type StateInline from "markdown-it/lib/rules_inline/state_inline";
import { createMarkdownParser } from "./MarkdownParser";

export interface FormatOptions {
  /** 去零宽字符、nbsp 转空格、行尾空白、连续空行压成一行 */
  whitespace: boolean;
  /** 中文与英文、数字之间补空格（盘古之白） */
  pangu: boolean;
  /** 中文语境下的半角标点转全角 */
  fullwidthPunctuation: boolean;
  /** 引号转直角引号「」『』 */
  cornerQuotes: boolean;
}

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
  whitespace: true,
  pangu: true,
  fullwidthPunctuation: false,
  cornerQuotes: false,
};

const CJK =
  "\\u2e80-\\u2eff\\u2f00-\\u2fdf\\u3040-\\u309f\\u30a0-\\u30ff\\u3100-\\u312f\\u3200-\\u32ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff";
const NEEDS_WORK = new RegExp(`[${CJK}\\u00a0\\u200b\\ufeff\\u2060]`);
const INVISIBLE = /[\u200b\ufeff\u2060]/g;

type FormatterEnv = {
  references?: Record<string, unknown>;
  definitionLines: [number, number][];
  protectedRanges: Map<number, number>;
};

let parser: MarkdownIt | undefined;
const inlineRules = new Map<
  string,
  (state: StateInline, silent: boolean) => boolean
>();

/** 通过公开的启停 API 找到规则，不依赖打包压缩后会变化的函数名。 */
function getRule<T>(ruler: Ruler<T>, name: string): T {
  const rules = ruler.getRules("");
  ruler.disable(name);
  const remaining = new Set(ruler.getRules(""));
  ruler.enable(name);
  return rules.find((rule) => !remaining.has(rule))!;
}

function getParser(): MarkdownIt {
  if (parser) return parser;
  parser = createMarkdownParser();
  // 引用定义不产生 token；复用块规则记录其实际范围，包含引用、列表和跨行定义。
  const reference = getRule(parser.block.ruler, "reference");
  parser.block.ruler.at("reference", (state, start, end, silent) => {
    const matched = reference(state, start, end, silent);
    if (matched && !silent) {
      (state.env as FormatterEnv).definitionLines.push([start, state.line]);
    }
    return matched;
  });
  for (const [char, name] of [
    ["`", "backticks"],
    ["$", "math_inline"],
    ["<", "html_inline"],
  ]) {
    inlineRules.set(char, getRule(parser.inline.ruler, name));
  }
  return parser;
}

/** 目的地和标题交给渲染器的扫描器处理，不自行限制括号嵌套层数。 */
function linkTargetEnd(text: string, start: number, md: MarkdownIt): number {
  let pos = start + 1;
  while (/[ \t\n]/.test(text[pos] ?? "") && pos < text.length) pos++;
  const destination = md.helpers.parseLinkDestination(text, pos, text.length);
  if (!destination.ok) return -1;
  pos = destination.pos;
  const beforeSpace = pos;
  while (/[ \t\n]/.test(text[pos] ?? "") && pos < text.length) pos++;
  if (pos > beforeSpace) {
    const title = md.helpers.parseLinkTitle(text, pos, text.length);
    if (title.ok) {
      pos = title.pos;
      while (/[ \t\n]/.test(text[pos] ?? "") && pos < text.length) pos++;
    }
  }
  return text[pos] === ")" ? pos + 1 : -1;
}

function withMasks(
  text: string,
  env: FormatterEnv,
  transform: (text: string) => string,
): string {
  const md = getParser();
  const state = new md.inline.State(text, md, env, []);
  const spans: { from: number; to: number; word: boolean }[] = [];
  const protect = (from: number, to: number, word = false) =>
    spans.push({ from, to, word });
  const scan = (from: number, to: number) => {
    for (let pos = from; pos < to; ) {
      const char = text[pos];
      const protectedEnd = env.protectedRanges.get(pos);
      if (protectedEnd !== undefined) {
        protect(pos, protectedEnd);
        pos = protectedEnd;
        continue;
      }
      if (char === "\ue000") {
        protect(pos, pos + 1);
        pos++;
        continue;
      }
      if (char === "\\" && /[!-/:-@[-`{-~]/.test(text[pos + 1] ?? "")) {
        protect(pos, pos + 2);
        pos += 2;
        continue;
      }
      const bracket = char === "!" && text[pos + 1] === "[" ? pos + 1 : pos;
      if (text[bracket] === "[") {
        state.pos = bracket;
        state.posMax = to;
        const labelEnd = md.helpers.parseLinkLabel(state, bracket, true);
        if (labelEnd >= 0) {
          const suffix = labelEnd + 1;
          const targetEnd =
            text[suffix] === "(" ? linkTargetEnd(text, suffix, md) : -1;
          if (targetEnd > 0 && targetEnd <= to) {
            scan(bracket + 1, labelEnd);
            protect(suffix, targetEnd);
            pos = targetEnd;
            continue;
          }
          let referenceEnd = labelEnd + 1;
          let label = text.slice(bracket + 1, labelEnd);
          if (text[suffix] === "[") {
            const end = md.helpers.parseLinkLabel(state, suffix);
            if (end >= 0) {
              label = text.slice(suffix + 1, end) || label;
              referenceEnd = end + 1;
            }
          }
          if (env.references?.[md.utils.normalizeReference(label)]) {
            // 显式引用的显示文字可改；折叠、快捷引用的文字也是标识符，必须原样。
            if (
              text[suffix] === "[" &&
              text.slice(suffix, referenceEnd) !== "[]"
            ) {
              scan(bracket + 1, labelEnd);
              protect(suffix, referenceEnd);
            } else {
              protect(pos, referenceEnd);
            }
            pos = referenceEnd;
            continue;
          }
        }
      }
      const rule = inlineRules.get(char);
      if (rule) {
        state.pos = pos;
        state.posMax = to;
        state.pending = "";
        const count = state.tokens.length;
        rule(state, false);
        if (
          state.tokens
            .slice(count)
            .some((token) =>
              ["code_inline", "math_inline", "html_inline"].includes(
                token.type,
              ),
            )
        ) {
          const raw =
            char === "<" &&
            text
              .slice(pos, state.pos)
              .match(/^<(pre|script|style|textarea)\b/i);
          if (raw) {
            const close = new RegExp(`</${raw[1]}\\s*>`, "i").exec(
              text.slice(state.pos, to),
            );
            state.pos = close ? state.pos + close.index + close[0].length : to;
          }
          protect(pos, state.pos, char !== "<");
          pos = state.pos;
          continue;
        }
        if (state.pos > pos) {
          pos = state.pos;
          continue;
        }
      }
      // 裸 URL 的括号和中文路径均是合法地址字符，只在空白、全角标点处截止。
      const match = /[h<{]/.test(char)
        ? text
            .slice(pos, to)
            .match(
              /^(?:https?:\/\/[^\s<>\u3000-\u303f\uff00-\uffef]+|<[^>\n]+>|\{(?:[^}"']|"[^"]*"|'[^']*')*\})/,
            )
        : null;
      if (match) {
        protect(pos, pos + match[0].length, /^https?:/.test(match[0]));
        pos += match[0].length;
      } else {
        pos++;
      }
    }
  };
  scan(0, text.length);

  // 原文里的标记字符也已单独保护；类型和编号不依赖有限的 Unicode 字符区间。
  const marker = "\ue000";
  const saved: string[] = [];
  const chunks: string[] = [];
  let end = 0;
  for (const span of spans) {
    chunks.push(text.slice(end, span.from));
    const id = saved.push(text.slice(span.from, span.to)) - 1;
    const key = `${marker}${span.word ? "w" : "i"}${id}${marker}`;
    chunks.push(span.word ? `A${key}A` : key);
    end = span.to;
  }
  chunks.push(text.slice(end));
  return transform(chunks.join("")).replace(
    new RegExp(`A${marker}w(\\d+)${marker}A|${marker}i(\\d+)${marker}`, "g"),
    (_, word: string, inert: string) => saved[Number(word ?? inert)],
  );
}

function convertQuotes(text: string): string {
  const pair = (open: string, close: string) =>
    new RegExp(
      `${open}([^${open}${close}\\n]*[${CJK}][^${open}${close}\\n]*)${close}`,
      "g",
    );
  return text
    .replace(pair("“", "”"), "「$1」")
    .replace(pair('"', '"'), "「$1」")
    .replace(pair("‘", "’"), "『$1』");
}

const HALF_TO_FULL: Record<string, string> = {
  ",": "，",
  ";": "；",
  ":": "：",
  "!": "！",
  "?": "？",
  ".": "。",
};
const CJK_PAREN = new RegExp(`\\(([^()\\n]*[${CJK}][^()\\n]*)\\)`, "g");
// 前一个字符是中文（或全角收尾符）才转；`.` 只在句末转，避免破坏 `中文.com`；
// `![` 是图片、`:smile:` 是 emoji 短码，保持原样
const CJK_PUNCT = new RegExp(
  `(?<=[${CJK}」』）])(?:[,;?]|:(?![\\w+-]+:)|!(?!\\[)|\\.(?=\\s|$|[${CJK}]))`,
  "g",
);

function convertPunctuation(text: string): string {
  // 括号先转（由内向外，含中文才转），收尾标点再看前一个字符，保证一次到位
  let prev;
  do {
    prev = text;
    text = text.replace(CJK_PAREN, "（$1）");
  } while (text !== prev);
  return text.replace(CJK_PUNCT, (char) => HALF_TO_FULL[char]);
}

function addPanguSpace(text: string): string {
  const word = "A-Za-z0-9";
  return text
    .replace(new RegExp(`([${CJK}])([${word}])`, "g"), "$1 $2")
    .replace(new RegExp(`([${word}])([${CJK}])`, "g"), "$1 $2");
}

function formatParagraph(
  text: string,
  options: FormatOptions,
  env: FormatterEnv,
): string {
  if (!options.whitespace && !NEEDS_WORK.test(text)) return text;
  return withMasks(text, env, (masked) => {
    if (options.whitespace) {
      masked = masked.replace(INVISIBLE, "").replace(/\u00a0/g, " ");
    }
    if (options.cornerQuotes) masked = convertQuotes(masked);
    if (options.fullwidthPunctuation) masked = convertPunctuation(masked);
    if (options.pangu) masked = addPanguSpace(masked);
    if (options.whitespace) {
      masked = masked
        .split("\n")
        .map(trimEnd)
        .filter(
          (line, index, lines) =>
            line !== "" || index === 0 || lines[index - 1] !== "",
        )
        .join("\n");
    }
    return masked;
  });
}

/** 行尾两个及以上空格是 Markdown 硬换行，保留；其余行尾空白去掉 */
function trimEnd(line: string): string {
  return /\S {2,}$/.test(line) ? line : line.replace(/[ \t\u3000]+$/, "");
}

/** 渲染器认定为代码、公式的行，以及 front matter、引用定义行 */
function protectedLines(lines: string[], env: FormatterEnv): boolean[] {
  const flags = lines.map(() => false);
  const mark = (from: number, to: number) => {
    for (let i = from; i < to && i < flags.length; i++) flags[i] = true;
  };

  // front matter 必须有收尾的 `---`，否则首行 `---` 只是分割线
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
    if (end > 0) mark(0, end + 1);
  }

  for (const token of getParser().parse(lines.join("\n"), env)) {
    if (!token.map) continue;
    if (
      token.type === "fence" ||
      token.type === "code_block" ||
      token.type === "math_block"
    ) {
      mark(token.map[0], token.map[1]);
    }
  }
  for (const [from, to] of env.definitionLines) mark(from, to);
  return flags;
}

export function formatMarkdown(
  markdown: string,
  options: FormatOptions = DEFAULT_FORMAT_OPTIONS,
): string {
  if (!Object.values(options).some(Boolean)) return markdown;

  const eol = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = markdown.split(/\r?\n/);
  const env: FormatterEnv = { definitionLines: [], protectedRanges: new Map() };
  const skip = protectedLines(lines, env);
  let offset = 0;
  let start = -1;
  lines.forEach((line, index) => {
    if (skip[index] && start < 0) start = offset;
    if (start >= 0 && !skip[index + 1]) {
      env.protectedRanges.set(start, offset + line.length);
      start = -1;
    }
    offset += line.length + 1;
  });
  return formatParagraph(lines.join("\n"), options, env).replace(/\n/g, eol);
}
