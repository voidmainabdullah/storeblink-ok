import { buildCanvasImageFilter, readImageAdjustments } from "@/elements/image/imageAdjustments";
import type { SceneNode } from "@/types";

export type ImageExportFormat = "png" | "jpeg" | "webp";

export type ImageExportOptions = {
  format: ImageExportFormat;
  scale: number;
  quality: number;
  transparent: boolean;
};

type ImageSize = { width: number; height: number };

export const calculateImagePlacement = (
  source: ImageSize,
  destination: ImageSize,
  fit: string,
  positionX: number,
  positionY: number,
) => {
  if (fit === "fill") {
    return { x: 0, y: 0, width: destination.width, height: destination.height };
  }
  const containScale = Math.min(destination.width / source.width, destination.height / source.height);
  const coverScale = Math.max(destination.width / source.width, destination.height / source.height);
  const scale = fit === "contain" || fit === "scale-down" ? containScale : coverScale;
  const width = source.width * scale;
  const height = source.height * scale;
  return {
    x: (destination.width - width) * (positionX / 100),
    y: (destination.height - height) * (positionY / 100),
    width,
    height,
  };
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (/^https?:/i.test(src)) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be loaded for export."));
    image.src = src;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("The browser could not encode the exported image.")),
      type,
      quality,
    );
  });

export const exportImageNode = async (node: SceneNode, options: ImageExportOptions) => {
  const src = typeof node.props.src === "string" ? node.props.src : "";
  if (!src) throw new Error("Add an image before exporting this layer.");
  const image = await loadImage(src);
  const scale = Math.max(0.25, Math.min(4, options.scale));
  const width = Math.max(1, Math.round(node.transform.width * scale));
  const height = Math.max(1, Math.round(node.transform.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas export is unavailable in this browser.");

  const format = options.format === "jpeg" ? "image/jpeg" : `image/${options.format}`;
  if (!options.transparent || options.format === "jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }

  const positionX = Math.max(0, Math.min(100, Number(node.props.imagePositionX ?? 50)));
  const positionY = Math.max(0, Math.min(100, Number(node.props.imagePositionY ?? 50)));
  const fit = String(node.props.objectFit ?? "cover");
  const placement = calculateImagePlacement(
    { width: image.naturalWidth, height: image.naturalHeight },
    { width, height },
    fit,
    positionX,
    positionY,
  );
  const adjustments = readImageAdjustments(node.props.imageAdjustments);
  context.filter = buildCanvasImageFilter({
    ...adjustments,
    blur: adjustments.blur * scale,
  });
  context.globalAlpha = adjustments.opacity / 100;
  context.drawImage(image, placement.x, placement.y, placement.width, placement.height);

  const blob = await canvasToBlob(canvas, format, Math.max(0.1, Math.min(1, options.quality / 100)));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${node.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "image"}.${options.format === "jpeg" ? "jpg" : options.format}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
