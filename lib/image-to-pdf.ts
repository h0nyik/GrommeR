/**
 * Vytvoření PDF z rastrového obrázku (JPG, PNG).
 * Obrázek se vloží v plném rozlišení bez změny barev – výstup je PDF.
 * Rozměry stránky = rozměry obrázku v bodech (1 px = 1 pt při 72 DPI).
 */

import { PDFDocument } from "pdf-lib";

/** Podporované typy obrázků */
export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

export function isSupportedImageType(mime: string): mime is SupportedImageType {
  return SUPPORTED_IMAGE_TYPES.includes(mime as SupportedImageType);
}

/** Převod bodů na mm (pro rozměry stránky) */
const PT_TO_MM = 25.4 / 72;

/**
 * Vytvoří jednostránkové PDF s obrázkem na celou stránku.
 * Obrázek není přeškálován ani měněn barevně.
 */
export async function createPdfFromImage(
  imageBytes: ArrayBuffer | Uint8Array,
  mimeType: SupportedImageType
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const image =
    mimeType === "image/jpeg"
      ? await doc.embedJpg(imageBytes)
      : await doc.embedPng(imageBytes);

  const widthPt = image.width;
  const heightPt = image.height;
  const page = doc.addPage([widthPt, heightPt]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: widthPt,
    height: heightPt,
  });

  return doc.save();
}

const MM_TO_PT = 72 / 25.4;

/**
 * Vrátí rozměry obrázku v mm (bez načtení do PDF – z embedu).
 * Pro náhled a výpočet značek při práci s obrázkem.
 */
export async function getImageDimensionsMm(
  imageBytes: ArrayBuffer | Uint8Array,
  mimeType: SupportedImageType
): Promise<{ widthMm: number; heightMm: number }> {
  const doc = await PDFDocument.create();
  const image =
    mimeType === "image/jpeg"
      ? await doc.embedJpg(imageBytes)
      : await doc.embedPng(imageBytes);
  return {
    widthMm: image.width * PT_TO_MM,
    heightMm: image.height * PT_TO_MM,
  };
}

/**
 * Vytvoří PdfPageInfo z rozměrů v mm (pro obrázky – všechny boxy stejné).
 */
export function createPageInfoFromDimensionsMm(
  widthMm: number,
  heightMm: number
): import("@/types/grommet").PdfPageInfo {
  const widthPt = widthMm * MM_TO_PT;
  const heightPt = heightMm * MM_TO_PT;
  const box = { x: 0, y: 0, width: widthPt, height: heightPt };
  return {
    pageIndex: 0,
    mediaBox: box,
    cropBox: box,
    bleedBox: box,
    trimBox: box,
    artBox: box,
    widthMm,
    heightMm,
  };
}
