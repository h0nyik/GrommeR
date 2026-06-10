"use client";

import { useEffect, useRef } from "react";
import { buildHighlightList, parseReleaseHighlights, type HighlightItem } from "@/lib/release-notes";

export type UpdateDialogState = "available" | "downloading" | "error";

export interface UpdatePromptDialogProps {
  version: string;
  currentVersion: string;
  notes?: string;
  mode: "installed" | "portable";
  manualDownload?: boolean;
  state: UpdateDialogState;
  progress: number | null;
  errorMessage?: string;
  releaseUrl?: string;
  onInstall: () => void;
  onDismiss: () => void;
  onOpenReleasePage: () => void;
}

function HighlightIcon({ kind }: { kind: HighlightItem["kind"] }) {
  if (kind === "fix") {
    return (
      <span aria-hidden className="mt-0.5 select-none text-emerald-500">
        ✓
      </span>
    );
  }
  return (
    <span aria-hidden className="mt-0.5 select-none text-amber-500">
      ✦
    </span>
  );
}

export function UpdatePromptDialog({
  version,
  currentVersion,
  notes,
  mode,
  manualDownload,
  state,
  progress,
  errorMessage,
  releaseUrl,
  onInstall,
  onDismiss,
  onOpenReleasePage,
}: UpdatePromptDialogProps) {
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const isBusy = state === "downloading";

  // Zavření klávesou Escape (nenásilné – stejné jako „Později").
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isBusy) {
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isBusy, onDismiss]);

  // Po otevření zaměříme primární tlačítko (přístupnost + nepřehlédnutelnost).
  useEffect(() => {
    primaryButtonRef.current?.focus();
  }, []);

  const highlights = parseReleaseHighlights(notes);
  const items = buildHighlightList(highlights, 6);
  const showRawNotes = !highlights.hasAny && Boolean(notes && notes.trim());

  const primaryLabel = isBusy
    ? progress != null
      ? `Stahuji… ${progress} %`
      : "Instaluji…"
    : mode === "portable" || manualDownload
      ? "Stáhnout novou verzi"
      : "Aktualizovat nyní";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={isBusy ? undefined : onDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-prompt-title"
      aria-describedby="update-prompt-subtitle"
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-2xl dark:bg-amber-500/15"
          >
            🎉
          </div>
          <div className="min-w-0">
            <h2
              id="update-prompt-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Je tu nová verze GrommeR!
            </h2>
            <p
              id="update-prompt-subtitle"
              className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400"
            >
              Verze{" "}
              <span className="font-medium text-zinc-600 dark:text-zinc-300">
                {currentVersion}
              </span>{" "}
              →{" "}
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {version}
              </span>
            </p>
          </div>
        </div>

        {items.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Co je nového:
            </p>
            <ul className="mt-2 space-y-1.5">
              {items.map((item, idx) => (
                <li
                  key={`${item.kind}-${idx}`}
                  className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-300"
                >
                  <HighlightIcon kind={item.kind} />
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : showRawNotes ? (
          <p className="mt-4 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {notes}
          </p>
        ) : (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
            Stáhněte si nejnovější vylepšení a opravy. Podrobnosti najdete na stránce vydání.
          </p>
        )}

        {releaseUrl ? (
          <button
            type="button"
            onClick={onOpenReleasePage}
            className="mt-3 text-sm text-amber-600 underline-offset-2 hover:underline dark:text-amber-400"
          >
            Všechny novinky na GitHubu →
          </button>
        ) : null}

        {state === "error" && errorMessage ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        {isBusy && progress != null ? (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={isBusy}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Připomenout příště
          </button>
          <button
            ref={primaryButtonRef}
            type="button"
            onClick={onInstall}
            disabled={isBusy}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-zinc-900"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
