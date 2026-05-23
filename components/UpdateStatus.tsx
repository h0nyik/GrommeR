"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import packageJson from "@/package.json";
import {
  getAppRuntimeInfo,
  isTauri,
  openExternalUrl,
  type AppRuntimeInfo,
} from "@/lib/tauri-bridge";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";

const GITHUB_RELEASES_API = "https://api.github.com/repos/h0nyik/GrommeR/releases/latest";
const GITHUB_RELEASES_URL = "https://github.com/h0nyik/GrommeR/releases/latest";
const DISMISSED_UPDATE_KEY = "grommet-dismissed-update-version";

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GithubReleaseResponse {
  tag_name?: string;
  name?: string;
  html_url?: string;
  body?: string;
  assets?: GithubReleaseAsset[];
}

interface AvailableUpdate {
  version: string;
  notes?: string;
  downloadUrl?: string;
  releaseUrl?: string;
  manualDownload?: boolean;
}

type UpdateMode = "installed" | "portable";
type UpdateState = "idle" | "checking" | "available" | "current" | "downloading" | "error" | "hidden";
type ReleaseAssetKind = "installer" | "portable";

function normalizeVersion(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(/[.-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(candidate: string, current: string): boolean {
  const a = normalizeVersion(candidate);
  const b = normalizeVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

function findPortableAsset(assets: GithubReleaseAsset[] | undefined): GithubReleaseAsset | null {
  return (
    assets?.find((asset) => /portable/i.test(asset.name) && /\.(exe|zip)$/i.test(asset.name)) ??
    assets?.find((asset) => /\.zip$/i.test(asset.name)) ??
    assets?.find((asset) => /\.(exe)$/i.test(asset.name) && !/setup|installer/i.test(asset.name)) ??
    null
  );
}

function findInstallerAsset(assets: GithubReleaseAsset[] | undefined): GithubReleaseAsset | null {
  return (
    assets?.find((asset) => /setup/i.test(asset.name) && /\.exe$/i.test(asset.name)) ??
    assets?.find((asset) => /\.msi$/i.test(asset.name)) ??
    assets?.find((asset) => /\.(exe)$/i.test(asset.name) && !/portable/i.test(asset.name)) ??
    null
  );
}

function getDismissedUpdateVersion(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(DISMISSED_UPDATE_KEY);
}

function dismissUpdateVersion(version: string): void {
  sessionStorage.setItem(DISMISSED_UPDATE_KEY, version);
}

export function UpdateStatus() {
  const [runtimeInfo, setRuntimeInfo] = useState<AppRuntimeInfo | null>(null);
  const [mode, setMode] = useState<UpdateMode>("installed");
  const [state, setState] = useState<UpdateState>("hidden");
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const updateRef = useRef<Update | null>(null);
  const installInProgressRef = useRef(false);

  const checkGithubReleaseUpdate = useCallback(async (
    currentVersion: string,
    assetKind: ReleaseAssetKind
  ): Promise<AvailableUpdate | null> => {
    const response = await fetch(GITHUB_RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error("Nepodařilo se načíst poslední GitHub release.");

    const release = (await response.json()) as GithubReleaseResponse;
    const version = release.tag_name ?? release.name ?? "";
    if (!version || !isNewerVersion(version, currentVersion)) return null;

    const asset =
      assetKind === "portable"
        ? findPortableAsset(release.assets)
        : findInstallerAsset(release.assets);
    return {
      version,
      notes: release.body,
      downloadUrl: asset?.browser_download_url,
      releaseUrl: release.html_url ?? GITHUB_RELEASES_URL,
    };
  }, []);

  const checkPortableUpdate = useCallback(
    async (currentVersion: string): Promise<AvailableUpdate | null> =>
      checkGithubReleaseUpdate(currentVersion, "portable"),
    [checkGithubReleaseUpdate]
  );

  const checkInstalledUpdate = useCallback(async (currentVersion: string): Promise<AvailableUpdate | null> => {
    const { check } = await import("@tauri-apps/plugin-updater");
    try {
      const update = await check({ timeout: 30_000 });
      updateRef.current = update;
      if (!update) return null;
      return {
        version: update.version,
        notes: update.body ?? undefined,
      };
    } catch {
      updateRef.current = null;
      const releaseUpdate = await checkGithubReleaseUpdate(currentVersion, "installer");
      return releaseUpdate ? { ...releaseUpdate, manualDownload: true } : null;
    }
  }, [checkGithubReleaseUpdate]);

  const checkForUpdates = useCallback(
    async (silent = false) => {
      if (!isTauri()) {
        setState("hidden");
        return;
      }

      setState("checking");
      setMessage(silent ? "" : "Kontroluji aktualizace…");
      setAvailableUpdate(null);
      setProgress(null);

      try {
        const info = (await getAppRuntimeInfo()) ?? {
          version: packageJson.version,
          executableName: null,
          isPortable: false,
        };
        const nextMode: UpdateMode = info.isPortable ? "portable" : "installed";
        const update = info.isPortable
          ? await checkPortableUpdate(info.version)
          : await checkInstalledUpdate(info.version);

        setRuntimeInfo(info);
        setMode(nextMode);

        if (update) {
          setAvailableUpdate(update);
          setState("available");
          setMessage(
            nextMode === "portable"
              ? `Je dostupná portable verze ${update.version}.`
              : update.manualDownload
                ? `Je dostupná verze ${update.version}, ale automatická instalace pro tento release není připravená.`
                : `Je dostupná aktualizace ${update.version}.`
          );
          if (getDismissedUpdateVersion() !== update.version) {
            setShowUpdateDialog(true);
          }
          return;
        }

        setState("current");
        setMessage(silent ? "" : `Verze ${info.version} je aktuální.`);
      } catch (error) {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Kontrola aktualizací selhala.");
      }
    },
    [checkInstalledUpdate, checkPortableUpdate]
  );

  useEffect(() => {
    void checkForUpdates(true);
  }, [checkForUpdates]);

  const installUpdate = useCallback(async () => {
    if (installInProgressRef.current) return;

    if (!availableUpdate) {
      await checkForUpdates(false);
      return;
    }

    if (mode === "portable" || availableUpdate.manualDownload) {
      await openExternalUrl(availableUpdate.downloadUrl ?? availableUpdate.releaseUrl ?? GITHUB_RELEASES_URL);
      return;
    }

    const update = updateRef.current;
    if (!update) {
      await checkForUpdates(false);
      return;
    }

    installInProgressRef.current = true;
    setShowUpdateDialog(false);
    setState("downloading");
    setMessage("Stahuji aktualizaci…");
    setProgress(null);

    try {
      let downloaded = 0;
      let total: number | undefined;

      await update.download((event: DownloadEvent) => {
        if (event.event === "Started") {
          downloaded = 0;
          total = event.data.contentLength;
          setProgress(total ? 0 : null);
        }
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total) setProgress(Math.round((downloaded / total) * 100));
        }
        if (event.event === "Finished") {
          setProgress(100);
        }
      });

      setMessage("Instaluji aktualizaci… Aplikace se může zavřít. Potvrďte případné UAC okno (Alt+Tab).");
      setProgress(null);
      await update.install();

      setMessage("Aktualizace je nainstalovaná, aplikace se restartuje.");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error) {
      installInProgressRef.current = false;
      setState("error");
      setMessage(error instanceof Error ? error.message : "Instalace aktualizace selhala.");
      setShowUpdateDialog(true);
    }
  }, [availableUpdate, checkForUpdates, mode]);

  const handleDismissUpdate = useCallback(() => {
    if (availableUpdate) {
      dismissUpdateVersion(availableUpdate.version);
    }
    setShowUpdateDialog(false);
  }, [availableUpdate]);

  const handlePrimaryAction = useCallback(async () => {
    if (state === "available") {
      setShowUpdateDialog(true);
      return;
    }
    await checkForUpdates(false);
  }, [checkForUpdates, state]);

  if (state === "hidden") return null;

  const currentVersion = runtimeInfo?.version ?? packageJson.version;
  const buttonLabel =
    state === "available"
      ? mode === "portable"
        ? "Stáhnout novou verzi"
        : availableUpdate?.manualDownload
          ? "Stáhnout instalátor"
          : "Aktualizovat"
      : state === "checking"
        ? "Kontroluji…"
        : state === "downloading"
          ? "Instaluji…"
          : "Zkontrolovat aktualizace";

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
        <span>
          Verze {currentVersion}
          {message ? ` · ${message}` : ""}
          {progress != null ? ` (${progress} %)` : ""}
        </span>
        <button
          type="button"
          onClick={handlePrimaryAction}
          disabled={state === "checking" || state === "downloading"}
          className="underline hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:text-zinc-300"
        >
          {buttonLabel}
        </button>
      </div>

      {showUpdateDialog && availableUpdate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleDismissUpdate}
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-dialog-title"
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="update-dialog-title" className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
              Dostupná aktualizace
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Je k dispozici nová verze <strong>{availableUpdate.version}</strong>.
              {currentVersion ? ` Aktuálně máte verzi ${currentVersion}.` : ""}
            </p>
            {availableUpdate.notes ? (
              <p className="mt-3 whitespace-pre-wrap rounded border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {availableUpdate.notes}
              </p>
            ) : null}
            {state === "error" ? (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{message}</p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleDismissUpdate}
                disabled={state === "downloading"}
                className="rounded border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Později
              </button>
              <button
                type="button"
                onClick={() => void installUpdate()}
                disabled={state === "downloading"}
                className="rounded bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {state === "downloading"
                  ? progress != null
                    ? `Stahuji… ${progress} %`
                    : "Instaluji…"
                  : mode === "portable" || availableUpdate.manualDownload
                    ? "Stáhnout"
                    : "Aktualizovat nyní"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
