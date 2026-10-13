/**
 * 文章导出为长图：复用复制链路的最终 HTML，按手机宽度排版后截图为 PNG
 */

import { toBlob } from "html-to-image";
import toast from "react-hot-toast";
import {
  renderWechatContainer,
  type WechatContainerOptions,
} from "./wechatCopyService";

// 手机常见逻辑宽度，长图和手机上看到的排版一致
const EXPORT_WIDTH = 375;
const PREFERRED_PIXEL_RATIO = 2;
// ponytail: 取 iOS Safari 画布面积上限这一最保守值，桌面端超长文章也会降倍率；需要更清晰时再按平台放宽或改为分段导出
const MAX_CANVAS_AREA = 16_777_216;
// html-to-image 默认会把超过 16384 像素的边等比缩小，这里与它保持一致，倍率才是真实输出值
const MAX_CANVAS_SIDE = 16_384;
// 1×1 浅灰 PNG，图床未开跨域时用它占位，避免整张图导出失败
const IMAGE_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN4+PDhfwAJLAPuzvzE0gAAAABJRU5ErkJggg==";

/** 在画布尺寸上限内取尽量高的倍率，超长文章自动降低清晰度而不是导出失败 */
export function computeExportPixelRatio(width: number, height: number): number {
  if (width <= 0 || height <= 0) return PREFERRED_PIXEL_RATIO;
  const bySide = MAX_CANVAS_SIDE / Math.max(width, height);
  const byArea = Math.sqrt(MAX_CANVAS_AREA / (width * height));
  // 向下取整到千分位，避免浮点误差让画布越过上限
  return (
    Math.floor(Math.min(PREFERRED_PIXEL_RATIO, bySide, byArea) * 1000) / 1000
  );
}

const buildFileName = (markdown: string): string => {
  const heading = markdown.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim();
  const name = (heading || "WeMD 长图").replace(/[\\/:*?"<>|]/g, "_");
  return `${name}.png`;
};

// 图床没开跨域时截图库读不到像素，提前找出来提示用户
const findBlockedImages = async (container: HTMLElement) => {
  const sources = new Set(
    Array.from(container.querySelectorAll("img"))
      .map((img) => img.src)
      .filter((src) => /^https?:/i.test(src)),
  );
  const blocked = await Promise.all(
    Array.from(sources).map(async (src) => {
      try {
        const response = await fetch(src, { mode: "cors" });
        return response.ok ? null : src;
      } catch {
        return src;
      }
    }),
  );
  return blocked.filter((src): src is string => src !== null);
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

// 导出耗时一两秒，期间重复点击（顶栏、浮动工具栏、移动端入口共用）直接忽略
let exporting = false;

export async function exportLongImage(
  markdown: string,
  css: string,
  options: Pick<WechatContainerOptions, "showMacBar"> = {},
): Promise<void> {
  if (exporting) return;
  exporting = true;
  const toastId = toast.loading("正在生成长图...");
  let container: HTMLDivElement | null = null;

  try {
    // 长图不能横向滚动，表格强制换行
    const rendered = await renderWechatContainer(markdown, css, {
      ...options,
      width: `${EXPORT_WIDTH}px`,
      tableWrap: true,
    });
    container = rendered.container;
    // 代码块在长图里自动换行，不依赖复制链路对代码块的处理（#110 可能改回滚动）
    container.querySelectorAll<HTMLElement>("pre > code").forEach((code) => {
      code.style.whiteSpace = "pre-wrap";
      code.style.overflowWrap = "anywhere";
    });
    // 滑动图组在长图里改为纵向排列，全部图片都显示；去掉「左右滑动」提示
    container
      .querySelectorAll<HTMLElement>(".imageflow-layer2")
      .forEach((layer) => {
        layer.style.whiteSpace = "normal";
        layer.style.overflowX = "visible";
      });
    container
      .querySelectorAll<HTMLElement>(".imageflow-layer3")
      .forEach((item) => {
        item.style.display = "block";
        item.style.width = "100%";
        item.style.marginRight = "0";
      });
    container
      .querySelectorAll(".imageflow-caption")
      .forEach((caption) => caption.remove());
    await Promise.all(
      Array.from(container.querySelectorAll("img")).map((img) =>
        img.complete ? undefined : img.decode().catch(() => undefined),
      ),
    );
    const blockedImages = await findBlockedImages(container);
    // 滑动图组等仍可滚动的区域只截可见部分，隐藏滚动条避免它被画进图里
    container.querySelectorAll<HTMLElement>("*").forEach((el) => {
      const { overflowX, overflowY } = getComputedStyle(el);
      if (/auto|scroll/.test(overflowX + overflowY)) {
        el.style.scrollbarWidth = "none";
      }
    });

    const height = container.scrollHeight;
    const blob = await toBlob(container, {
      width: EXPORT_WIDTH,
      height,
      pixelRatio: computeExportPixelRatio(EXPORT_WIDTH, height),
      backgroundColor: "#ffffff",
      imagePlaceholder: IMAGE_PLACEHOLDER,
      // 离屏容器本身透明且固定定位，截图副本要恢复为可见的普通流
      style: { opacity: "1", position: "static", zIndex: "auto" },
    });
    if (!blob) throw new Error("浏览器未生成图片");

    downloadBlob(blob, buildFileName(markdown));
    if (blockedImages.length > 0) {
      // 导出本身成功，用警告而不是报错样式
      toast(
        `长图已导出，${blockedImages.length} 张图片无法读取，已用占位图代替`,
        { id: toastId, icon: "⚠️", duration: 5000 },
      );
    } else {
      toast.success("长图已导出", { id: toastId });
    }
  } catch (error) {
    console.error("导出长图失败:", error);
    const message = error instanceof Error ? error.message : String(error);
    toast.error(`导出长图失败: ${message}`, { id: toastId });
  } finally {
    container?.remove();
    exporting = false;
  }
}
