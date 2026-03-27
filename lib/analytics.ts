/**
 * Minimální anonymní sběr dat o používání aplikace.
 * Žádná osobní identifikace, pouze agregované události (počty, typy akcí).
 * Volitelně odeslání na konfigurovatelný endpoint (NEXT_PUBLIC_ANALYTICS_ENDPOINT).
 */

export type AnalyticsEvent =
  | { type: "app_open"; timestamp: number }
  | { type: "pdf_generated"; single: true; timestamp: number }
  | { type: "batch_generated"; count: number; timestamp: number }
  | { type: "error"; message: string; context?: string; timestamp: number };

/** Událost bez timestamp (pro volání track()). */
export type TrackEvent =
  | { type: "app_open" }
  | { type: "pdf_generated"; single: true }
  | { type: "batch_generated"; count: number }
  | { type: "error"; message: string; context?: string };

const STORAGE_KEY = "grommet_analytics_queue";
const MAX_QUEUE = 100;
const CONSENT_KEY = "grommet_analytics_consent";

function getQueue(): AnalyticsEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const q = JSON.parse(raw) as AnalyticsEvent[];
    return Array.isArray(q) ? q.slice(-MAX_QUEUE) : [];
  } catch {
    return [];
  }
}

function saveQueue(q: AnalyticsEvent[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
  } catch {
    // ignore
  }
}

/** Uživatel souhlasil se sběrem (výchozí true pro anonymní statistiky). Lze vypnout v UI. */
export function getAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    if (v === "false") return false;
    if (v === "true") return true;
    return true; // výchozí souhlas pro anonymní data
  } catch {
    return false;
  }
}

export function setAnalyticsConsent(consent: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONSENT_KEY, consent ? "true" : "false");
  } catch {
    // ignore
  }
}

function enqueue(event: AnalyticsEvent) {
  const q = getQueue();
  q.push(event);
  saveQueue(q);
}

async function sendToEndpoint(events: AnalyticsEvent[]): Promise<void> {
  const url = typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
  if (!url || typeof url !== "string" || !url.startsWith("http")) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: "grommet-marks", events }),
    });
  } catch {
    // keep in queue for next time
  }
}

/** Zaznamená událost a volitelně odešle na server. */
export function track(event: TrackEvent): void {
  if (typeof window === "undefined") return;
  if (!getAnalyticsConsent()) return;
  const full: AnalyticsEvent = { ...event, timestamp: Date.now() };
  enqueue(full);
  sendToEndpoint([full]);
}

/** Jednorázové odeslání celé fronty (např. při odchodu). */
export function flushQueue(): void {
  const q = getQueue();
  if (q.length === 0) return;
  sendToEndpoint(q);
  saveQueue([]);
}
