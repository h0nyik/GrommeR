"use client";

import type { PdfPageInfo } from "@/types/grommet";

const BOX_KEYS = ["mediaBox", "cropBox", "bleedBox", "trimBox", "artBox"] as const;
const BOX_LABELS: Record<(typeof BOX_KEYS)[number], string> = {
  mediaBox: "MediaBox",
  cropBox: "CropBox",
  bleedBox: "BleedBox",
  trimBox: "TrimBox",
  artBox: "ArtBox",
};

function formatBoxSize(box: { width: number; height: number }, userUnit: number): string {
  const wMm = ((box.width * userUnit * 25.4) / 72).toFixed(1);
  const hMm = ((box.height * userUnit * 25.4) / 72).toFixed(1);
  const unitInfo = userUnit > 1 ? `, UserUnit ${userUnit.toFixed(3)}` : "";
  return `${box.width.toFixed(0)}×${box.height.toFixed(0)} pt${unitInfo} (${wMm}×${hMm} mm)`;
}

interface PdfBoxesSectionProps {
  pageInfo: PdfPageInfo | null;
  /** Čitatel N v měřítku 1:N – zobrazení skutečného rozměru výstupu (volitelné). */
  drawingScale?: number;
  targetSizeMm?: { widthMm: number; heightMm: number } | null;
}

export function PdfBoxesSection({ pageInfo, drawingScale = 1, targetSizeMm = null }: PdfBoxesSectionProps) {
  if (!pageInfo) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
        <h3 className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">
          PDF boxy
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nahrajte PDF pro zobrazení boxů stránky. Výstup je vždy čistý TrimBox bez ořezových značek.
        </p>
      </section>
    );
  }

  const boxData = {
    mediaBox: pageInfo.mediaBox,
    cropBox: pageInfo.cropBox,
    bleedBox: pageInfo.bleedBox,
    trimBox: pageInfo.trimBox,
    artBox: pageInfo.artBox,
  };

  return (
    <section className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
      <h3 className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">
        PDF boxy
      </h3>
      <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
        Rozměry v souboru (TrimBox):{" "}
        <strong>
          {pageInfo.widthMm.toFixed(1)} × {pageInfo.heightMm.toFixed(1)} mm
        </strong>
        {targetSizeMm ? (
          <>
            {" "}
            → cílové plátno:{" "}
            <strong>
              {targetSizeMm.widthMm.toFixed(1)} × {targetSizeMm.heightMm.toFixed(1)} mm
            </strong>
          </>
        ) : drawingScale > 1 && (
          <>
            {" "}
            → ve skutečném měřítku 1:{drawingScale}:{" "}
            <strong>
              {(pageInfo.widthMm * drawingScale).toFixed(1)} ×{" "}
              {(pageInfo.heightMm * drawingScale).toFixed(1)} mm
            </strong>
          </>
        )}
        . Výstupní PDF je vždy čistý TrimBox – pouze tento rozměr bez ořezových značek, s vloženými značkami.
        Níže rozměry boxů zdrojového souboru pro informaci.
        {pageInfo.userUnit > 1 && ` Soubor používá PDF UserUnit ${pageInfo.userUnit.toFixed(3)} pro velký formát.`}
      </p>
      <ul className="space-y-2">
        {BOX_KEYS.map((key) => (
          <li key={key} className="flex items-center gap-3 text-sm">
            <span className="font-medium">{BOX_LABELS[key]}</span>
            <span className="text-zinc-500 dark:text-zinc-400">
              {formatBoxSize(boxData[key], pageInfo.userUnit)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
