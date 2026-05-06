"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPageInfoFromDimensionsMm,
  createPdfFromImage,
  getImageDimensionsMm,
} from "@/lib/image-to-pdf";
import { generateOutputFilename } from "@/lib/output-filename";
import {
  addGrommetMarksToPdf,
  getPageInfo,
  loadPdfDocument,
  normalizeDrawingScale,
} from "@/lib/pdf-utils";
import type {
  Edge,
  GrommetMarksParams,
  MarkColor,
  PdfPageInfo,
} from "@/types/grommet";
import { track } from "@/lib/analytics";
import {
  chooseOutputFolderViaTauri,
  isTauri,
  openDroppedPathsViaTauri,
  openFilesViaTauri,
  saveBlobToFolder,
  saveBlobViaTauri,
  type OverwriteStrategy,
} from "@/lib/tauri-bridge";
import { ImagePreview } from "./ImagePreview";
import { PdfBoxesSection } from "./PdfBoxesSection";
import { PdfPreview } from "./PdfPreview";

const EDGES: { value: Edge; label: string }[] = [
  { value: "top", label: "Horní" },
  { value: "bottom", label: "Dolní" },
  { value: "left", label: "Levá" },
  { value: "right", label: "Pravá" },
];

const MAX_BATCH_FILES = 10;

const DRAWING_SCALE_PRESETS = [1, 2, 5, 10] as const;
const EXPORT_SETTINGS_STORAGE_KEY = "grommet-export-settings-v1";
const MAX_RECENT_OUTPUT_FOLDERS = 5;

const OUTPUT_SIZE_UNITS = [
  { value: "mm", label: "mm", toMm: (v: number) => v, fromMm: (v: number) => v },
  { value: "cm", label: "cm", toMm: (v: number) => v * 10, fromMm: (v: number) => v / 10 },
  { value: "m", label: "m", toMm: (v: number) => v * 1000, fromMm: (v: number) => v / 1000 },
] as const;

type OutputSizeMode = "scale" | "target";
type OutputSizeUnit = (typeof OUTPUT_SIZE_UNITS)[number]["value"];

type BatchStatus = "loading" | "ready" | "processing" | "done" | "skipped" | "error";

interface BatchItem {
  id: string;
  file: File;
  sourceDir: string | null;
  bytes: ArrayBuffer | null;
  pageInfo: PdfPageInfo | null;
  status: BatchStatus;
  error: string | null;
  outputNameOverride: string;
}

interface SelectedInputFile {
  file: File;
  sourceDir: string | null;
}

interface ExportSettings {
  saveToSourceFolder?: boolean;
  outputFolder?: string | null;
  recentOutputFolders?: string[];
}

function getDirnameFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (idx < 0) return null;
  return path.slice(0, idx);
}

function getInputFileKind(file: File): "pdf" | "image/jpeg" | "image/png" | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type === "image/png" || name.endsWith(".png")) return "image/png";
  if (file.type === "image/jpeg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

const UNITS = [
  { value: "mm", label: "mm", toMm: (v: number) => v },
  { value: "cm", label: "cm", toMm: (v: number) => v * 10 },
  { value: "in", label: "palce", toMm: (v: number) => v * 25.4 },
] as const;

/** První tři = nejpoužívanější (M100, K100, C100), zbytek základní CMYK paletka. */
const CMYK_PRESETS = [
  { name: "M100", c: 0, m: 100, y: 0, k: 0 },
  { name: "K100", c: 0, m: 0, y: 0, k: 100 },
  { name: "C100", c: 100, m: 0, y: 0, k: 0 },
  { name: "Y100", c: 0, m: 0, y: 100, k: 0 },
  { name: "C100 M100", c: 100, m: 100, y: 0, k: 0 },
  { name: "M100 Y100", c: 0, m: 100, y: 100, k: 0 },
  { name: "C100 Y100", c: 100, m: 0, y: 100, k: 0 },
  { name: "K80", c: 0, m: 0, y: 0, k: 80 },
];

function cmykToRgbHex(c: number, m: number, y: number, k: number): string {
  const r = Math.round(255 * (1 - c / 100) * (1 - k / 100));
  const g = Math.round(255 * (1 - m / 100) * (1 - k / 100));
  const b = Math.round(255 * (1 - y / 100) * (1 - k / 100));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Hex → HSL (h 0–360, s/l 0–100). */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const R = r, G = g, B = b;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6;
    else if (max === G) h = ((B - R) / d + 2) / 6;
    else h = ((R - G) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** HSL → RGB (0–1). */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = h / 360; s = s / 100; l = l / 100;
  let r = l, g = l, b = l;
  if (s > 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r, g, b };
}
function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}

/** RGB (0–1) → CMYK (0–100). Bez černé: K vynulujeme a rozložíme do C,M,Y (pro doporučení vždy barevně). */
function rgbToCmykNoK(r: number, g: number, b: number): { c: number; m: number; y: number; k: number } {
  const k = 1 - Math.max(r, g, b);
  if (k >= 0.99) return { c: 0, m: 100, y: 0, k: 0 };
  const c = (1 - r - k) / (1 - k) || 0;
  const m = (1 - g - k) / (1 - k) || 0;
  const y = (1 - b - k) / (1 - k) || 0;
  return { c: Math.round(c * 100), m: Math.round(m * 100), y: Math.round(y * 100), k: 0 };
}

/** Doplňková barva k hex (naproti na barevném kole) + invertovaná světlost pro kontrast. Bez černé → vrací CMYK. */
function complementaryCmyk(bgHex: string): { c: number; m: number; y: number; k: number } {
  const hsl = hexToHsl(bgHex);
  const compH = (hsl.h + 180) % 360;
  const compL = hsl.l < 50 ? 85 : 25;
  const compS = Math.min(100, hsl.s + 30);
  const rgb = hslToRgb(compH, compS, compL);
  return rgbToCmykNoK(rgb.r, rgb.g, rgb.b);
}

/** Popisek CMYK (zkratky C/M/Y/K s procenty). */
function cmykLabel(c: number, m: number, y: number, k: number): string {
  const parts: string[] = [];
  if (c > 0) parts.push(`C${c}`);
  if (m > 0) parts.push(`M${m}`);
  if (y > 0) parts.push(`Y${y}`);
  if (k > 0) parts.push(`K${k}`);
  return parts.length ? parts.join(" ") : "bílá (papír)";
}

/** Mapka kontrastů: pozadí → doporučená barva vždy naproti v barevném spektru (bez černé). */
const CONTRAST_MAP: { bgHex: string; bgLabel: string }[] = [
  { bgHex: "#6b7c3d", bgLabel: "olivová" },
  { bgHex: "#722f37", bgLabel: "burgundská" },
  { bgHex: "#2d6b6b", bgLabel: "teal" },
  { bgHex: "#4a3a5c", bgLabel: "tmavě fialová" },
  { bgHex: "#c9a227", bgLabel: "hořčice" },
  { bgHex: "#c4a574", bgLabel: "béžová / písek" },
  { bgHex: "#7ba3c9", bgLabel: "pastelová modrá" },
  { bgHex: "#a65d34", bgLabel: "terakota" },
  { bgHex: "#5c6b5c", bgLabel: "šedozelená" },
  { bgHex: "#b07d82", bgLabel: "dusty rose" },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(m[1], 16) / 255,
    g: parseInt(m[2], 16) / 255,
    b: parseInt(m[3], 16) / 255,
  };
}

