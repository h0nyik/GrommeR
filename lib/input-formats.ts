/**
 * Podporované vstupní formáty (PDF + rastr) – jednotná detekce pro UI, Tauri a zpracování.
 */

export const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
  "image/gif",
  "image/bmp",
] as const;

export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

export type InputFileKind = "pdf" | SupportedImageType;

/** Přípony pro dialog Tauri a dokumentaci. */
export const INPUT_IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "tif",
  "tiff",
  "webp",
  "gif",
  "bmp",
] as const;

const INPUT_FILE_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/tiff,image/webp,image/gif,image/bmp";

const EXTENSION_TO_MIME: Record<string, SupportedImageType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

const MIME_ALIASES: Record<string, SupportedImageType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/tiff": "image/tiff",
  "image/x-tiff": "image/tiff",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
  "image/bmp": "image/bmp",
  "image/x-ms-bmp": "image/bmp",
};

/** Krátký popis formátů pro chybové hlášky a nápovědu. */
export const SUPPORTED_FORMATS_LABEL =
  "PDF, JPG, PNG, TIFF, WebP, GIF, BMP";

export function isSupportedImageType(mime: string): mime is SupportedImageType {
  return SUPPORTED_IMAGE_TYPES.includes(mime as SupportedImageType);
}

export function isImageKind(kind: InputFileKind): kind is SupportedImageType {
  return kind !== "pdf";
}

export function getMimeFromFilename(fileName: string): SupportedImageType | "application/pdf" | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  for (const [ext, mime] of Object.entries(EXTENSION_TO_MIME)) {
    if (lower.endsWith(ext)) return mime;
  }
  return null;
}

export function getInputFileKind(file: File): InputFileKind | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";

  const fromMime = MIME_ALIASES[file.type];
  if (fromMime) return fromMime;

  for (const [ext, mime] of Object.entries(EXTENSION_TO_MIME)) {
    if (name.endsWith(ext)) return mime;
  }
  return null;
}

export function getFileAcceptAttribute(): string {
  return INPUT_FILE_ACCEPT;
}

export function getTauriFileExtensions(): string[] {
  return ["pdf", ...INPUT_IMAGE_EXTENSIONS];
}

/** Odstraní známé vstupní přípony (PDF i rastr) z názvu souboru. */
export function stripInputExtension(fileName: string): string {
  return fileName.replace(/\.(pdf|jpe?g|png|tiff?|webp|gif|bmp)$/i, "").trim();
}
