import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { history, isolateHistory, undo } from "@codemirror/commands";
import { docSyncChanges } from "../../components/Editor/docSync";

function sync(current: string, next: string, cursor = 0) {
  const state = EditorState.create({
    doc: current,
    selection: { anchor: cursor },
  });
  const after = state.update({ changes: docSyncChanges(current, next) }).state;
  return { doc: after.doc.toString(), cursor: after.selection.main.anchor };
}

describe("docSyncChanges", () => {
  it("任意新旧文本都得到目标文档", () => {
    const cases: [string, string][] = [
      ["", "新内容"],
      ["旧内容", ""],
      ["a\nb\nc", "a\nc"],
      ["a\n\n\n\nb", "a\n\nb"],
      ["a\n  \n\nb", "a\n\nb"],
      ["a", "a\nb\nc"],
      ["a\nb\nc", "x"],
      ["第一行\n第二行", "完全不同\n的文章\n三行"],
      ["\n\n", "x\n"],
      ["\n\n尾行", ""],
      ["a\n\n\n尾行\n", "a\n尾行"],
      ["首行\n\n尾行", "\n新首行\n\n新尾行\n"],
      ["一😀二Vue三", "一😀二 Vue 三"],
    ];
    for (const [current, next] of cases) {
      expect(sync(current, next).doc).toBe(next);
    }
  });

  it("CRLF 目标统一成 LF，不会多出空行", () => {
    expect(sync("旧内容\n末行", "新内容\r\n末行").doc).toBe("新内容\n末行");
    expect(sync("a\n", "b\r\n").doc).toBe("b\n");
    expect(sync("a\nb", "a\rb\r").doc).toBe("a\nb\n");
  });

  it("多处修改之间的光标保持在原文字旁", () => {
    const current = "开头React\n中间段落没有英文\n尾巴Vue";
    const next = "开头 React\n中间段落没有英文\n尾巴 Vue";
    const result = sync(current, next, current.indexOf("段落"));
    expect(result.cursor).toBe(next.indexOf("段落"));
  });

  it("压缩空行后，后面段落的光标跟着前移", () => {
    const current = "a\n\n\n\n结尾段落";
    const next = "a\n\n结尾段落";
    const result = sync(current, next, current.indexOf("段落"));
    expect(result.cursor).toBe(next.indexOf("段落"));
  });

  it("同一行里多处修改，光标仍停在原文字旁", () => {
    const current = "说明(中文),下一句尾巴Vue";
    const next = "说明（中文），下一句尾巴 Vue";
    const result = sync(current, next, current.indexOf("下一句"));
    expect(result.cursor).toBe(next.indexOf("下一句"));
  });

  it("一撤销只撤格式化，前后的输入各自保留独立撤销", () => {
    let state = EditorState.create({
      doc: "使用React\n\n\n尾巴Vue",
      extensions: [history()],
    });
    state = state.update({
      changes: { from: state.doc.length, insert: "输入" },
    }).state;
    const beforeFormat = state.doc.toString();
    const formatted = "使用 React\n\n尾巴 Vue 输入";
    state = state.update({
      changes: docSyncChanges(beforeFormat, formatted),
      annotations: isolateHistory.of("full"),
    }).state;
    state = state.update({
      changes: { from: state.doc.length, insert: "后续" },
    }).state;
    const stepBack = () =>
      undo({
        state,
        dispatch: (transaction) => {
          state = transaction.state;
        },
      });
    expect(stepBack()).toBe(true);
    expect(state.doc.toString()).toBe(formatted);
    expect(stepBack()).toBe(true);
    expect(state.doc.toString()).toBe(beforeFormat);
    expect(stepBack()).toBe(true);
    expect(state.doc.toString()).toBe("使用React\n\n\n尾巴Vue");
  });
});
