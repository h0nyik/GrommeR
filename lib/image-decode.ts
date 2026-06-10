/**
 * Dekódování rastrových formátů, které pdf-lib neumí vložit přímo (TIFF, WebP, …).
 *
 * Zásady tiskové kvality:
 * - JPG/PNG: bajty se do PDF vkládají beze změny (pdf-lib nekomprimuje znovu).
 * - TIFF s vloženým JPEG: extrakce JPEG bitstreamu bez dekódování pixelů.
 * - Ostatní TIFF (LZW, ZIP, nekomprimovaný): lossless UTIF → lossless PNG → PDF.
 * - WebP/GIF/BMP: dekód prohlížečem → PNG (beze ztráty u 8bit pixelů; bez přeškálování).
 */

import UTIF from "utif";
import UPNG from "upng-js";
import type { SupportedImageType } from "./input-formats";
import {
  describeTiffQualityPath,
  tryExtractEmbeddedJpegFromTiff,
} from "./tiff-jpeg-extract";

export type PdfEmbedRasterFormat = "image/jpeg" | "image/png";

export interface PreparedRasterForPdf {
  bytes: Uint8Array;
  mimeType: PdfEmbedRasterFormat;
  /** Popis cesty pro diagnostiku (volitelné). */
  qualityNote?: string;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

/** Lossless PNG z RGBA – kopie bufferu kvůli správné délce u subarray. */
function encodeRgbaAsPng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const pixels = rgba.byteOffset === 0 && rgba.byteLength === rgba.buffer.byteLength
    ? rgba
    : rgba.slice();
  const png = UPNG.encode([pixels.buffer], width, height, 0);
  return new Uint8Array(png);
}

function prepareTiffForPdfEmbed(bytes: Uint8Array): PreparedRasterForPdf {
  const embeddedJpeg = tryExtractEmbeddedJpegFromTiff(bytes);
  if (embeddedJpeg) {
    return {
      bytes: embeddedJpeg,
      mimeType: "image/jpeg",
      qualityNote: "TIFF → vložený JPEG beze změny",
    };
  }

  const buffer = toArrayBuffer(bytes);
  const ifds = UTIF.decode(buffer);
  if (ifds.length === 0) {
    throw new Error("TIFF neobsahuje žádnou stránku.");
  }
  const page = ifds[0];
  const pageTags = page as Record<string, number[]>;
  const path = describeTiffQualityPath(pageTags);
  UTIF.decodeImage(buffer, page);
  const rgba = UTIF.toRGBA8(page);
  const width = page.width as number;
  const height = page.height as number;
  if (!width || !height) {
    throw new Error("TIFF má neplatné rozměry.");
  }

  const bps = pageTags["t258"]?.[0] ?? 8;
  let qualityNote = "TIFF → lossless PNG (8 bit/kanál)";
  if (bps > 8) {
    qualityNote =
      "TIFF s hloubkou >8 bit/kanál: pro PDF se použije 8bit RGB (omezení pdf-lib/UTIF). " +
      "Pro maximální kvalitu použijte 8bit TIFF, PNG, nebo JPEG-in-TIFF.";
  } else if (path === "lossy-rgba") {
    qualityNote =
      "TIFF s neobvyklou kompresí: pixelová data mohou být aproximována při dekódování.";
  }

  return {
    bytes: encodeRgbaAsPng(rgba, width, height),
    mimeType: "image/png",
    qualityNote,
  };
}

/**
 * Dekóduje TIFF (včetně CMYK/LZW) do RGBA a zakóduje jako PNG.
 */
export function decodeTiffToPngBytes(bytes: Uint8Array): Uint8Array {
  const prepared = prepareTiffForPdfEmbed(bytes);
  if (prepared.mimeType === "image/jpeg") {
    throw new Error("TIFF obsahuje JPEG – použijte prepareRasterForPdfEmbed.");
  }
  return prepared.bytes;
}

export interface DecodedTiffRgba {
  rgba: Uint8Array;
  width: number;
  height: number;
}

/** Pro náhled TIFF v canvasu (prohlížeč neumí TIFF načíst přes <img>). */
export function decodeTiffToRgba(bytes: Uint8Array): DecodedTiffRgba {
  const buffer = toArrayBuffer(bytes);
  const ifds = UTIF.decode(buffer);
  if (ifds.length === 0) {
    throw new Error("TIFF neobsahuje žádnou stránku.");
  }
  const page = ifds[0];
  UTIF.decodeImage(buffer, page);
  return {
    rgba: UTIF.toRGBA8(page),
    width: page.width as number,
    height: page.height as number,
  };
}

async function decodeViaImageBitmap(bytes: Uint8Array, mimeType: string): Promise<Uint8Array> {
  if (typeof createImageBitmap !== "function") {
    throw new Error(
      `Formát ${mimeType} nelze v tomto prostředí zpracovat. Použijte JPG, PNG nebo TIFF.`
    );
  }
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  const bitmapOptions: ImageBitmapOptions = {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  };
  const bitmap = await createImageBitmap(blob, bitmapOptions);
  try {
    const width = bitmap.width;
    const height = bitmap.height;
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) throw new Error("Canvas kontext není k dispozici.");
      ctx.drawImage(bitmap, 0, 0, width, height);
      const pngBlob = await canvas.convertToBlob({ type: "image/png" });
      return new Uint8Array(await pngBlob.arrayBuffer());
    }
    if (typeof document === "undefined") {
      throw new Error(`Formát ${mimeType} vyžaduje prohlížečové API pro dekódování.`);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("Canvas kontext není k dispozici.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1];
    if (!base64) throw new Error("Nepodařilo se převést obrázek na PNG.");
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } finally {
    bitmap.close();
  }
}

/**
 * Připraví rastr pro pdf-lib: JPEG/PNG beze změny, TIFF dle typu, ostatní → lossless PNG.
 */
export async function prepareRasterForPdfEmbed(
  bytes: Uint8Array,
  mimeType: SupportedImageType
): Promise<PreparedRasterForPdf> {
  if (mimeType === "image/jpeg") {
    return { bytes, mimeType: "image/jpeg", qualityNote: "JPEG beze změny" };
  }
  if (mimeType === "image/png") {
    return { bytes, mimeType: "image/png", qualityNote: "PNG beze změny" };
  }
  if (mimeType === "image/tiff") {
    return prepareTiffForPdfEmbed(bytes);
  }
  return {
    bytes: await decodeViaImageBitmap(bytes, mimeType),
    mimeType: "image/png",
    qualityNote: `${mimeType} → lossless PNG (plné rozlišení, bez přeškálování)`,
  };
}

/** Formáty, které prohlížeč načte přímo přes Blob URL + <img>. */
export function isBrowserNativeImagePreview(mimeType: SupportedImageType): boolean {
  return mimeType !== "image/tiff";
}
