import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormatMenu, FormatRules } from "../../components/Editor/FormatMenu";
import { useEditorStore } from "../../store/editorStore";

describe("FormatMenu", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, String(value));
      }),
    });
    useEditorStore.setState({ markdown: "使用React开发" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("默认开启的规则会格式化全文", () => {
    render(<FormatMenu />);
    fireEvent.click(screen.getByRole("button", { name: "格式化" }));
    fireEvent.click(screen.getByRole("button", { name: "格式化全文" }));
    expect(useEditorStore.getState().markdown).toBe("使用 React 开发");
  });

  it("关闭规则后不再生效，且开关选择被持久化", () => {
    render(<FormatMenu />);
    fireEvent.click(screen.getByRole("button", { name: "格式化" }));
    fireEvent.click(screen.getByLabelText("中英文间加空格"));
    fireEvent.click(screen.getByRole("button", { name: "格式化全文" }));
    expect(useEditorStore.getState().markdown).toBe("使用React开发");
    expect(
      JSON.parse(window.localStorage.getItem("wemd-format-options")!).pangu,
    ).toBe(false);
  });

  it("所有规则都关闭时执行按钮不可用", () => {
    window.localStorage.setItem(
      "wemd-format-options",
      JSON.stringify({ whitespace: false, pangu: false }),
    );
    render(<FormatMenu />);
    fireEvent.click(screen.getByRole("button", { name: "格式化" }));
    expect(screen.getByRole("button", { name: "格式化全文" })).toBeDisabled();
  });

  it("同时挂载的宽窄菜单共享规则，重新打开仍保持选择", () => {
    render(
      <>
        <FormatMenu />
        <div data-testid="compact">
          <FormatRules />
        </div>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "格式化" }));
    const compact = within(screen.getByTestId("compact"));
    fireEvent.click(compact.getByLabelText("中英文间加空格"));
    expect(screen.getAllByLabelText("中英文间加空格")).toHaveLength(2);
    for (const toggle of screen.getAllByLabelText("中英文间加空格")) {
      expect(toggle).not.toBeChecked();
    }
    fireEvent.click(screen.getByRole("button", { name: "格式化" }));
    fireEvent.click(screen.getByRole("button", { name: "格式化" }));
    for (const toggle of screen.getAllByLabelText("中英文间加空格")) {
      expect(toggle).not.toBeChecked();
    }
    fireEvent.click(compact.getByRole("button", { name: "格式化全文" }));
    expect(useEditorStore.getState().markdown).toBe("使用React开发");
  });

  it.each([true, false])(
    "执行后焦点回到当前编辑器，菜单关闭=%s",
    (closeMenu) => {
      render(
        <div className="markdown-editor">
          <div
            className="cm-content"
            contentEditable
            suppressContentEditableWarning
          />
          {closeMenu ? <FormatMenu /> : <FormatRules />}
        </div>,
      );
      if (closeMenu) {
        fireEvent.click(screen.getByRole("button", { name: "格式化" }));
      }
      const run = screen.getByRole("button", { name: "格式化全文" });
      run.focus();
      fireEvent.click(run);
      expect(document.activeElement).toBe(
        document.querySelector(".cm-content"),
      );
      expect(useEditorStore.getState().markdown).toBe("使用 React 开发");
    },
  );

  it("存储被禁用时仍能切换并执行规则", () => {
    vi.mocked(window.localStorage.setItem).mockImplementation(() => {
      throw new DOMException("禁止存储", "SecurityError");
    });
    render(<FormatRules />);
    fireEvent.click(screen.getByLabelText("中英文间加空格"));
    expect(screen.getByLabelText("中英文间加空格")).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "格式化全文" }));
    expect(useEditorStore.getState().markdown).toBe("使用React开发");
  });
});
