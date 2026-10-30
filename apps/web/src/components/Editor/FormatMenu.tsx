import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { SpellCheck } from "lucide-react";
import toast from "react-hot-toast";
import { formatMarkdown, type FormatOptions } from "@wemd/core";

import { Switch } from "../common/Switch";
import { useEditorStore } from "../../store/editorStore";
import {
  getFormatOptions,
  setFormatOptions,
  subscribeFormatOptions,
} from "../../store/formatPreferences";

// example 用「改前 → 改后」直接展示效果，比文字描述更好懂
const RULES: { key: keyof FormatOptions; label: string; example: string }[] = [
  { key: "pangu", label: "中英文间加空格", example: "用React → 用 React" },
  {
    key: "fullwidthPunctuation",
    label: "标点转全角",
    example: "好,走吧! → 好，走吧！",
  },
  { key: "cornerQuotes", label: "引号转直角", example: "“你好” → 「你好」" },
  {
    key: "whitespace",
    label: "清理空白",
    example: "零宽字符、行尾空格、多余空行",
  },
];

/** 规则开关 + 执行按钮；只改 Markdown 源文，代码块、链接、公式等自动跳过 */
export function FormatRules({ onDone }: { onDone?: () => void }) {
  const [options, setOptions] = useState(getFormatOptions);
  useEffect(() => subscribeFormatOptions(setOptions), []);
  const anyEnabled = Object.values(options).some(Boolean);

  const toggle = (key: keyof FormatOptions) => {
    const next = { ...options, [key]: !options[key] };
    // 持久化层同步所有已挂载的宽屏、窄屏菜单。
    setFormatOptions(next);
  };

  const run = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const { markdown, setMarkdown } = useEditorStore.getState();
    const formatted = formatMarkdown(markdown, options);
    if (formatted === markdown) {
      toast("没有需要调整的内容", { duration: 2000 });
    } else {
      setMarkdown(formatted);
      toast.success("已格式化，可在编辑器中撤销（Ctrl/Cmd+Z）", {
        duration: 3000,
      });
    }
    event.currentTarget
      .closest(".markdown-editor")
      ?.querySelector<HTMLElement>(".cm-content")
      ?.focus({ preventScroll: true });
    onDone?.();
  };

  return (
    <div className="format-rules">
      <div className="format-rules-header">格式化规则</div>
      {RULES.map((rule) => (
        <div
          key={rule.key}
          className="format-rule"
          onClick={(event) => {
            // 点开关本身由 Switch 处理，点整行其他位置也能切换
            if ((event.target as Element).closest(".wemd-switch")) return;
            toggle(rule.key);
          }}
        >
          <div className="format-rule-text">
            <span className="format-rule-label">{rule.label}</span>
            <span className="format-rule-example">{rule.example}</span>
          </div>
          <Switch
            label={rule.label}
            checked={options[rule.key]}
            onChange={() => toggle(rule.key)}
          />
        </div>
      ))}
      <div className="format-rules-footer">
        <span className="format-rules-note">代码、链接、公式不受影响</span>
        <button
          type="button"
          className="format-run"
          disabled={!anyEnabled}
          onClick={run}
        >
          <SpellCheck size={14} />
          格式化全文
        </button>
      </div>
    </div>
  );
}

export function FormatMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="md-toolbar-dropdown-container" ref={ref}>
      <button
        type="button"
        className={`md-toolbar-btn ${open ? "active" : ""}`}
        aria-label="格式化"
        aria-expanded={open}
        data-tooltip="格式化"
        onClick={() => setOpen((prev) => !prev)}
      >
        <SpellCheck size={16} />
      </button>
      {open && (
        <div className="md-toolbar-dropdown-menu format-menu">
          <FormatRules onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
