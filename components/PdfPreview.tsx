"use client";

import { useEffect, useRef, useState } from "react";

const MAX_PREVIEW_PX = 400;
const PDFJS_WORKER_SRC = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

interface PdfPreviewProps {
  file: File | null;
  /** Maximální šířka/výška náhledu v px. */
  maxSize?: number;
}

export function PdfPreview({ file, maxSize = MAX_PREVIEW_PX }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isPdf = file?.type === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf");
    if (!file || !isPdf) {
      setError(null);
      return;
    }
    setError(null);
    let cancelled = false;

    const load = async () => {
      if (typeof window === "undefined") return;
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;

      try {
        const bytes = await file.arrayBuffer();
        if (cancelled) return;
        const pdf = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const viewport = page.getViewport({ scale: 1 });
        let scale = 1;
        if (viewport.width > maxSize || viewport.height > maxSize) {
          scale = Math.min(maxSize / viewport.width, maxSize / viewport.height);
        }
        const scaledViewport = page.getViewport({ scale });
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({
          canvasContext: ctx,
          canvas,
          viewport: scaledViewport,
        }).promise;
      } catch {
        if (!cancelled) setError("Nepodařilo se načíst náhled PDF.");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [file, maxSize]);

  const isPdf = file?.type === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf");
  if (!file || !isPdf) return null;
  if (error) return <p className="text-sm text-amber-600">{error}</p>;

  return (
    <div className="mt-2">
      <p className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">Náhled (1. stránka):</p>
      <canvas
        ref={canvasRef}
        className="max-w-full rounded border border-zinc-200 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800"
        style={{ maxHeight: maxSize }}
      />
    </div>
  );
}
