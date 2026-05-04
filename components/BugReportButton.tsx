"use client";

import { useCallback, useState } from "react";

function getEnvInfo(): string {
  if (typeof window === "undefined") return "";
  const ua = navigator.userAgent;
  const lang = navigator.language;
  const url = window.location.href;
  const w = window.innerWidth;
  const h = window.innerHeight;
  return `Prohlížeč: ${ua}\nJazyk: ${lang}\nURL: ${url}\nRozlišení okna: ${w}×${h}\n`;
}

export function BugReportButton() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [copied, setCopied] = useState(false);

  const buildReport = useCallback(() => {
    const body = `--- Popis chyby ---\n\n${description || "(neuvedeno)"}\n\n--- Kroky k reprodukci ---\n\n${steps || "(neuvedeno)"}\n\n--- Prostředí ---\n${getEnvInfo()}Datum: ${new Date().toISOString()}`;
    return body;
  }, [description, steps]);

  const handleCopy = useCallback(() => {
    const text = buildReport();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [buildReport]);

  const handleMailto = useCallback(() => {
    const body = encodeURIComponent(buildReport());
    const subject = encodeURIComponent("[Grommet Marks] Nahlášení chyby");
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }, [buildReport]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
      >
        Nahlásit chybu
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="bug-report-title"
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="bug-report-title" className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
              Nahlášení chyby
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Popište problém a kroky, jak ho zopakovat. Údaje o prohlížeči a prostředí se přidají automaticky.
            </p>

            <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Popis chyby
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              placeholder="Co se stalo? Co jste očekávali?"
            />

            <label className="mt-3 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Kroky k reprodukci
            </label>
            <textarea
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              placeholder="1. Otevřít aplikaci&#10;2. Nahrajte PDF&#10;3. …"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="rounded bg-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
              >
                {copied ? "Zkopírováno" : "Kopírovat do schránky"}
              </button>
              <button
                type="button"
                onClick={handleMailto}
                className="rounded bg-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
              >
                Otevřít e-mail
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
