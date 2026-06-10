/**
 * Most mezi webovou aplikací a Tauri (desktop).
 * V prohlížeči jsou funkce no-op / fallback; v Tauri používají nativní dialog a fs.
 */

declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}

/**
 * Detekuje, zda aplikace běží v Tauri prostředí.
 * Tauri v1 injektuje window.__TAURI__, Tauri v2 window.__TAURI_INTERNALS__.
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window.__TAURI__ ?? window.__TAURI_INTERNALS__);
}

export interface AppRuntimeInfo {
  version: string;
  executableName: string | null;
  isPortable: boolean;
}

/** Zavolá nativní Rust příkaz přes Tauri IPC. */
async function invokeCore<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/**
 * Otevře externí URL v systémovém prohlížeči.
 * V Tauri používá opener plugin, ve webu běžné window.open.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Vrátí runtime informace z desktopové části aplikace. */
export async function getAppRuntimeInfo(): Promise<AppRuntimeInfo | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<AppRuntimeInfo>("get_app_runtime_info");
  } catch {
    return null;
  }
}

/** Výsledek otevření souborů v Tauri: soubory + jejich plné cesty + adresář prvního souboru. */
export type OpenFilesResult = {
  files: File[];
  paths: string[];
  defaultSaveDir: string;
  /** Bajty načtené při importu (stejné pořadí jako files) – bez druhého čtení v UI. */
  preloadedBytes: Uint8Array[];
};

/**
 * Průběh importu (čtení souborů ze zdroje, typicky pomalé u velkých grafik ze sítě).
 * Hlásí, kolikátý soubor z celkového počtu se právě načítá.
 */
export interface ImportProgress {
  current: number;
  total: number;
  fileName: string;
}

import { getMimeFromFilename, getTauriFileExtensions } from "./input-formats";

function getMimeTypeFromPath(pathStr: string): string {
  return getMimeFromFilename(pathStr) ?? "application/octet-stream";
}

function getDirnameFromPath(pathStr: string): string {
  const lastSep = Math.max(pathStr.lastIndexOf("/"), pathStr.lastIndexOf("\\"));
  return lastSep >= 0 ? pathStr.slice(0, lastSep) : "";
}

async function filesFromPaths(
  selectedPaths: string[],
  onProgress?: (progress: ImportProgress) => void
): Promise<OpenFilesResult> {
  const files: File[] = [];
  const preloadedBytes: Uint8Array[] = [];
  const filePaths: string[] = [];
  let defaultSaveDir = "";
  const validPaths = selectedPaths.filter(Boolean);
  for (let i = 0; i < validPaths.length; i++) {
    const pathStr = validPaths[i];
    filePaths.push(pathStr);
    if (i === 0) defaultSaveDir = getDirnameFromPath(pathStr);
    const name = pathStr.replace(/^.*[\\/]/, "");
    // Ohlásíme začátek čtení tohoto souboru (důležité u velkých grafik ze sítě).
    onProgress?.({ current: i + 1, total: validPaths.length, fileName: name });
    // Čtení přes nativní Rust příkaz – funguje i pro síťové/UNC cesty mimo fs scope.
    const buffer = await invokeCore<ArrayBuffer>("read_file_bytes", { path: pathStr });
    const bytes = new Uint8Array(buffer);
    preloadedBytes.push(bytes);
    files.push(new File([bytes], name, { type: getMimeTypeFromPath(pathStr) }));
  }
  return { files, paths: filePaths, defaultSaveDir, preloadedBytes };
}

/**
 * Zapíše bajty do výstupní složky (bez Blob.arrayBuffer – méně kopií u velkých PDF).
 */
export async function saveBytesToFolder(
  bytes: Uint8Array,
  outputFolder: string,
  suggestedName: string,
  overwriteStrategy: OverwriteStrategy = "overwrite"
): Promise<string | null> {
  if (!isTauri()) return null;
  const targetPath = await resolveOutputFilePath(
    outputFolder,
    suggestedName,
    overwriteStrategy
  );
  if (!targetPath) return null;
  await invokeCore<void>("write_file_bytes", { path: targetPath, contents: bytes });
  return targetPath;
}

/** Načte bajty souboru z disku (Tauri) – pro opětovné načtení velkých PDF bez držení v paměti UI. */
export async function readFileBytesFromPath(path: string): Promise<Uint8Array> {
  const buffer = await invokeCore<ArrayBuffer>("read_file_bytes", { path });
  return new Uint8Array(buffer);
}

/**
 * Dialog „Uložit jako“ a zápis bajtů na zvolenou cestu.
 */
export async function saveBytesViaTauri(
  bytes: Uint8Array,
  suggestedName: string,
  defaultDir?: string | null
): Promise<boolean> {
  if (!isTauri()) return false;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const sep = (defaultDir ?? "").includes("/") ? "/" : "\\";
  const defaultPath =
    defaultDir && defaultDir.length > 0
      ? `${defaultDir.replace(/[/\\]*$/, "")}${sep}${suggestedName}`
      : suggestedName;
  const path = await save({
    defaultPath,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (path == null) return false;
  await invokeCore<void>("write_file_bytes", { path, contents: bytes });
  return true;
}

/** V Tauri otevře dialog pro výběr souborů; v prohlížeči vrátí null (použijte <input type="file">). */
export async function openFilesViaTauri(
  options: {
    multiple: boolean;
    accept?: string;
  },
  onProgress?: (progress: ImportProgress) => void
): Promise<OpenFilesResult | null> {
  if (!isTauri()) return null;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const pathOrPaths = await open({
      multiple: options.multiple,
      directory: false,
      filters: options.accept
        ? [{ name: "PDF a obrázky", extensions: getTauriFileExtensions() }]
        : undefined,
    });
    if (pathOrPaths == null) return null;
    const selectedPaths = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];
    const paths = selectedPaths
      .map((p) => (typeof p === "string" ? p : (p as { path?: string }).path ?? ""))
      .filter(Boolean);
    return filesFromPaths(paths, onProgress);
  } catch {
    return null;
  }
}

