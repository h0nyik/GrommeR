"use client";

import { useEffect, useRef, useState } from "react";
import { decodeTiffToRgba, isBrowserNativeImagePreview } from "@/lib/image-decode";
import { getInputFileKind, type SupportedImageType } from "@/lib/input-formats";

const MAX_PREVIEW_PX = 400;

interface ImagePreviewProps {
  file: File | null;
  /** Maximální šířka/výška náhledu v px (proxy pro velké obrázky). */
  maxSize?: number;
}

function drawScaledRgbaToCanvas(
  canvas: HTMLCanvasElement,
  rgba: Uint8Array,
  width: number,
  height: number,
  maxSize: number
): void {
  let w = width;
  let h = height;
  if (w > maxSize || h > maxSize) {
    const r = Math.min(maxSize / w, maxSize / h);
    w = Math.round(w * r);
    h = Math.round(h * r);
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(rgba);
  if (w === width && h === height) {
    ctx.putImageData(imageData, 0, 0);
    return;
  }
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const offCtx = offscreen.getContext("2d");
  if (!offCtx) return;
  offCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(offscreen, 0, 0, w, h);
}

export function ImagePreview({ file, maxSize = MAX_PREVIEW_PX }: ImagePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<{ fileKey: string; message: string } | null>(null);

  const fileKind = file ? getInputFileKind(file) : null;
  const imageKind =
    fileKind && fileKind !== "pdf" ? (fileKind as SupportedImageType) : null;

  const fileKey = file && imageKind
    ? `${file.name}:${file.size}:${file.lastModified}:${maxSize}:${imageKind}`
    : "";

  useEffect(() => {
    if (!file || !imageKind) return;

    let cancelled = false;

    const renderNative = () => {
      const mime = file.type || imageKind;
      const url = URL.createObjectURL(new Blob([file], { type: mime }));
      const img = new Image();
      img.onload = () => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        const canvas = canvasRef.current;
        if (!canvas) {
          URL.revokeObjectURL(url);
          return;
        }
        let w = img.width;
        let h = img.height;
        if (w > maxSize || h > maxSize) {
          const r = Math.min(maxSize / w, maxSize / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        if (!cancelled) {
          setError({ fileKey, message: "Nepodařilo se načíst náhled." });
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
      return () => URL.revokeObjectURL(url);
    };

    if (isBrowserNativeImagePreview(imageKind)) {
      return renderNative();
    }

    void file.arrayBuffer().then((buffer) => {
      if (cancelled) return;
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const { rgba, width, height } = decodeTiffToRgba(new Uint8Array(buffer));
        drawScaledRgbaToCanvas(canvas, rgba, width, height, maxSize);
      } catch {
        if (!cancelled) {
          setError({ fileKey, message: "Nepodařilo se načíst náhled TIFF." });
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [file, fileKey, imageKind, maxSize]);

  if (!file || !imageKind) return null;
  if (error?.fileKey === fileKey) {
    return <p className="text-sm text-amber-600">{error.message}</p>;
  }

  return (
    <div className="mt-2">
      <p className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">Náhled:</p>
      <canvas
        ref={canvasRef}
        className="max-w-full rounded border border-zinc-200 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800"
        style={{ maxHeight: maxSize }}
      />
    </div>
  );
}
