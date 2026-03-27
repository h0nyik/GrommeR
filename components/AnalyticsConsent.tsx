"use client";

import { useEffect, useState } from "react";
import { getAnalyticsConsent, setAnalyticsConsent, track } from "@/lib/analytics";

export function AnalyticsConsent() {
  const [consent, setConsent] = useState<boolean | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    setConsent(getAnalyticsConsent());
    setShowBanner(true);
  }, []);

  useEffect(() => {
    if (!consent) return;
    track({ type: "app_open" });
  }, [consent]);

  if (consent === null || !showBanner) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-4 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      <span>Aplikace může ukládat anonymní statistiky (počet vygenerovaných souborů, chyby).</span>
      <label className="flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            const v = e.target.checked;
            setAnalyticsConsent(v);
            setConsent(v);
          }}
          className="rounded border-zinc-400"
        />
        <span>Souhlasím se sběrem</span>
      </label>
    </div>
  );
}
