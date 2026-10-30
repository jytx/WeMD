import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

// 与 FileSidebar.css 中 .fs-collapse 的过渡时长一致
const COLLAPSE_MS = 220;

/**
 * 文件夹子项的展开/折叠过渡。
 * children 为渲染函数，只在挂载期间调用：折叠后既不留 DOM，也不再构建隐藏子树。
 * 中途反向操作会从当前位置平滑回退。
 */
export function FolderCollapse({
  open,
  children,
}: {
  open: boolean;
  children: () => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);
  // 渲染期同步挂载，省掉一帧延迟
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) return;
    setExpanded(false);
    const timer = setTimeout(() => setMounted(false), COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !mounted || expanded) return;
    // 先按收起态算一次样式，过渡才有起点
    ref.current?.getBoundingClientRect();
    setExpanded(true);
  }, [open, mounted, expanded]);

  // 折叠一开始就让子树不可聚焦、不可交互，避免 Tab 落进正在消失的内容
  useLayoutEffect(() => {
    if (ref.current) ref.current.inert = !open;
  }, [open, mounted]);

  if (!mounted) return null;
  return (
    <div ref={ref} className={`fs-collapse ${expanded ? "open" : ""}`}>
      <div className="fs-collapse-inner">{children()}</div>
    </div>
  );
}
