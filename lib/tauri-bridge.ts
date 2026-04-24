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

/** Výsledek otevření souborů v Tauri: soubory + jejich plné cesty + adresář prvního souboru. */
export type OpenFilesResult = {
  files: File[];
  paths: string[];
  defaultSaveDir: string;
};

/** V Tauri otevře dialog pro výběr souborů; v prohlížeči vrátí null (použijte <input type="file">). */
export async function openFilesViaTauri(options: {
  multiple: boolean;
  accept?: string;
}): Promise<OpenFilesResult | null> {
  if (!isTauri()) return null;
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const pathOrPaths = await open({
      multiple: options.multiple,
      directory: false,
      filters: options.accept
        ? [{ name: "PDF a obrázky", extensions: ["pdf", "jpg", "jpeg", "png"] }]
        : undefined,
    });
    if (pathOrPaths == null) return null;
    const selectedPaths = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];
    const files: File[] = [];
    const filePaths: string[] = [];
    let defaultSaveDir = "";
    for (let i = 0; i < selectedPaths.length; i++) {
      const p = selectedPaths[i];
      const pathStr = typeof p === "string" ? p : (p as { path?: string }).path ?? "";
      if (!pathStr) continue;
      filePaths.push(pathStr);
      if (i === 0) {
        const lastSep = Math.max(pathStr.lastIndexOf("/"), pathStr.lastIndexOf("\\"));
        defaultSaveDir = lastSep >= 0 ? pathStr.slice(0, lastSep) : "";
      }
      const bytes = await readFile(pathStr);
      const name = pathStr.replace(/^.*[\\/]/, "");
      const mime =
        name.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : name.toLowerCase().match(/\.(jpe?g|png)$/)
            ? `image/${name.toLowerCase().endsWith(".png") ? "png" : "jpeg"}`
            : "application/octet-stream";
      files.push(new File([bytes], name, { type: mime }));
    }
    return { files, paths: filePaths, defaultSaveDir };
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
  try {
    const { writeFile, exists } = await import("@tauri-apps/plugin-fs");
    const sep = outputFolder.includes("/") ? "/" : "\\";
    let targetPath = `${outputFolder.replace(/[/\\]*$/, "")}${sep}${suggestedName}`;

    if (overwriteStrategy !== "overwrite") {
      const fileExists = await exists(targetPath);
      if (fileExists) {
        if (overwriteStrategy === "skip") return null;
        // suffix: přidej _1, _2, … před .pdf
        const dotIdx = suggestedName.lastIndexOf(".");
        const base = dotIdx >= 0 ? suggestedName.slice(0, dotIdx) : suggestedName;
        const ext = dotIdx >= 0 ? suggestedName.slice(dotIdx) : "";
        let n = 1;
        let candidate = `${outputFolder.replace(/[/\\]*$/, "")}${sep}${base}_${n}${ext}`;
        while (await exists(candidate)) {
          n++;
          candidate = `${outputFolder.replace(/[/\\]*$/, "")}${sep}${base}_${n}${ext}`;
        }
        targetPath = candidate;
      }
    }

    const buf = await blob.arrayBuffer();
    await writeFile(targetPath, new Uint8Array(buf));
    return targetPath;
  } catch {
    return null;
  }
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