/** Načte soubory podle cest z nativního Tauri drag&drop eventu. */
export async function openDroppedPathsViaTauri(
  paths: string[],
  onProgress?: (progress: ImportProgress) => void
): Promise<OpenFilesResult | null> {
  if (!isTauri()) return null;
  try {
    return filesFromPaths(paths, onProgress);
  } catch {
    return null;
  }
}

/**
 * V Tauri otevře dialog pro výběr výstupní složky (pro dávkové zpracování).
 * Vrátí cestu ke složce nebo null (uživatel zrušil / není v Tauri).
 */
export async function chooseOutputFolderViaTauri(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const result = await open({ directory: true, multiple: false });
    if (result == null) return null;
    const p = typeof result === "string" ? result : (result as { path?: string }).path ?? null;
    return p;
  } catch {
    return null;
  }
}

/** Strategie při konfliktu názvů výstupního souboru */
export type OverwriteStrategy = "overwrite" | "skip" | "suffix";

export interface NativeGrommetMarksArgs {
  inputPath: string;
  outputPath: string;
  positions: { x: number; y: number }[];
  shape: "circle" | "square";
  sizeMm: number;
  borderColor: {
    type: "rgb" | "cmyk";
    r?: number;
    g?: number;
    b?: number;
    c?: number;
    m?: number;
    y?: number;
    k?: number;
  };
  borderWidthPt?: number;
}

/** Určí cílovou cestu výstupního PDF (bez zápisu). */
export async function resolveOutputFilePath(
  outputFolder: string,
  suggestedName: string,
  overwriteStrategy: OverwriteStrategy = "overwrite"
): Promise<string | null> {
  if (!isTauri()) return null;
  const sep = outputFolder.includes("/") ? "/" : "\\";
  const normalizedFolder = outputFolder.replace(/[/\\]*$/, "");
  let targetPath = `${normalizedFolder}${sep}${suggestedName}`;

  if (overwriteStrategy !== "overwrite") {
    const fileExists = await invokeCore<boolean>("file_exists", { path: targetPath });
    if (fileExists) {
      if (overwriteStrategy === "skip") return null;
      const dotIdx = suggestedName.lastIndexOf(".");
      const base = dotIdx >= 0 ? suggestedName.slice(0, dotIdx) : suggestedName;
      const ext = dotIdx >= 0 ? suggestedName.slice(dotIdx) : "";
      let n = 1;
      let candidate = `${normalizedFolder}${sep}${base}_${n}${ext}`;
      while (await invokeCore<boolean>("file_exists", { path: candidate })) {
        n++;
        candidate = `${normalizedFolder}${sep}${base}_${n}${ext}`;
      }
      targetPath = candidate;
    }
  }

  return targetPath;
}

/** Vloží značky do PDF nativně (lopdf) – bez načítání celého souboru do WebView. */
export async function addGrommetMarksNative(args: NativeGrommetMarksArgs): Promise<void> {
  if (!isTauri()) {
    throw new Error("Nativní zpracování PDF je dostupné jen v desktopové aplikaci.");
  }
  await invokeCore<void>("add_grommet_marks_native", { args });
}

/**
 * V Tauri zapíše blob do výstupní složky podle strategie přepisu.
 * Vrátí cestu výsledného souboru nebo null pokud byl soubor přeskočen.
 */
export async function saveBlobToFolder(
  blob: Blob,
  outputFolder: string,
  suggestedName: string,
  overwriteStrategy: OverwriteStrategy = "overwrite"
): Promise<string | null> {
  if (!isTauri()) return null;
  const targetPath = await resolveOutputFilePath(
    outputFolder,
    suggestedName,
    overwriteStrategy
  );
  if (!targetPath) return null;

  const buf = await blob.arrayBuffer();
  // Zápis přes nativní Rust příkaz – obchází fs scope, funguje i na síťové disky.
  await invokeCore<void>("write_file_bytes", { path: targetPath, contents: new Uint8Array(buf) });
  return targetPath;
}

/**
 * V Tauri otevře dialog pro uložení a zapíše blob na zvolenou cestu.
 * Vrátí uloženou cestu, nebo null pokud uživatel zrušil dialog.
 * Hází výjimku pokud zápis selže (permissions, disk full atd.).
 */
export async function saveBlobViaTauri(
  blob: Blob,
  suggestedName: string,
  defaultDir?: string | null
): Promise<boolean> {
  if (!isTauri()) return false;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const sep = (defaultDir ?? "").includes("/") ? "/" : "\\";
  const defaultPath =
    defaultDir && defaultDir.length > 0
      ? `${defaultDir.replace(/[/\\]*$/, "")}${sep}${suggestedName}`
      : suggestedName;
  const path = await save({
    defaultPath,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (path == null) return false; // uživatel zrušil dialog – není to chyba
  const buf = await blob.arrayBuffer();
  // Zápis přes nativní Rust příkaz – obchází fs scope (síťové disky atd.).
  // Pokud zápis selže, výjimka se propaguje nahoru (volající zobrazí chybu).
  await invokeCore<void>("write_file_bytes", { path, contents: new Uint8Array(buf) });
  return true;
}
