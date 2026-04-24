/**
 * Pomocné funkce pro práci s PDF (pdf-lib): načtení, boxy, vkládání značek.
 * Souřadnice PDF: origin vlevo dole, jednotky body (1/72 palce). Převod mm → pt: 1 mm = 72/25.4 pt.
 * Barevný prostor existujícího obsahu PDF neměníme – přidáváme pouze nové vektorové značky (RGB).
 */

import { PDFDocument, rgb, cmyk, type PDFPage } from "pdf-lib";
import type { MarkPosition } from "@/types/grommet";
import type { GrommetMarksParams, MarkColor } from "@/types/grommet";
import type { PdfBox, PdfPageInfo } from "@/types/grommet";
import { computeGrommetMarks } from "./grommet-marks";

/** Převod mm na body (points) – PDF jednotky */
const MM_TO_PT = 72 / 25.4;

/** Maximální činitel měřítka 1:N (ochrana proti extrémním rozměrům / paměti). */
const DRAWING_SCALE_MAX = 100;

/**
 * Normalizuje čitatel N v měřítku výkresu 1:N (1 jednotka na výkrese = N ve skutečnosti).
 * Výstupní stránka se zvětší N×; rozteč, offset a velikost značky jsou v mm skutečného tisku.
 */
export function normalizeDrawingScale(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 1;
  if (value < 1) return 1;
  if (value > DRAWING_SCALE_MAX) return DRAWING_SCALE_MAX;
  return value;
}

/**
 * Načte PDF dokument z pole bytů (ArrayBuffer / Uint8Array).
 */
export async function loadPdfDocument(bytes: ArrayBuffer | Uint8Array) {
  return PDFDocument.load(bytes);
}

/**
 * Vrátí informace o boxech a rozměrech stránky.
 * widthMm/heightMm odpovídají TrimBoxu (výstupní rozměr tisku); fallback na CropBox → MediaBox.
 */
export function getPageInfo(page: PDFPage, pageIndex: number): PdfPageInfo {
  const mediaBox = page.getMediaBox();
  const cropBox = page.getCropBox();
  const bleedBox = page.getBleedBox();
  const trimBox = page.getTrimBox();
  const artBox = page.getArtBox();

  const boxToPdfBox = (b: { x: number; y: number; width: number; height: number }): PdfBox => ({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
  });

  // Výstupní PDF je vždy TrimBox – proto jeho rozměry používáme jako referenci pro výpočet značek.
  // V pdf-lib getTrimBox() nikdy nevrátí null (fallback: CropBox → MediaBox), takže je bezpečné.
  const refBox = trimBox;
  const widthMm = (refBox.width * 25.4) / 72;
  const heightMm = (refBox.height * 25.4) / 72;

  return {
    pageIndex,
    mediaBox: boxToPdfBox(mediaBox),
    cropBox: boxToPdfBox(cropBox),
    bleedBox: boxToPdfBox(bleedBox),
    trimBox: boxToPdfBox(trimBox),
    artBox: boxToPdfBox(artBox),
    widthMm,
    heightMm,
  };
}

/** Možnosti vykreslení značky */
export interface DrawMarkOptions {
  /** Tvar: kruh nebo čtverec */
  shape: "circle" | "square";
  /** Velikost v mm (průměr kruhu / strana čtverce) */
  sizeMm: number;
  /** Barva obrysu – RGB nebo CMYK (hodnoty 0–1), konzistentní v rámci souboru */
  borderColor: MarkColor;
  /** Šířka obrysu v bodech (volitelné) */
  borderWidthPt?: number;
}

/**
 * Vykreslí značky na stránku. Pozice jsou v mm relativně k TrimBoxu (0,0 = levý dolní roh TrimBoxu).
 * Souřadnice se před kreslením přepočítají na absolutní PDF souřadnice pomocí TrimBox.x/y.
 * DŮLEŽITÉ: pdf-lib drawCircle.size = POLOMĚR (ne průměr) → sizeMm je průměr, proto dělíme 2.
 */
export function drawMarksOnPage(
  page: PDFPage,
  positions: MarkPosition[],
  options: DrawMarkOptions
): void {
  const { shape, sizeMm, borderColor, borderWidthPt = 0.5 } = options;
  const sizePt = sizeMm * MM_TO_PT;
  const halfPt = sizePt / 2;

  // Používáme TrimBox jako origin, protože výstupní PDF je vždy ořezán na TrimBox.
  // Pozice značek (v mm od 0,0) se tak korektně promítnou do absolutního souřadnicového systému PDF.
  const trimBox = page.getTrimBox?.() ?? page.getMediaBox();
  const originX = trimBox.x;
  const originY = trimBox.y;

  const color =
    borderColor.type === "rgb"
      ? rgb(borderColor.r, borderColor.g, borderColor.b)
      : cmyk(borderColor.c, borderColor.m, borderColor.y, borderColor.k);

  for (const pos of positions) {
    const xPt = originX + pos.x * MM_TO_PT;
    const yPt = originY + pos.y * MM_TO_PT;

    if (shape === "circle") {
      page.drawCircle({
        x: xPt,
        y: yPt,
        size: halfPt, // pdf-lib: size = poloměr; sizePt = průměr → poloměr = sizePt/2
        color,
        borderColor: color,
        borderWidth: borderWidthPt,
      });
    } else {
      page.drawSquare({
        x: xPt - halfPt,
        y: yPt - halfPt,
        size: sizePt,
        color,
        borderColor: color,
        borderWidth: borderWidthPt,
      });
    }
  }
}

