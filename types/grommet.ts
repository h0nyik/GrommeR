/**
 * Typy pro výpočet a umístění značek průchodek (grommet marks).
 * Souřadnicový systém: PDF (origin vlevo dole), jednotky dle kontextu (mm pro výpočty).
 */

/** Hrana stránky, na které se umisťují značky */
export type Edge = "top" | "bottom" | "left" | "right";

/** Režim určení počtu značek: pevný počet na hranu, nebo požadovaná rozteč */
export type MarksMode = "count" | "spacing";

/** Jedna pozice značky v souřadnicích stránky (x, y od levého dolního rohu) */
export interface MarkPosition {
  x: number;
  y: number;
  edge: Edge;
}

/** Rozměry plochy (např. ArtBox) v mm */
export interface DimensionsMm {
  widthMm: number;
  heightMm: number;
}

/** Vstupní parametry pro výpočet pozic značek (v mm) */
export interface GrommetMarksParams extends DimensionsMm {
  /** Na kterých hranách umístit značky */
  edges: Edge[];
  /** Offset od rohů – horizontální (pro levou/pravou hranu od horního/dolního okraje) v mm */
  offsetXMm: number;
  /** Offset od rohů – vertikální (pro horní/dolní hranu od levého/pravého okraje) v mm */
  offsetYMm: number;
  /** Režim: počet značek na hranu, nebo rozteč mezi středy */
  mode: MarksMode;
  /** Při mode "count": počet značek na každou vybranou hranu */
  countPerEdge?: number;
  /** Při mode "spacing": rozteč mezi středy značek v mm (horizontální pro top/bottom, vertikální pro left/right) */
  spacingMm?: number;
}

/** Výsledek výpočtu včetně případných varování (hraniční případy) */
export interface GrommetMarksResult {
  positions: MarkPosition[];
  warnings: string[];
}

/** Box stránky PDF (souřadnice v bodech, origin vlevo dole) */
export interface PdfBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Informace o boxech a rozměrech stránky PDF */
export interface PdfPageInfo {
  /** Pořadí stránky (0-based) */
  pageIndex: number;
  /** PDF UserUnit; fyzické rozměry stránky jsou boxy × UserUnit. */
  userUnit: number;
  /** MediaBox – vždy přítomen */
  mediaBox: PdfBox;
  /** CropBox – v pdf-lib výchozí = MediaBox */
  cropBox: PdfBox;
  /** BleedBox (v pdf-lib výchozí = CropBox, pokud není v souboru) */
  bleedBox: PdfBox;
  /** TrimBox (v pdf-lib výchozí = CropBox, pokud není v souboru) */
  trimBox: PdfBox;
  /** ArtBox (v pdf-lib výchozí = CropBox). Pro výpočet značek používáme jako čistý formát. */
  artBox: PdfBox;
  /** Rozměry ArtBox (nebo MediaBox) v mm pro výpočet značek */
  widthMm: number;
  heightMm: number;
}

/** Které boxy zachovat ve výstupním PDF (výchozí: pouze TrimBox) */
export interface PdfBoxesToKeep {
  mediaBox: boolean;
  cropBox: boolean;
  bleedBox: boolean;
  trimBox: boolean;
  artBox: boolean;
}

/** Výchozí: pouze TrimBox zatržen (zbytek se ve výstupu nastaví na MediaBox). */
export const DEFAULT_PDF_BOXES_TO_KEEP: PdfBoxesToKeep = {
  mediaBox: false,
  cropBox: false,
  bleedBox: false,
  trimBox: true,
  artBox: false,
};

/** Barva značky v RGB (hodnoty 0–1). */
export interface MarkColorRgb {
  type: "rgb";
  r: number;
  g: number;
  b: number;
}

/** Barva značky v CMYK (hodnoty 0–1). */
export interface MarkColorCmyk {
  type: "cmyk";
  c: number;
  m: number;
  y: number;
  k: number;
}

/** Barva značky – konzistentní v rámci jednoho souboru. */
export type MarkColor = MarkColorRgb | MarkColorCmyk;