/** Stáhne soubor v prohlížeči (web verze). Element je připnut do DOM před kliknutím, URL se revokuje se zpožděním. */
function downloadBlobInBrowser(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Zpoždění: prohlížeč potřebuje čas na inicializaci stahování před revokací URL
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function GrommetForm() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceDir, setSourceDir] = useState<string | null>(null);
  const [fileBytes, setFileBytes] = useState<ArrayBuffer | null>(null);
  const [pageInfo, setPageInfo] = useState<PdfPageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);

  const [edges, setEdges] = useState<Edge[]>(["top", "bottom", "left", "right"]);
  const [offsetX, setOffsetX] = useState(2.8);
  const [offsetY, setOffsetY] = useState(2.8);
  const [unit, setUnit] = useState<"mm" | "cm" | "in">("cm");
  const [mode, setMode] = useState<"count" | "spacing">("spacing");
  const [countPerEdge, setCountPerEdge] = useState(5);
  const [spacing, setSpacing] = useState(48);
  /** Čitatel N v měřítku výkresu 1:N (výstup zvětšen N× oproti souboru). */
  const [drawingScaleN, setDrawingScaleN] = useState(1);
  const [shape, setShape] = useState<"circle" | "square">("circle");
  const [size, setSize] = useState(7);
  const [colorSpace, setColorSpace] = useState<"rgb" | "cmyk">("cmyk");
  const [colorHex, setColorHex] = useState("#000000");
  const [cmykC, setCmykC] = useState(0);
  const [cmykM, setCmykM] = useState(100);
  const [cmykY, setCmykY] = useState(0);
  const [cmykK, setCmykK] = useState(0);
  const [outputSizeMode, setOutputSizeMode] = useState<OutputSizeMode>("scale");
  const [targetWidth, setTargetWidth] = useState(0);
  const [targetHeight, setTargetHeight] = useState(0);
  const [targetUnit, setTargetUnit] = useState<OutputSizeUnit>("m");
  const [defaultSaveDir, setDefaultSaveDir] = useState<string | null>(null);
  const [outputFolder, setOutputFolder] = useState<string | null>(null);
  const [saveToSourceFolder, setSaveToSourceFolder] = useState(true);
  const [recentOutputFolders, setRecentOutputFolders] = useState<string[]>([]);
  const [exportSettingsLoaded, setExportSettingsLoaded] = useState(false);
  const [overwriteStrategy, setOverwriteStrategy] = useState<OverwriteStrategy>("overwrite");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // Tauri detekce přes useEffect – řeší race condition při prvním renderu
  const [isInTauri, setIsInTauri] = useState(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsInTauri(isTauri());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(EXPORT_SETTINGS_STORAGE_KEY);
      if (!raw) {
        setExportSettingsLoaded(true);
        return;
      }
      const settings = JSON.parse(raw) as ExportSettings;
      if (typeof settings.saveToSourceFolder === "boolean") {
        setSaveToSourceFolder(settings.saveToSourceFolder);
      }
      if (typeof settings.outputFolder === "string" && settings.outputFolder) {
        setOutputFolder(settings.outputFolder);
      }
      if (Array.isArray(settings.recentOutputFolders)) {
        setRecentOutputFolders(
          settings.recentOutputFolders.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT_OUTPUT_FOLDERS)
        );
      }
    } catch {
      // Ignorujeme poškozené lokální nastavení.
    } finally {
      setExportSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!exportSettingsLoaded) return;
    const settings: ExportSettings = {
      saveToSourceFolder,
      outputFolder,
      recentOutputFolders,
    };
    window.localStorage.setItem(EXPORT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [exportSettingsLoaded, outputFolder, recentOutputFolders, saveToSourceFolder]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setSuccessMsg(null), 8000);
  };

  const rememberOutputFolder = useCallback((folder: string | null | undefined) => {
    if (!folder) return;
    setRecentOutputFolders((prev) => [
      folder,
      ...prev.filter((item) => item !== folder),
    ].slice(0, MAX_RECENT_OUTPUT_FOLDERS));
  }, []);

  const getMarkColor = (): MarkColor =>
    colorSpace === "rgb"
      ? { type: "rgb", ...hexToRgb(colorHex) }
      : {
          type: "cmyk",
          c: cmykC / 100,
          m: cmykM / 100,
          y: cmykY / 100,
          k: cmykK / 100,
        };

  const loadOneBatchItem = useCallback(
    async (item: BatchItem): Promise<BatchItem> => {
      const fileKind = getInputFileKind(item.file);
      try {
        const bytes = await item.file.arrayBuffer();
        let info: PdfPageInfo | null = null;
        if (fileKind === "pdf") {
          const doc = await loadPdfDocument(bytes);
          const pages = doc.getPages();
          if (pages.length === 0) return { ...item, bytes, status: "error", error: "Žádná stránka." };
          info = getPageInfo(pages[0], 0);
        } else if (fileKind) {
          const dim = await getImageDimensionsMm(bytes, fileKind);
          info = createPageInfoFromDimensionsMm(dim.widthMm, dim.heightMm);
        } else {
          return { ...item, bytes, status: "error", error: "Nepodporovaný typ souboru." };
        }
        return { ...item, bytes, pageInfo: info, status: "ready", error: null };
      } catch (err) {
        return { ...item, bytes: null, status: "error", error: err instanceof Error ? err.message : "Chyba načtení." };
      }
    },
    []
  );

  const applySelectedFiles = useCallback(
    async (selectedFiles: SelectedInputFile[]) => {
      const files = selectedFiles.map((x) => x.file);
      setError(null);
      setPageInfo(null);
      setFileBytes(null);
      setFile(null);
      setSourceDir(null);
      setBatchItems([]);

      if (files.length === 0) return;
      if (files.length > MAX_BATCH_FILES) {
        setError(`Maximálně ${MAX_BATCH_FILES} souborů.`);
        return;
      }

      const valid = files.every((f) => getInputFileKind(f) !== null);
      if (!valid) {
        setError("Pouze PDF nebo obrázky (JPG, PNG).");
        return;
      }

      if (files.length === 1) {
        const entry = selectedFiles[0];
        const f = entry.file;
        setFile(f);
        setSourceDir(entry.sourceDir);
        if (saveToSourceFolder && entry.sourceDir) {
          setOutputFolder(entry.sourceDir);
          setDefaultSaveDir(entry.sourceDir);
        }
        try {
          const bytes = await f.arrayBuffer();
          setFileBytes(bytes);
          const fileKind = getInputFileKind(f);
          if (fileKind === "pdf") {
            const doc = await loadPdfDocument(bytes);
            const pages = doc.getPages();
            if (pages.length === 0) {
              setError("PDF neobsahuje žádnou stránku.");
              return;
            }
            setPageInfo(getPageInfo(pages[0], 0));
          } else if (fileKind) {
            const dim = await getImageDimensionsMm(bytes, fileKind);
            setPageInfo(createPageInfoFromDimensionsMm(dim.widthMm, dim.heightMm));
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Nepodařilo se načíst soubor.");
        }
        return;
      }

      const items: BatchItem[] = files.map((file, i) => ({
        id: `${file.name}-${i}-${Date.now()}`,
        file,
        sourceDir: selectedFiles[i]?.sourceDir ?? null,
        bytes: null,
        pageInfo: null,
        status: "loading" as BatchStatus,
        error: null,
        outputNameOverride: "",
      }));
      setBatchItems(items);
      const loaded = await Promise.all(items.map(loadOneBatchItem));
      setBatchItems(loaded);
    },
    [loadOneBatchItem, saveToSourceFolder]
  );

  const applyOpenFilesResult = useCallback(
    (result: { files: File[]; paths: string[]; defaultSaveDir: string }) => {
      if (!result.files.length) return;
      if (result.defaultSaveDir) {
        setDefaultSaveDir(result.defaultSaveDir);
        if (saveToSourceFolder) {
          setOutputFolder(result.defaultSaveDir);
        } else {
          setOutputFolder((prev) => prev ?? result.defaultSaveDir);
        }
      }
      applySelectedFiles(
        result.files.map((file, idx) => ({
          file,
          sourceDir: getDirnameFromPath(result.paths[idx] ?? null),
        }))
      );
    },
    [applySelectedFiles, saveToSourceFolder]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      applySelectedFiles(
        Array.from(e.target.files ?? []).map((file) => ({ file, sourceDir: null }))
      );
    },
    [applySelectedFiles]
  );

  const handleTauriOpenFiles = useCallback(async () => {
    const result = await openFilesViaTauri({
      multiple: true,
      accept: "application/pdf,image/jpeg,image/png",
    });
    if (result?.files.length) applyOpenFilesResult(result);
  }, [applyOpenFilesResult]);

  const handleDropOnTauri = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!isInTauri || processing) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const dropped = Array.from(e.dataTransfer.files ?? []);
      if (!dropped.length) return;
      const selected: SelectedInputFile[] = dropped.map((file) => {
        const maybePath = (file as File & { path?: string }).path;
        return { file, sourceDir: getDirnameFromPath(maybePath ?? null) };
      });
      const firstDir = selected[0]?.sourceDir ?? null;
      if (firstDir) {
        setDefaultSaveDir(firstDir);
        if (saveToSourceFolder) setOutputFolder(firstDir);
      }
      applySelectedFiles(selected);
    },
    [applySelectedFiles, isInTauri, processing, saveToSourceFolder]
  );

  useEffect(() => {
    if (!isInTauri) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent(async (event) => {
          if (processing) return;
          const payload = event.payload as
            | { type: "enter" | "over"; paths?: string[] }
            | { type: "drop"; paths: string[] }
            | { type: "leave" };
          if (payload.type === "enter" || payload.type === "over") {
            setIsDragOver(true);
            return;
          }
          if (payload.type === "leave") {
            setIsDragOver(false);
            return;
          }
          setIsDragOver(false);
          const result = await openDroppedPathsViaTauri(payload.paths ?? []);
          if (result?.files.length) applyOpenFilesResult(result);
        })
      )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // HTML5 drop handler níže zůstává jako fallback.
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [applyOpenFilesResult, isInTauri, processing]);

  const handleChooseOutputFolder = useCallback(async () => {
    const folder = await chooseOutputFolderViaTauri();
    if (folder) {
      setOutputFolder(folder);
      setDefaultSaveDir(folder);
      setSaveToSourceFolder(false);
      rememberOutputFolder(folder);
    }
  }, [rememberOutputFolder]);

  const toggleEdge = (edge: Edge) => {
    setEdges((prev) =>
      prev.includes(edge) ? prev.filter((e) => e !== edge) : [...prev, edge]
    );
  };

  const offsetToMm = UNITS.find((u) => u.value === unit)!.toMm;
  const drawingScale = normalizeDrawingScale(drawingScaleN);
  const targetSizeUnit = OUTPUT_SIZE_UNITS.find((u) => u.value === targetUnit)!;
  const targetSizeMm = useMemo(
    () =>
      outputSizeMode === "target" && targetWidth > 0 && targetHeight > 0
        ? {
            widthMm: targetSizeUnit.toMm(targetWidth),
            heightMm: targetSizeUnit.toMm(targetHeight),
          }
        : null,
    [outputSizeMode, targetHeight, targetSizeUnit, targetWidth]
  );
  const getOutputSizeMm = useCallback(
    (info: PdfPageInfo): { widthMm: number; heightMm: number } =>
      targetSizeMm ?? {
        widthMm: info.widthMm * drawingScale,
        heightMm: info.heightMm * drawingScale,
      },
    [drawingScale, targetSizeMm]
  );
  const getSpacingForFilename = useCallback(
    (info: PdfPageInfo): { spacingCm: number; spacingVertCm?: number } => {
      if (mode === "spacing") return { spacingCm: spacing };

      const outputSize = getOutputSizeMm(info);
      const count = Math.max(1, countPerEdge);
      if (count <= 1) return { spacingCm: 0 };

      const offsetXMm = offsetToMm(offsetX);
      const offsetYMm = offsetToMm(offsetY);
      const horzMm = (outputSize.widthMm - 2 * offsetXMm) / (count - 1);
      const vertMm = (outputSize.heightMm - 2 * offsetYMm) / (count - 1);
      const spacingCm = horzMm / 10;
      const spacingVertCm = Math.abs(vertMm / 10 - spacingCm) < 0.5 ? undefined : vertMm / 10;
      return { spacingCm, spacingVertCm };
    },
    [countPerEdge, getOutputSizeMm, mode, offsetToMm, offsetX, offsetY, spacing]
  );
  const fillTargetSizeFromCurrentPage = useCallback(() => {
    const info = batchItems.find((i) => i.pageInfo)?.pageInfo ?? pageInfo;
    if (!info) return;
    const unitDef = OUTPUT_SIZE_UNITS.find((u) => u.value === targetUnit)!;
    setTargetWidth(Number(unitDef.fromMm(info.widthMm * drawingScale).toFixed(3)));
    setTargetHeight(Number(unitDef.fromMm(info.heightMm * drawingScale).toFixed(3)));
  }, [batchItems, drawingScale, pageInfo, targetUnit]);

  const handleBatchSubmit = async () => {
    const ready = batchItems.filter((i) => i.status === "ready" && i.bytes && i.pageInfo);
    if (ready.length === 0) return;
    if (outputSizeMode === "target" && !targetSizeMm) {
      setError("Zadejte kladnou šířku i výšku cílového plátna.");
      return;
    }
    setProcessing(true);
    setError(null);
    setSuccessMsg(null);
    let batchSuccessCount = 0;
    let batchSkippedCount = 0;
    const offsetXMm = offsetToMm(offsetX);
    const offsetYMm = offsetToMm(offsetY);

    for (let idx = 0; idx < ready.length; idx++) {
      const item = ready[idx];
      if (!item.bytes || !item.pageInfo) continue;
      setBatchItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: "processing" as BatchStatus } : i))
      );
      try {
        let pdfBytes: ArrayBuffer | Uint8Array = item.bytes;
        const fileKind = getInputFileKind(item.file);
        if (fileKind && fileKind !== "pdf") {
          pdfBytes = await createPdfFromImage(
            item.bytes,
            fileKind
          );
        }
        const outputSize = getOutputSizeMm(item.pageInfo);
        const params: GrommetMarksParams = {
          widthMm: outputSize.widthMm,
          heightMm: outputSize.heightMm,
          edges,
          offsetXMm,
          offsetYMm,
          mode,
          countPerEdge: mode === "count" ? countPerEdge : undefined,
          spacingMm: mode === "spacing" ? spacing * 10 : undefined,
        };
        const result = await addGrommetMarksToPdf(
          pdfBytes,
          params,
          { shape, sizeMm: size, borderColor: getMarkColor() },
          { drawingScale, targetSizeMm: targetSizeMm ?? undefined }
        );
        const outputName =
          item.outputNameOverride.trim() ||
          generateOutputFilename({
            originalFileName: item.file.name,
            widthMm: outputSize.widthMm,
            heightMm: outputSize.heightMm,
            ...getSpacingForFilename(item.pageInfo),
          });
        const ab = new ArrayBuffer(result.byteLength);
        new Uint8Array(ab).set(result);
        const blob = new Blob([ab], { type: "application/pdf" });
        let skipped = false;
        if (isInTauri) {
          const folder =
            (saveToSourceFolder ? item.sourceDir : null) ?? outputFolder ?? defaultSaveDir;
          if (folder) {
            rememberOutputFolder(folder);
            const savedPath = await saveBlobToFolder(blob, folder, outputName, overwriteStrategy);
            if (savedPath === null) {
              if (overwriteStrategy === "skip") {
                skipped = true;
              } else {
                throw new Error(`Nepodařilo se uložit soubor do složky: ${folder}`);
              }
            }
          } else {
            // Žádná složka není vybrána – otevřeme dialog pro každý soubor
            const dialSaved = await saveBlobViaTauri(blob, outputName, null);
            if (!dialSaved) {
              throw new Error("Uložení bylo zrušeno nebo selhalo. Vyberte výstupní složku v sekci níže.");
            }
          }
        } else {
          downloadBlobInBrowser(blob, outputName);
        }
        setBatchItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: (skipped ? "skipped" : "done") as BatchStatus }
              : i
          )
        );
        if (skipped) batchSkippedCount++;
        else batchSuccessCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Chyba";
        track({ type: "error", message: msg, context: "batch" });
        setBatchItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: "error" as BatchStatus, error: msg }
              : i
          )
        );
      }
    }
    if (batchSuccessCount > 0) track({ type: "batch_generated", count: batchSuccessCount });
    showSuccess(
      `Dávka dokončena: ${batchSuccessCount} / ${ready.length} souborů úspěšně zpracováno` +
        (batchSkippedCount > 0 ? `, přeskočeno: ${batchSkippedCount}.` : ".")
    );
    setProcessing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (batchItems.length > 0) {
      handleBatchSubmit();
      return;
    }
    if (!fileBytes || !pageInfo || !file) {
      setError("Nejprve nahrajte PDF nebo obrázek.");
      return;
    }
    if (outputSizeMode === "target" && !targetSizeMm) {
      setError("Zadejte kladnou šířku i výšku cílového plátna.");
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setProcessing(true);
    try {
      let pdfBytes: ArrayBuffer | Uint8Array = fileBytes;
      const fileKind = getInputFileKind(file);
      if (fileKind && fileKind !== "pdf") {
        pdfBytes = await createPdfFromImage(
          fileBytes,
          fileKind
        );
      }
      const outputSize = getOutputSizeMm(pageInfo);
      const params: GrommetMarksParams = {
        widthMm: outputSize.widthMm,
        heightMm: outputSize.heightMm,
        edges,
        offsetXMm: offsetToMm(offsetX),
        offsetYMm: offsetToMm(offsetY),
        mode,
        countPerEdge: mode === "count" ? countPerEdge : undefined,
        spacingMm: mode === "spacing" ? spacing * 10 : undefined,
      };
      const result = await addGrommetMarksToPdf(
        pdfBytes,
        params,
        {
          shape,
          sizeMm: size,
          borderColor: getMarkColor(),
        },
        { drawingScale, targetSizeMm: targetSizeMm ?? undefined }
      );
      const wEff = outputSize.widthMm;
      const hEff = outputSize.heightMm;

      const outputName = generateOutputFilename({
        originalFileName: file?.name ?? "vystup.pdf",
        widthMm: wEff,
        heightMm: hEff,
        ...getSpacingForFilename(pageInfo),
      });

      if (!result || result.byteLength < 50) {
        throw new Error("Vygenerované PDF je prázdné nebo poškozené. Zkuste jiný soubor.");
      }

      const ab = new ArrayBuffer(result.byteLength);
      new Uint8Array(ab).set(result);
      const blob = new Blob([ab], { type: "application/pdf" });

      if (isInTauri) {
        const folder = (saveToSourceFolder ? sourceDir : null) ?? outputFolder ?? defaultSaveDir;
        if (folder) {
          rememberOutputFolder(folder);
          const savedPath = await saveBlobToFolder(blob, folder, outputName, overwriteStrategy);
          if (savedPath === null) {
            if (overwriteStrategy === "skip") {
              showSuccess(`Soubor přeskočen, protože už existuje: ${outputName}`);
              return;
            }
            throw new Error(`Nepodařilo se uložit soubor do složky: ${folder}`);
          }
          showSuccess(`Soubor uložen: ${savedPath}`);
        } else {
          const dialSaved = await saveBlobViaTauri(blob, outputName, null);
          if (!dialSaved) {
            throw new Error("Uložení bylo zrušeno nebo selhalo. Vyberte výstupní složku nebo zkuste znovu.");
          }
          showSuccess(`Soubor uložen: ${outputName}`);
        }
      } else {
        downloadBlobInBrowser(blob, outputName);
        showSuccess(`Soubor stažen: ${outputName}`);
      }
      track({ type: "pdf_generated", single: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chyba při generování PDF.";
      track({ type: "error", message: msg, context: "single" });
      setError(msg);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6">
      {/* Nahrání PDF */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-semibold text-zinc-800 dark:text-zinc-100">
          Nahrání souborů
        </h2>
        <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">
          Jeden soubor nebo dávka (až {MAX_BATCH_FILES}× PDF / JPG / PNG).
        </p>
        <div
          onDragOver={(e) => {
            if (!isInTauri || processing) return;
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragEnter={(e) => {
            if (!isInTauri || processing) return;
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            if (!isInTauri || processing) return;
            e.preventDefault();
            setIsDragOver(false);
          }}
          onDrop={handleDropOnTauri}
          className={
            isInTauri
              ? `rounded border-2 border-dashed p-3 transition ${
                  isDragOver
                    ? "border-blue-500 bg-blue-50/70 dark:border-blue-400 dark:bg-blue-900/20"
                    : "border-zinc-300 dark:border-zinc-600"
                }`
              : ""
          }
        >
          {isInTauri && (
            <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
              Drag&drop z Průzkumníka je podporován: přetáhněte PDF/JPG/PNG sem.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
          {!isInTauri && (
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              multiple
              onChange={onFileChange}
              className="block flex-1 min-w-0 text-sm text-zinc-600 file:mr-4 file:rounded file:border-0 file:bg-zinc-200 file:px-4 file:py-2 file:text-sm file:font-medium dark:text-zinc-400 file:dark:bg-zinc-700"
            />
          )}
          {isInTauri && (
            <>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                V desktopové aplikaci můžete použít tlačítko nebo drag&drop.
              </p>
              <button
                type="button"
                onClick={handleTauriOpenFiles}
                className="rounded border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
              >
                Vybrat soubory (systémový dialog)
              </button>
            </>
          )}
          </div>
        </div>
        {file && !batchItems.length && (
          <>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Soubor: {file.name}
              {pageInfo && (
                <>
                  {" "}
                  — {pageInfo.widthMm.toFixed(1)} × {pageInfo.heightMm.toFixed(1)} mm v souboru
                  {targetSizeMm ? (
                    <>
                      {" "}
                      → {targetSizeMm.widthMm.toFixed(1)} × {targetSizeMm.heightMm.toFixed(1)} mm cílové plátno
                    </>
                  ) : drawingScale > 1 && (
                    <>
                      {" "}
                      → {(pageInfo.widthMm * drawingScale).toFixed(1)} ×{" "}
                      {(pageInfo.heightMm * drawingScale).toFixed(1)} mm při 1:{drawingScale}
                    </>
                  )}
                  {getInputFileKind(file)?.startsWith("image/") && " (obrázek → výstup PDF)"}
                </>
              )}
            </p>
            <ImagePreview file={getInputFileKind(file)?.startsWith("image/") ? file : null} />
            <PdfPreview file={getInputFileKind(file) === "pdf" ? file : null} />
          </>
        )}
        {batchItems.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Dávka ({batchItems.length} souborů)
            </h3>
            <ul className="space-y-2">
              {batchItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-2 rounded border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800/50"
                >
                  <span className="min-w-[120px] truncate font-medium" title={item.file.name}>
                    {item.file.name}
                  </span>
                  {item.pageInfo && (
                    <span className="text-zinc-500">
                      {item.pageInfo.widthMm.toFixed(0)}×{item.pageInfo.heightMm.toFixed(0)} mm
                      {targetSizeMm && ` → ${targetSizeMm.widthMm.toFixed(0)}×${targetSizeMm.heightMm.toFixed(0)} mm`}
                    </span>
                  )}
                  <span
                    className={
                      item.status === "error"
                        ? "text-red-600 dark:text-red-400"
                        : item.status === "done"
                          ? "text-green-600 dark:text-green-400"
                          : item.status === "skipped"
                            ? "text-amber-600 dark:text-amber-400"
                          : item.status === "processing"
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-zinc-500"
                    }
                  >
                    {item.status === "loading" && "načítám…"}
                    {item.status === "ready" && "připraveno"}
                    {item.status === "processing" && "zpracovávám…"}
                    {item.status === "done" && "hotovo"}
                    {item.status === "skipped" && "přeskočeno"}
                    {item.status === "error" && (item.error ?? "chyba")}
                  </span>
                  {item.status === "ready" && (
                    <input
                      type="text"
                      placeholder="Výstupní název (volitelné)"
                      value={item.outputNameOverride}
                      onChange={(e) =>
                        setBatchItems((prev) =>
                          prev.map((i) =>
                            i.id === item.id ? { ...i, outputNameOverride: e.target.value } : i
                          )
                        )
                      }
                      className="ml-auto min-w-0 max-w-[200px] rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800"
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-200">
          ✓ {successMsg}
        </div>
      )}

      {/* Měřítko výkresu */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-semibold text-zinc-800 dark:text-zinc-100">
          Měřítko výkresu (1:N)
        </h2>
        <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
          Pokud zákazník posílá data v měřítku (např. 1:10), zvolte stejné <strong>N</strong>. Aplikace
          zvětší grafiku na výstupním PDF N× a značky vypočítá v milimetrech{" "}
          <strong>skutečného</strong> formátu (rozteč, offset od okrajů, velikost značky).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Předvolby:</span>
          {DRAWING_SCALE_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDrawingScaleN(n)}
              className={
                drawingScaleN === n
                  ? "rounded border border-zinc-800 bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-900"
                  : "rounded border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              }
            >
              1:{n}
            </button>
          ))}
        </div>
        <label className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">Vlastní N (1 až 100):</span>
          <input
            type="number"
            min={1}
            max={100}
            step="any"
            value={drawingScaleN}
            onChange={(e) => setDrawingScaleN(Number(e.target.value) || 1)}
            className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800"
          />
        </label>
        {drawingScale !== drawingScaleN && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Hodnota N byla omezena na rozsah 1–100 (použito 1:{drawingScale}).
          </p>
        )}
        <div className="mt-4 rounded border border-zinc-200 p-3 dark:border-zinc-700">
          <div className="mb-2 flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="outputSizeMode"
                checked={outputSizeMode === "scale"}
                onChange={() => setOutputSizeMode("scale")}
              />
              Použít měřítko 1:N
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="outputSizeMode"
                checked={outputSizeMode === "target"}
                onChange={() => {
                  setOutputSizeMode("target");
                  if (targetWidth <= 0 || targetHeight <= 0) fillTargetSizeFromCurrentPage();
                }}
              />
              Zadat cílový rozměr plátna
            </label>
          </div>
          {outputSizeMode === "target" && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Šířka</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={targetWidth}
                  onChange={(e) => setTargetWidth(Number(e.target.value) || 0)}
                  className="w-28 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Výška</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={targetHeight}
                  onChange={(e) => setTargetHeight(Number(e.target.value) || 0)}
                  className="w-28 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Jednotka</span>
                <select
                  value={targetUnit}
                  onChange={(e) => setTargetUnit(e.target.value as OutputSizeUnit)}
                  className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                >
                  {OUTPUT_SIZE_UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={fillTargetSizeFromCurrentPage}
                className="rounded border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
              >
                Vyplnit z PDF
              </button>
              <p className="basis-full text-xs text-zinc-500 dark:text-zinc-400">
                Pro velké plachty, např. 12 m, aplikace vytvoří fyzicky velké PDF plátno a v případě potřeby použije PDF UserUnit.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Hrany */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-semibold text-zinc-800 dark:text-zinc-100">
          Hrany pro značky
        </h2>
        <div className="flex flex-wrap gap-4">
          {EDGES.map(({ value, label }) => (
            <label key={value} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={edges.includes(value)}
                onChange={() => toggleEdge(value)}
                className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      {/* Offset a jednotky */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-semibold text-zinc-800 dark:text-zinc-100">
          Offset od rohů
        </h2>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">X:</span>
            <input
              type="number"
              min={0}
              step="any"
              value={offsetX}
              onChange={(e) => setOffsetX(Number(e.target.value) || 0)}
              className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Y:</span>
            <input
              type="number"
              min={0}
              step="any"
              value={offsetY}
              onChange={(e) => setOffsetY(Number(e.target.value) || 0)}
              className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Jednotky:</span>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as "mm" | "cm" | "in")}
              className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            >
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Režim: počet / rozteč */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-semibold text-zinc-800 dark:text-zinc-100">
          Počet značek nebo rozteč
        </h2>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "count"}
              onChange={() => setMode("count")}
            />
            Počet značek na hranu
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "spacing"}
              onChange={() => setMode("spacing")}
            />
            Rozteč mezi značkami
          </label>
        </div>
        {mode === "count" ? (
          <label className="mt-2 flex items-center gap-2">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Počet:</span>
            <input
              type="number"
              min={1}
              value={countPerEdge}
              onChange={(e) => setCountPerEdge(Number(e.target.value) || 1)}
              className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            />
          </label>
        ) : (
          <label className="mt-2 flex items-center gap-2">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Rozteč:</span>
            <input
              type="number"
              min={0.1}
              step="any"
              value={spacing}
              onChange={(e) => setSpacing(Number(e.target.value) || 10)}
              className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            />
            <span className="text-sm text-zinc-500">cm</span>
          </label>
        )}
      </section>

      {/* Tvar a velikost značky */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-semibold text-zinc-800 dark:text-zinc-100">
          Tvar a velikost značky
        </h2>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="shape"
              checked={shape === "circle"}
              onChange={() => setShape("circle")}
            />
            Kruh
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="shape"
              checked={shape === "square"}
              onChange={() => setShape("square")}
            />
            Čtverec
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Velikost:</span>
            <input
              type="number"
              min={0.5}
              step="any"
              value={size}
              onChange={(e) => setSize(Number(e.target.value) || 1)}
              className="w-20 rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            />
            <span className="text-sm text-zinc-500">mm</span>
          </label>
        </div>
      </section>

      {/* Barva značek */}
      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-2 text-lg font-semibold text-zinc-800 dark:text-zinc-100">
          Barva značek
        </h2>
        <div className="mb-3 flex gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="colorSpace"
              checked={colorSpace === "rgb"}
              onChange={() => setColorSpace("rgb")}
              className="text-zinc-600"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">RGB</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="colorSpace"
              checked={colorSpace === "cmyk"}
              onChange={() => setColorSpace("cmyk")}
              className="text-zinc-600"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">CMYK</span>
          </label>
        </div>
        <div className="mb-3 rounded border border-zinc-200 bg-zinc-50/50 p-2 dark:border-zinc-600 dark:bg-zinc-800/30">
          <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Mapka kontrastů – barva naproti v spektru (bez černé)
          </p>
          <div className="flex flex-wrap gap-3">
            {CONTRAST_MAP.map((row) => {
              const rec = complementaryCmyk(row.bgHex);
              const recLabel = cmykLabel(rec.c, rec.m, rec.y, rec.k);
              return (
                <div
                  key={row.bgHex}
                  className="flex items-center gap-1.5 rounded bg-white px-2 py-1 shadow-sm dark:bg-zinc-900"
                >
                  <span
                    className="inline-block h-6 w-6 shrink-0 rounded border border-zinc-300 dark:border-zinc-500"
                    style={{ backgroundColor: row.bgHex }}
                    title={row.bgLabel}
                  />
                  <span className="text-xs text-zinc-500">→</span>
                  <button
                    type="button"
                    title={`Použít: ${recLabel}`}
                    onClick={() => {
                      setColorSpace("cmyk");
                      setCmykC(rec.c);
                      setCmykM(rec.m);
                      setCmykY(rec.y);
                      setCmykK(rec.k);
                    }}
                    className="inline-block h-6 w-6 shrink-0 rounded border-2 border-transparent hover:border-zinc-400 dark:hover:border-zinc-500"
                    style={{
                      borderRadius: shape === "circle" ? "50%" : 4,
                      backgroundColor: cmykToRgbHex(rec.c, rec.m, rec.y, rec.k),
                    }}
                  />
                  <span className="text-xs text-zinc-600 dark:text-zinc-300">{recLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-zinc-500 dark:text-zinc-400">CMYK paletka:</span>
          {CMYK_PRESETS.map((preset) => {
            const hex = cmykToRgbHex(preset.c, preset.m, preset.y, preset.k);
            const isActive =
              colorSpace === "cmyk" &&
              cmykC === preset.c &&
              cmykM === preset.m &&
              cmykY === preset.y &&
              cmykK === preset.k;
            return (
              <button
                key={preset.name}
                type="button"
                title={preset.name}
                onClick={() => {
                  setColorSpace("cmyk");
                  setCmykC(preset.c);
                  setCmykM(preset.m);
                  setCmykY(preset.y);
                  setCmykK(preset.k);
                }}
                className={`inline-flex shrink-0 items-center justify-center border-2 transition-opacity hover:opacity-90 ${
                  isActive ? "border-zinc-800 dark:border-zinc-200" : "border-transparent"
                }`}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: shape === "circle" ? "50%" : 4,
                  backgroundColor: hex,
                }}
              />
            );
          })}
        </div>
        {colorSpace === "rgb" ? (
          <label className="flex items-center gap-2">
            <input
              type="color"
              value={colorHex}
              onChange={(e) => setColorHex(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded border border-zinc-300 dark:border-zinc-600"
            />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{colorHex}</span>
          </label>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">C %</span>
              <input
                type="number"
                min={0}
                max={100}
                value={cmykC}
                onChange={(e) => setCmykC(clamp(0, 100, Number(e.target.value) || 0))}
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-800"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">M %</span>
              <input
                type="number"
                min={0}
                max={100}
                value={cmykM}
                onChange={(e) => setCmykM(clamp(0, 100, Number(e.target.value) || 0))}
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-800"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Y %</span>
              <input
                type="number"
                min={0}
                max={100}
                value={cmykY}
                onChange={(e) => setCmykY(clamp(0, 100, Number(e.target.value) || 0))}
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-800"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">K %</span>
              <input
                type="number"
                min={0}
                max={100}
                value={cmykK}
                onChange={(e) => setCmykK(clamp(0, 100, Number(e.target.value) || 0))}
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-800"
              />
            </label>
          </div>
        )}
      </section>

      <PdfBoxesSection
        pageInfo={
          batchItems.length > 0
            ? batchItems.find((i) => i.pageInfo)?.pageInfo ?? null
            : pageInfo
        }
        drawingScale={drawingScale}
        targetSizeMm={targetSizeMm}
      />

      {/* Výstupní složka a přepis – pouze v desktopové aplikaci (Tauri) */}
      {isInTauri && (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <h2 className="mb-2 text-lg font-semibold text-zinc-800 dark:text-zinc-100">
            Výstupní složka
          </h2>
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={saveToSourceFolder}
              onChange={(e) => setSaveToSourceFolder(e.target.checked)}
            />
            Ukládat automaticky do stejné složky jako zdrojový soubor
          </label>
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Když tuto volbu vypnete, použije se výchozí exportní složka níže. Vybraná složka se uloží i pro další spuštění aplikace.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleChooseOutputFolder}
              className="rounded border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
            >
              Vybrat výchozí exportní složku…
            </button>
            {outputFolder ? (
              <>
                <span className="min-w-0 max-w-xs truncate text-sm text-zinc-600 dark:text-zinc-400" title={outputFolder}>
                  {outputFolder}
                </span>
                <button
                  type="button"
                  onClick={() => setOutputFolder(null)}
                  className="text-xs text-red-500 hover:underline dark:text-red-400"
                >
                  Zrušit
                </button>
              </>
            ) : (
              <span className="text-sm text-zinc-400 dark:text-zinc-500">
                {defaultSaveDir
                  ? `Výchozí: ${defaultSaveDir}`
                  : "Nebyla zjištěna složka zdroje – uložení vyžádá dialog"}
              </span>
            )}
          </div>
          {recentOutputFolders.length > 0 && (
            <div className="mt-3">
              <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Naposledy použité složky:
              </span>
              <div className="flex flex-wrap gap-2">
                {recentOutputFolders.map((folder) => (
                  <button
                    key={folder}
                    type="button"
                    title={folder}
                    onClick={() => {
                      setOutputFolder(folder);
                      setDefaultSaveDir(folder);
                      setSaveToSourceFolder(false);
                      rememberOutputFolder(folder);
                    }}
                    className="max-w-xs truncate rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    {folder}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3">
            <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Při konfliktu názvů:
            </span>
            <div className="flex flex-wrap gap-4">
              {(["overwrite", "suffix", "skip"] as OverwriteStrategy[]).map((s) => (
                <label key={s} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="overwriteStrategy"
                    checked={overwriteStrategy === s}
                    onChange={() => setOverwriteStrategy(s)}
                  />
                  {s === "overwrite" ? "Přepsat" : s === "suffix" ? "Přidat číselný suffix (_1, _2…)" : "Přeskočit"}
                </label>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="submit"
          title={
            processing
              ? undefined
              : batchItems.length === 0 && (!fileBytes || !pageInfo)
                ? "Nejprve nahrajte PDF nebo obrázek (použijte tlačítko „Vybrat soubory“)"
                : batchItems.length > 0 && !batchItems.some((i) => i.status === "ready")
                  ? "Počkejte na načtení souborů"
                  : undefined
          }
          disabled={
            processing ||
            (batchItems.length === 0 && (!fileBytes || !pageInfo)) ||
            (batchItems.length > 0 && !batchItems.some((i) => i.status === "ready"))
          }
          className="rounded-lg bg-zinc-800 px-6 py-2.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-700 dark:hover:bg-zinc-600"
        >
          {processing
            ? "Generuji…"
            : batchItems.length > 0
              ? "Generovat dávku"
              : "Generovat PDF se značkami"}
        </button>
      </div>
    </form>
  );
}
