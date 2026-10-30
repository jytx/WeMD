import { DEFAULT_FORMAT_OPTIONS, type FormatOptions } from "@wemd/core";

const STORAGE_KEY = "wemd-format-options";

const listeners = new Set<(options: FormatOptions) => void>();

/** 读取格式化规则开关；缺失或损坏时回落到默认值，新增规则自动取默认 */
export function getFormatOptions(): FormatOptions {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    const options = { ...DEFAULT_FORMAT_OPTIONS };
    for (const key of Object.keys(options) as (keyof FormatOptions)[]) {
      if (typeof saved?.[key] === "boolean") options[key] = saved[key];
    }
    return options;
  } catch {
    return { ...DEFAULT_FORMAT_OPTIONS };
  }
}

export function setFormatOptions(options: FormatOptions): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  } catch {
    // 存储不可用时，当前已打开的菜单仍可共同调整规则。
  }
  listeners.forEach((listener) => listener(options));
}

export function subscribeFormatOptions(
  listener: (options: FormatOptions) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
