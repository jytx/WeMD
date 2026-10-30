import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FolderCollapse } from "../../components/Sidebar/FolderCollapse";

const renderCollapse = (
  open: boolean,
  renderChildren = () => <span>子项</span>,
) => <FolderCollapse open={open}>{renderChildren}</FolderCollapse>;

describe("FolderCollapse", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("折叠动画结束后才卸载子项", () => {
    const { rerender } = render(renderCollapse(true));
    rerender(renderCollapse(false));
    expect(screen.queryByText("子项")).not.toBeNull();

    act(() => vi.advanceTimersByTime(220));
    expect(screen.queryByText("子项")).toBeNull();
  });

  it("折叠途中重新展开时保留子项", () => {
    const { rerender, container } = render(renderCollapse(true));
    rerender(renderCollapse(false));
    act(() => vi.advanceTimersByTime(100));
    rerender(renderCollapse(true));
    act(() => vi.advanceTimersByTime(500));

    expect(screen.queryByText("子项")).not.toBeNull();
    expect(container.querySelector(".fs-collapse.open")).not.toBeNull();
  });

  it("折叠状态下重渲染不构建隐藏子树", () => {
    const renderChildren = vi.fn(() => <span>子项</span>);
    const { rerender } = render(renderCollapse(false, renderChildren));
    rerender(renderCollapse(false, renderChildren));

    expect(renderChildren).not.toHaveBeenCalled();
  });

  it("开始折叠时子树立即不可聚焦", () => {
    const { rerender, container } = render(renderCollapse(true));
    const collapse = container.querySelector<HTMLElement>(".fs-collapse")!;
    expect(collapse.inert).toBe(false);

    rerender(renderCollapse(false));
    expect(collapse.inert).toBe(true);
  });
});
