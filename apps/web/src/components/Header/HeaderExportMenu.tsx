import { useEffect, useRef, useState } from "react";
import { ChevronDown, Code, Download, ImageDown } from "lucide-react";

interface HeaderExportMenuProps {
  onCopyAsHtml: () => void;
  onExportLongImage: () => void;
}

/** 顶栏「导出」下拉：点击展开，点击外部或按 Esc 关闭，触屏设备同样可用 */
export function HeaderExportMenu({
  onCopyAsHtml,
  onExportLongImage,
}: HeaderExportMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="header-export-menu" ref={menuRef}>
      <button
        className="btn-secondary header-action-button header-action-secondary"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="导出"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={18} strokeWidth={2} />
        <span>导出</span>
        <ChevronDown className="header-export-chevron" strokeWidth={2} />
      </button>
      {open && (
        <div className="header-export-dropdown" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onCopyAsHtml();
            }}
          >
            <Code size={16} strokeWidth={2} />
            复制 HTML
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onExportLongImage();
            }}
          >
            <ImageDown size={16} strokeWidth={2} />
            导出长图
          </button>
        </div>
      )}
    </div>
  );
}
