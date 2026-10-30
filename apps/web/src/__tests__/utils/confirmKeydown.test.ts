import { describe, expect, it, vi } from "vitest";
import { handleConfirmKeydown } from "../../utils/confirmKeydown";

const keyEvent = (key: string, isComposing = false, keyCode?: number) => ({
  key,
  nativeEvent: { isComposing, keyCode },
});

describe("handleConfirmKeydown", () => {
  it("Enter 确认，Escape 取消", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    handleConfirmKeydown(keyEvent("Enter"), onConfirm, onCancel);
    handleConfirmKeydown(keyEvent("Escape"), onConfirm, onCancel);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("输入法组词期间的回车与 Escape 不触发动作", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    handleConfirmKeydown(keyEvent("Enter", true), onConfirm, onCancel);
    handleConfirmKeydown(keyEvent("Escape", true), onConfirm, onCancel);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Safari 确认上屏的回车（isComposing 为 false、keyCode 为 229）不触发确认", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    handleConfirmKeydown(keyEvent("Enter", false, 229), onConfirm, onCancel);

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("其他按键不触发动作", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    handleConfirmKeydown(keyEvent("a"), onConfirm, onCancel);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
