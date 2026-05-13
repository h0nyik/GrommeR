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
};

function getMimeTypeFromPath(pathStr: string): string {
  const name = pathStr.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function getDirnameFromPath(pathStr: string): string {
  const lastSep = Math.max(pathStr.lastIndexOf("/"), pathStr.lastIndexOf("\\"));
  return lastSep >= 0 ? pathStr.slice(0, lastSep) : "";
}

async function filesFromPaths(selectedPaths: string[]): Promise<OpenFilesResult> {
  const { readFile } = await import("@tauri-apps/plugin-fs");
  const files: File[] = [];
  const filePaths: string[] = [];
  let defaultSaveDir = "";
  for (let i = 0; i < selectedPaths.length; i++) {
    const pathStr = selectedPaths[i];
    if (!pathStr) continue;
    filePaths.push(pathStr);
    if (i === 0) defaultSaveDir = getDirnameFromPath(pathStr);
    const bytes = await readFile(pathStr);
    const name = pathStr.replace(/^.*[\\/]/, "");
    files.push(new File([bytes], name, { type: getMimeTypeFromPath(pathStr) }));
  }
  return { files, paths: filePaths, defaultSaveDir };
}

/** V Tauri otevře dialog pro výběr souborů; v prohlížeči vrátí null (použijte <input type="file">). */
export async function openFilesViaTauri(options: {
  multiple: boolean;
  accept?: string;
}): Promise<OpenFilesResult | null> {
  if (!isTauri()) return null;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const pathOrPaths = await open({
      multiple: options.multiple,
      directory: false,
      filters: options.accept
        ? [{ name: "PDF a obrázky", extensions: ["pdf", "jpg", "jpeg", "png"] }]
        : undefined,
    });
    if (pathOrPaths == null) return null;
    const selectedPaths = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];
    const paths = selectedPaths
      .map((p) => (typeof p === "string" ? p : (p as { path?: string }).path ?? ""))
      .filter(Boolean);
    return filesFromPaths(paths);
  } catch {
    return null;
  }
}

/** Načte soubory podle cest z nativního Tauri drag&drop eventu. */
export async function openDroppedPathsViaTauri(paths: string[]): Promise<OpenFilesResult | null> {
  if (!isTauri()) return null;
  try {
    return filesFromPaths(paths);
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
  const { writeFile, exists } = await import("@tauri-apps/plugin-fs");
  const sep = outputFolder.includes("/") ? "/" : "\\";
  const normalizedFolder = outputFolder.replace(/[/\\]*$/, "");
  let targetPath = `${normalizedFolder}${sep}${suggestedName}`;

  if (overwriteStrategy !== "overwrite") {
    const fileExists = await exists(targetPath);
    if (fileExists) {
      if (overwriteStrategy === "skip") return null;
      // suffix: přidej _1, _2, … před .pdf
      const dotIdx = suggestedName.lastIndexOf(".");
      const base = dotIdx >= 0 ? suggestedName.slice(0, dotIdx) : suggestedName;
      const ext = dotIdx >= 0 ? suggestedName.slice(dotIdx) : "";
      let n = 1;
      let candidate = `${normalizedFolder}${sep}${base}_${n}${ext}`;
      while (await exists(candidate)) {
        n++;
        candidate = `${normalizedFolder}${sep}${base}_${n}${ext}`;
      }
      targetPath = candidate;
    }
  }

  const buf = await blob.arrayBuffer();
  await writeFile(targetPath, new Uint8Array(buf));
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
  const { writeFile } = await import("@tauri-apps/plugin-fs");
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
  // Pokud writeFile selže, výjimka se propaguje nahoru (volající zobrací chybu)
  await writeFile(path, new Uint8Array(buf));
  return true;
}
