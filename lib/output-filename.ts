/**
 * Generátor názvu výstupního souboru dle konvence:
 * <BASE>__<SIRKA>x<VYSKA><jednotka>__GS<SPACING>__TISK.pdf
 */

const MAX_BASE_LENGTH = 25;
const SAFE_BASE_REGEX = /[^a-zA-Z0-9_-]/g;
const SUFFIX_REGEX = /\s*[-_]?\s*(final|export|verze|v\d+|rev\d*)\s*$/i;

/**
 * Odstraní diakritiku z řetězce (základní české znaky).
 */
function removeDiacritics(s: string): string {
  const map: Record<string, string> = {
    á: "a", č: "c", ď: "d", é: "e", ě: "e", í: "i", ň: "n", ó: "o", ř: "r",
    š: "s", ť: "t", ú: "u", ů: "u", ý: "y", ž: "z",
    Á: "A", Č: "C", Ď: "D", É: "E", Ě: "E", Í: "I", Ň: "N", Ó: "O", Ř: "R",
    Š: "S", Ť: "T", Ú: "U", Ů: "U", Ý: "Y", Ž: "Z",
  };
  return s.replace(/[^\x00-\x7F]/g, (c) => map[c] ?? c);
}

/**
 * Zjednoduší původní název souboru na bezpečný BASE:
 * odstraní příponu .pdf, suffixy (final, export, v3…), zkrátí, nahradí diakritiku a nebezpečné znaky.
 */
export function sanitizeBaseName(originalFileName: string): string {
  let base = originalFileName.replace(/\.pdf$/i, "").trim();
  let prev = "";
  while (prev !== base) {
    prev = base;
    base = base.replace(SUFFIX_REGEX, "").trim();
  }
  base = removeDiacritics(base);
  base = base.replace(SAFE_BASE_REGEX, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (base.length > MAX_BASE_LENGTH) base = base.slice(0, MAX_BASE_LENGTH).replace(/_$/, "");
  return base || "vystup";
}

/**
 * Formátuje rozměr v mm do vhodné jednotky (m nebo cm) a zaokrouhlí (1 desetinné místo).
 * Pro rozměr >= 1000 mm použij metry, jinak cm.
 */
export function formatDimensionMm(valueMm: number): { value: number; unit: "m" | "cm" } {
  if (valueMm >= 1000) {
    return { value: Math.round((valueMm / 1000) * 10) / 10, unit: "m" };
  }
  return { value: Math.round((valueMm / 10) * 10) / 10, unit: "cm" };
}

/**
 * Vrátí řetězec rozměrů pro název souboru, např. "13x2m" nebo "50x24cm".
 * Jednotka společná: metry pokud oba rozměry >= 1000 mm, jinak cm (mm/10).
 */
export function formatDimensionsForFilename(widthMm: number, heightMm: number): string {
  const useM = widthMm >= 1000 && heightMm >= 1000;
  if (useM) {
    const w = Math.round((widthMm / 1000) * 10) / 10;
    const h = Math.round((heightMm / 1000) * 10) / 10;
    return `${w}x${h}m`;
  }
  const w = Math.round(widthMm / 10);
  const h = Math.round(heightMm / 10);
  return `${w}x${h}cm`;
}

/**
 * Vrátí část GS pro název souboru (rozteč v cm).
 * Jedna rozteč: "GS30", dvě různé: "GS30x40".
 */
export function formatSpacingForFilename(
  spacingHorzCm: number,
  spacingVertCm?: number
): string {
  const h = Math.round(spacingHorzCm);
  if (spacingVertCm == null || Math.round(spacingVertCm) === h) return `GS${h}`;
  return `GS${h}x${Math.round(spacingVertCm)}`;
}

export interface GenerateOutputFilenameParams {
  originalFileName: string;
  widthMm: number;
  heightMm: number;
  /** Rozteč v cm (pro jednu hodnotu nebo horizontální). */
  spacingCm: number;
  /** Volitelná vertikální rozteč v cm (pokud jiná než horizontální). */
  spacingVertCm?: number;
}

/**
 * Vygeneruje celý název výstupního souboru dle konvence.
 */
export function generateOutputFilename(params: GenerateOutputFilenameParams): string {
  const {
    originalFileName,
    widthMm,
    heightMm,
    spacingCm,
    spacingVertCm,
  } = params;

  const base = sanitizeBaseName(originalFileName);
  const dimensions = formatDimensionsForFilename(widthMm, heightMm);
  const gs = formatSpacingForFilename(spacingCm, spacingVertCm);

  return `${base}__${dimensions}__${gs}__TISK.pdf`;
}
