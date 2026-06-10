/**
 * Načítání vstupních souborů a srozumitelné chyby u velkých PDF (WebView / pdf-lib).
 */

/** Nad tímto limitem se nenačítá náhled PDF (pdf.js) – šetří paměť u velkých plachet. */
export const MAX_PDF_PREVIEW_BYTES = 50 * 1024 * 1024;

/** Horní mez vstupního souboru (ochrana před pádem WebView). */
export const MAX_INPUT_FILE_BYTES = 1_500 * 1024 * 1024;

const MAX_ARRAY_BUFFER_BYTES = 2_147_483_647;

export function formatBytesCs(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace(".", ",")} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} kB`;
  }
  return `${bytes} B`;
}

export function assertInputFileSize(byteLength: number, fileName?: string): void {
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    throw new Error("Soubor má neplatnou velikost.");
  }
  if (byteLength > MAX_INPUT_FILE_BYTES) {
    const label = fileName ? ` (${fileName})` : "";
    throw new Error(
      `Soubor${label} je příliš velký (${formatBytesCs(byteLength)}). ` +
        `Maximální podporovaná velikost je ${formatBytesCs(MAX_INPUT_FILE_BYTES)}. ` +
        `Zkuste PDF zmenšit nebo rozdělit v grafickém programu.`
    );
  }
}

export function assertAllocatableByteLength(byteLength: number, context: string): void {
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    throw new Error(`${context}: neplatná velikost výstupu.`);
  }
  if (byteLength > MAX_ARRAY_BUFFER_BYTES) {
    throw new Error(
      `${context}: výsledný soubor je příliš velký (${formatBytesCs(byteLength)}). ` +
        `Zkuste menší zdrojový PDF nebo nižší měřítko výkresu.`
    );
  }
}

/**
 * Převede neznámou výjimku na text pro UI; u RangeError „Invalid array length“ vysvětlí velké PDF.
 */
export function toFriendlyInputError(err: unknown, fallback: string, fileSize?: number): string {
  const sizeHint =
    fileSize != null && fileSize > 0
      ? ` (${formatBytesCs(fileSize)})`
      : "";

  if (err instanceof RangeError || (err instanceof Error && err.message.includes("Invalid array length"))) {
    return (
      `Soubor${sizeHint} je pro aplikaci příliš velký nebo náročný na paměť. ` +
      `U velkých tiskových PDF (stovky MB) zkuste měřítko 1:1, zavřít jiné programy, ` +
      `nebo PDF před exportem zmenšit. Technická chyba: Invalid array length.`
    );
  }

  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

/** Načte bajty souboru; použije cache z Tauri importu, aby se soubor nečetl znovu. */
export async function readInputFileBytes(
  file: File,
  cached?: Uint8Array | ArrayBuffer | null
): Promise<Uint8Array> {
  if (cached) {
    return cached instanceof Uint8Array ? cached : new Uint8Array(cached);
  }
  assertInputFileSize(file.size, file.name);
  const buf = await file.arrayBuffer();
  assertInputFileSize(buf.byteLength, file.name);
  return new Uint8Array(buf);
}

export function shouldLoadPdfPreview(file: File | null): boolean {
  if (!file) return false;
  return file.size <= MAX_PDF_PREVIEW_BYTES;
}

/** BlobPart kompatibilní s TypeScript DOM typy (Uint8Array z pdf-lib). */
export function bytesToBlobPart(bytes: Uint8Array): BlobPart {
  // pdf-lib vrací Uint8Array<ArrayBufferLike>; pro Blob stačí vlastní kopie s ArrayBuffer.
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes as unknown as BlobPart;
  }
  return new Uint8Array(bytes);
}
