/**
 * Parsování release poznámek (markdown) na stručná „lákadla" pro úvodní popup
 * o dostupné aktualizaci.
 *
 * Vstupem je tělo poznámek (`update.body` z Tauri updateru nebo `release.body`
 * z GitHubu). Výstupem jsou roztříděné odrážky: novinky vs. opravy, plus
 * případný zbytek. Sekce „Poznámky pro instalaci" a „Stažení" se ignorují.
 */

export interface ReleaseHighlights {
  /** Odrážky z novinek / hlavních změn. */
  features: string[];
  /** Odrážky z oprav. */
  fixes: string[];
  /** Odrážky z ostatních (nezařazených) sekcí. */
  other: string[];
  /** True, pokud se podařilo vytáhnout aspoň jednu odrážku. */
  hasAny: boolean;
}

type Category = "features" | "fixes" | "other" | "skip";

/** Odstraní diakritiku a převede na malá písmena pro porovnávání nadpisů. */
function normalizeHeading(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Zařadí nadpis sekce do kategorie podle klíčových slov (CZ i EN). */
function categorizeHeading(headingText: string): Category {
  const h = normalizeHeading(headingText);
  if (/(poznamk|stazen|instal|download|note)/.test(h)) return "skip";
  if (/(oprav|fix|bug)/.test(h)) return "fixes";
  if (/(hlavni zmen|novink|nove funkce|nova funkce|feature|vylepsen|zmen|added|new)/.test(h)) {
    return "features";
  }
  return "other";
}

/** Vyčistí inline markdown (odkazy, tučné, kód) na čistý text. */
function cleanInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold** -> bold
    .replace(/__([^_]+)__/g, "$1") // __bold__ -> bold
    .replace(/\*([^*]+)\*/g, "$1") // *italic* -> italic
    .replace(/`([^`]+)`/g, "$1") // `code` -> code
    .replace(/\s+/g, " ")
    .trim();
}

const BULLET_RE = /^\s*[-*+]\s+(.+)$/;
const HEADING_RE = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/;

/**
 * Rozparsuje markdown poznámky na roztříděné odrážky.
 * Pokud poznámky nemají nadpisy ani odrážky, vrátí prázdné kategorie
 * (volající pak může zobrazit surový text jako fallback).
 */
export function parseReleaseHighlights(notes: string | null | undefined): ReleaseHighlights {
  const result: ReleaseHighlights = {
    features: [],
    fixes: [],
    other: [],
    hasAny: false,
  };
  if (!notes) return result;

  let current: Category = "other";

  for (const rawLine of notes.split(/\r?\n/)) {
    const headingMatch = rawLine.match(HEADING_RE);
    if (headingMatch) {
      current = categorizeHeading(headingMatch[1]);
      continue;
    }

    if (current === "skip") continue;

    const bulletMatch = rawLine.match(BULLET_RE);
    if (!bulletMatch) continue;

    const text = cleanInline(bulletMatch[1]);
    if (!text) continue;

    result[current].push(text);
  }

  result.hasAny =
    result.features.length > 0 || result.fixes.length > 0 || result.other.length > 0;
  return result;
}

/**
 * Připraví zkrácený seznam odrážek pro popup – nejdřív novinky, pak opravy,
 * případně ostatní, s omezením na celkový počet. Vrací položky s příznakem typu,
 * aby je UI mohlo odlišit (např. ikonou).
 */
export interface HighlightItem {
  text: string;
  kind: "feature" | "fix" | "other";
}

export function buildHighlightList(
  highlights: ReleaseHighlights,
  maxItems = 6
): HighlightItem[] {
  const items: HighlightItem[] = [
    ...highlights.features.map((text): HighlightItem => ({ text, kind: "feature" })),
    ...highlights.fixes.map((text): HighlightItem => ({ text, kind: "fix" })),
    ...highlights.other.map((text): HighlightItem => ({ text, kind: "other" })),
  ];
  return items.slice(0, maxItems);
}
