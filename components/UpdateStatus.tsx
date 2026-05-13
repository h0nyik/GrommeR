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
}

type UpdateMode = "installed" | "portable";
type UpdateState = "idle" | "checking" | "available" | "current" | "downloading" | "error" | "hidden";

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
    assets?.find((asset) => /\.(exe|zip)$/i.test(asset.name)) ??
    null
  );
}

export function UpdateStatus() {
  const [runtimeInfo, setRuntimeInfo] = useState<AppRuntimeInfo | null>(null);
  const [mode, setMode] = useState<UpdateMode>("installed");
  const [state, setState] = useState<UpdateState>("hidden");
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const updateRef = useRef<Update | null>(null);

  const checkPortableUpdate = useCallback(async (currentVersion: string): Promise<AvailableUpdate | null> => {
    const response = await fetch(GITHUB_RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error("Nepodařilo se načíst poslední GitHub release.");

    const release = (await response.json()) as GithubReleaseResponse;
    const version = release.tag_name ?? release.name ?? "";
    if (!version || !isNewerVersion(version, currentVersion)) return null;

    const portableAsset = findPortableAsset(release.assets);
    return {
      version,
      notes: release.body,
      downloadUrl: portableAsset?.browser_download_url,
      releaseUrl: release.html_url ?? GITHUB_RELEASES_URL,
    };
  }, []);

  const checkInstalledUpdate = useCallback(async (): Promise<AvailableUpdate | null> => {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check({ timeout: 30_000 });
    updateRef.current = update;
    if (!update) return null;
    return {
      version: update.version,
      notes: update.body,
    };
  }, []);

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
          : await checkInstalledUpdate();

        setRuntimeInfo(info);
        setMode(nextMode);

        if (update) {
          setAvailableUpdate(update);
          setState("available");
          setMessage(
            nextMode === "portable"
              ? `Je dostupná portable verze ${update.version}.`
              : `Je dostupná aktualizace ${update.version}.`
          );
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

  const handlePrimaryAction = useCallback(async () => {
    if (!availableUpdate) {
      await checkForUpdates(false);
      return;
    }

    if (mode === "portable") {
      await openExternalUrl(availableUpdate.downloadUrl ?? availableUpdate.releaseUrl ?? GITHUB_RELEASES_URL);
      return;
    }

    const update = updateRef.current;
    if (!update) {
      await checkForUpdates(false);
      return;
    }

    setState("downloading");
    setMessage("Stahuji a instaluji aktualizaci…");
    setProgress(null);

    let downloaded = 0;
    let total: number | undefined;
    await update.downloadAndInstall((event: DownloadEvent) => {
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

    setMessage("Aktualizace je nainstalovaná, aplikace se restartuje.");
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  }, [availableUpdate, checkForUpdates, mode]);

  if (state === "hidden") return null;

  const currentVersion = runtimeInfo?.version ?? packageJson.version;
  const buttonLabel =
    state === "available"
      ? mode === "portable"
        ? "Stáhnout novou verzi"
        : "Aktualizovat"
      : state === "checking"
        ? "Kontroluji…"
        : "Zkontrolovat aktualizace";

  return (
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
  );
}
