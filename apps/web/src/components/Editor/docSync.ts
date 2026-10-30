import type { ChangeSpec } from "@codemirror/state";

/**
 * 把编辑器文档 `current` 改成 `next` 的变更列表。逐行对齐，只改真正变化的行，
 * 行内再按字符差分；这样光标停在原来的文字旁，不会被整段替换带走。
 * 空行被删掉（格式化压缩空行）时按删除处理，避免后续整片错位替换。
 * `next` 先按 CodeMirror 的规则统一成 LF，否则孤立的 `\r` 会被当成换行，多出空行。
 */
export function docSyncChanges(current: string, nextRaw: string): ChangeSpec[] {
  const next = nextRaw.replace(/\r\n?/g, "\n");
  const oldLines = current.split("\n");
  const newLines = next.split("\n");
  const changes: ChangeSpec[] = [];
  let i = 0;
  let j = 0;
  let pos = 0; // oldLines[i] 在 current 里的起点

  while (i < oldLines.length && j < newLines.length) {
    const oldLine = oldLines[i];
    const newLine = newLines[j];
    if (oldLine === newLine) {
      pos += oldLine.length + 1;
      i++;
      j++;
      continue;
    }
    // 旧行是空行而新行不是：视为删掉这一行空行（压缩连续空行），连同换行一起删
    if (
      oldLine.trim() === "" &&
      newLine.trim() !== "" &&
      i + 1 < oldLines.length
    ) {
      changes.push({ from: pos, to: pos + oldLine.length + 1 });
      pos += oldLine.length + 1;
      i++;
      continue;
    }
    changes.push(...lineChanges(oldLine, newLine, pos));
    pos += oldLine.length + 1;
    i++;
    j++;
  }

  // 剩余部分：旧文多出的行删掉，新文多出的行补到末尾
  if (i < oldLines.length) {
    changes.push({ from: pos - 1, to: current.length });
  } else if (j < newLines.length) {
    changes.push({
      from: current.length,
      insert: "\n" + newLines.slice(j).join("\n"),
    });
  }
  return changes;
}

// ponytail: 行内 LCS 是 O(n·m)，超过上限的长行退回首尾公共部分之间整段替换
const LCS_LIMIT = 250_000;

/** 同一行从 `a` 改成 `b` 的字符级变更，`offset` 是该行在文档里的起点 */
function lineChanges(a: string, b: string, offset: number): ChangeSpec[] {
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a[start] === b[start]) start++;
  let aEnd = a.length;
  let bEnd = b.length;
  while (aEnd > start && bEnd > start && a[aEnd - 1] === b[bEnd - 1]) {
    aEnd--;
    bEnd--;
  }
  const n = aEnd - start;
  const m = bEnd - start;
  if (n * m > LCS_LIMIT || n === 0 || m === 0) {
    return [
      { from: offset + start, to: offset + aEnd, insert: b.slice(start, bEnd) },
    ];
  }

  // lcs[i * (m + 1) + j]：a[start+i..] 与 b[start+j..] 的最长公共子序列长度
  const lcs = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * (m + 1) + j] =
        a[start + i] === b[start + j]
          ? lcs[(i + 1) * (m + 1) + j + 1] + 1
          : Math.max(lcs[(i + 1) * (m + 1) + j], lcs[i * (m + 1) + j + 1]);
    }
  }

  const changes: ChangeSpec[] = [];
  let pending: { from: number; to: number; insert: string } | null = null;
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i] === b[start + j]) {
      if (pending) changes.push(pending);
      pending = null;
      i++;
      j++;
      continue;
    }
    const at = offset + start + i;
    pending ??= { from: at, to: at, insert: "" };
    if (
      j >= m ||
      (i < n && lcs[(i + 1) * (m + 1) + j] >= lcs[i * (m + 1) + j + 1])
    ) {
      pending.to++;
      i++;
    } else {
      pending.insert += b[start + j];
      j++;
    }
  }
  if (pending) changes.push(pending);
  return changes;
}
