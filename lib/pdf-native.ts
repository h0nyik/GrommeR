/**
 * Nativní vložení značek přes Tauri/lopdf – pro velké PDF, kde pdf-lib v WebView selže.
 */

import type { PdfPageInfo } from "@/types/grommet";
import { computeGrommetMarks } from "./grommet-marks";
import type { GrommetMarksParams } from "@/types/grommet";
import type { DrawMarkOptions } from "./pdf-utils";
import {
  addGrommetMarksNative,
  isTauri,
  resolveOutputFilePath,
  type OverwriteStrategy,
} from "./tauri-bridge";

/** Od této velikosti PDF použijeme nativní cestu (lopdf), pokud je k dispozici cesta ke zdroji. */
export const NATIVE_PDF_MARKS_THRESHOLD_BYTES = 40 * 1024 * 1024;

export function canUseNativePdfMarks(options: {
  sourcePath: string | null | undefined;
  fileKind: string | null;
  fileSize: number;
  drawingScale: number;
  hasTargetSize: boolean;
}): boolean {
  return (
    isTauri() &&
    !!options.sourcePath &&
    options.fileKind === "pdf" &&
    options.fileSize >= NATIVE_PDF_MARKS_THRESHOLD_BYTES &&
    options.drawingScale === 1 &&
    !options.hasTargetSize
  );
}

export async function addGrommetMarksNativeFromParams(
  inputPath: string,
  outputPath: string,
  grommetParams: GrommetMarksParams,
  pageInfo: PdfPageInfo,
  drawOptions: DrawMarkOptions
): Promise<void> {
  const params: GrommetMarksParams = {
    ...grommetParams,
    widthMm: pageInfo.widthMm,
    heightMm: pageInfo.heightMm,
  };
  const { positions } = computeGrommetMarks(params);
  await addGrommetMarksNative({
    inputPath,
    outputPath,
    positions: positions.map((p) => ({ x: p.x, y: p.y })),
    shape: drawOptions.shape,
    sizeMm: drawOptions.sizeMm,
    borderColor: drawOptions.borderColor,
    borderWidthPt: drawOptions.borderWidthPt,
  });
}

export async function saveNativeMarksToFolder(
  inputPath: string,
  outputFolder: string,
  suggestedName: string,
  grommetParams: GrommetMarksParams,
  pageInfo: PdfPageInfo,
  drawOptions: DrawMarkOptions,
  overwriteStrategy: OverwriteStrategy
): Promise<string | null> {
  const outputPath = await resolveOutputFilePath(
    outputFolder,
    suggestedName,
    overwriteStrategy
  );
  if (!outputPath) return null;
  await addGrommetMarksNativeFromParams(
    inputPath,
    outputPath,
    grommetParams,
    pageInfo,
    drawOptions
  );
  return outputPath;
}