export interface AddGrommetMarksToPdfOptions {
  /**
   * Měřítko výkresu 1:N: výstupní stránka je N× větší než první stránka souboru (grafika se zvětší).
   * Rozteč, offset a velikost značky zadávejte v mm u skutečného (zvětšeného) formátu.
   * Výchozí 1 (1:1) = chování jako dříve (úprava stránky na místě).
   */
  drawingScale?: number;
}

function normalizePageBoxesToTrim(page: PDFPage): void {
  const trim = page.getTrimBox();
  const x = trim.x;
  const y = trim.y;
  const w = trim.width;
  const h = trim.height;
  page.setMediaBox(x, y, w, h);
  page.setCropBox(x, y, w, h);
  page.setBleedBox(x, y, w, h);
  page.setTrimBox(x, y, w, h);
  page.setArtBox(x, y, w, h);
}

/**
 * Nový dokument: první stránka zdroje vykreslená N× větší, poté značky ve stejném souřadnicovém systému.
 */
async function addGrommetMarksToScaledPdf(
  pdfBytes: ArrayBuffer | Uint8Array,
  grommetParams: GrommetMarksParams,
  drawOptions: DrawMarkOptions,
  scale: number
): Promise<Uint8Array> {
  const srcDoc = await loadPdfDocument(pdfBytes);
  const srcPages = srcDoc.getPages();
  if (srcPages.length === 0) throw new Error("PDF neobsahuje žádnou stránku.");

  const srcPage = srcPages[0];
  const outDoc = await PDFDocument.create();
  const embedded = await outDoc.embedPage(srcPage);
  const newW = embedded.width * scale;
  const newH = embedded.height * scale;
  const page = outDoc.addPage([newW, newH]);
  page.drawPage(embedded, {
    x: 0,
    y: 0,
    width: newW,
    height: newH,
  });

  normalizePageBoxesToTrim(page);

  const info = getPageInfo(page, 0);
  const params: GrommetMarksParams = {
    ...grommetParams,
    widthMm: info.widthMm,
    heightMm: info.heightMm,
  };
  const { positions } = computeGrommetMarks(params);
  drawMarksOnPage(page, positions, drawOptions);
  normalizePageBoxesToTrim(page);

  return outDoc.save();
}

/**
 * Načte PDF, přidá značky na první stránku podle parametrů a vrátí nové PDF jako bytes.
 * Při drawingScale větším než 1 vytvoří nový dokument se zvětšenou grafikou (1:N).
 * Výstup je vždy čistý TrimBox: všechny boxy se nastaví na rozměr TrimBoxu, takže
 * výsledné PDF reprezentuje pouze čistý tiskový rozměr s vloženými značkami průchodek.
 * Rozměry a origin pro výpočet/kreslení značek jsou vždy TrimBox (nikoliv ArtBox ani MediaBox).
 */
export async function addGrommetMarksToPdf(
  pdfBytes: ArrayBuffer | Uint8Array,
  grommetParams: GrommetMarksParams,
  drawOptions: DrawMarkOptions,
  options?: AddGrommetMarksToPdfOptions
): Promise<Uint8Array> {
  const scale = normalizeDrawingScale(options?.drawingScale);
  if (scale > 1) {
    return addGrommetMarksToScaledPdf(pdfBytes, grommetParams, drawOptions, scale);
  }

  const doc = await loadPdfDocument(pdfBytes);
  const pages = doc.getPages();
  if (pages.length === 0) throw new Error("PDF neobsahuje žádnou stránku.");

  const page = pages[0];
  const info = getPageInfo(page, 0);

  const params: GrommetMarksParams = {
    ...grommetParams,
    widthMm: info.widthMm,
    heightMm: info.heightMm,
  };
  const { positions } = computeGrommetMarks(params);
  drawMarksOnPage(page, positions, drawOptions);

  // Vždy export čistého TrimBoxu: stránka = pouze rozměr TrimBoxu, bez ořezových značek a bleedu
  normalizePageBoxesToTrim(page);

  return doc.save();
}
