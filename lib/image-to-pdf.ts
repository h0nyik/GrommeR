/**
 * Vytvoření PDF z rastrového obrázku (JPG, PNG, TIFF, WebP, GIF, BMP).
 * Obrázek se vloží v plném rozlišení (1 px = 1 pt) – bez přeškálování.
 * JPG/PNG: pdf-lib vkládá původní bajty bez rekomprese.
 * TIFF: JPEG-in-TIFF jde přímo; ostatní lossless TIFF → lossless PNG.
 */

import { PDFDocument } from "pdf-lib";
import { prepareRasterForPdfEmbed } from "./image-decode";
import {
  isSupportedImageType,
  SUPPORTED_IMAGE_TYPES,
  type SupportedImageType,
} from "./input-formats";

export { isSupportedImageType, SUPPORTED_IMAGE_TYPES, type SupportedImageType };

/** Převod bodů na mm (pro rozměry stránky) */
const PT_TO_MM = 25.4 / 72;

async function embedRasterImage(
  doc: PDFDocument,
  bytes: Uint8Array,
  mimeType: SupportedImageType
) {
  const prepared = await prepareRasterForPdfEmbed(bytes, mimeType);
  return prepared.mimeType === "image/jpeg"
    ? doc.embedJpg(prepared.bytes)
    : doc.embedPng(prepared.bytes);
}

/**
 * Vytvoří jednostránkové PDF s obrázkem na celou stránku.
 * Obrázek není přeškálován ani měněn barevně.
 */
export async function createPdfFromImage(
  imageBytes: ArrayBuffer | Uint8Array,
  mimeType: SupportedImageType
): Promise<Uint8Array> {
  const bytes =
    imageBytes instanceof Uint8Array ? imageBytes : new Uint8Array(imageBytes);
  const doc = await PDFDocument.create();
  const image = await embedRasterImage(doc, bytes, mimeType);

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
  const bytes =
    imageBytes instanceof Uint8Array ? imageBytes : new Uint8Array(imageBytes);
  const doc = await PDFDocument.create();
  const image = await embedRasterImage(doc, bytes, mimeType);
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
    userUnit: 1,
    mediaBox: box,
    cropBox: box,
    bleedBox: box,
    trimBox: box,
    artBox: box,
    widthMm,
    heightMm,
  };
}
