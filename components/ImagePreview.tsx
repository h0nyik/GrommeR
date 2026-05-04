"use client";

import { useEffect, useRef, useState } from "react";

const MAX_PREVIEW_PX = 400;

interface ImagePreviewProps {
  file: File | null;
  /** Maximální šířka/výška náhledu v px (proxy pro velké obrázky). */
  maxSize?: number;
}

export function ImagePreview({ file, maxSize = MAX_PREVIEW_PX }: ImagePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  const fileKey =
    file && file.type.startsWith("image/")
      ? `${file.name}:${file.size}:${file.lastModified}:${maxSize}`
      : "";
  const [prevFileKey, setPrevFileKey] = useState(fileKey);
  if (fileKey !== prevFileKey) {
    setPrevFileKey(fileKey);
    setError(null);
  }

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
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
      setError("Nepodařilo se načíst náhled.");
      URL.revokeObjectURL(url);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, maxSize]);

  if (!file || !file.type.startsWith("image/")) return null;
  if (error) return <p className="text-sm text-amber-600">{error}</p>;

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
