/**
 * Čisté funkce pro výpočet pozic značek průchodek na hranách stránky.
 * Symetrie: první a poslední značka ve stejné vzdálenosti od krajů (offset).
 * Jednotky: mm. Souřadnice: PDF systém (origin vlevo dole).
 */

import type { Edge, GrommetMarksParams, GrommetMarksResult, MarkPosition } from "@/types/grommet";

/** Délka hrany v mm (bez rohů – mezi offset body) */
function getEdgeLengthMm(
  edge: Edge,
  widthMm: number,
  heightMm: number,
  offsetXMm: number,
  offsetYMm: number
): number {
  switch (edge) {
    case "top":
    case "bottom":
      return Math.max(0, widthMm - 2 * offsetXMm);
    case "left":
    case "right":
      return Math.max(0, heightMm - 2 * offsetYMm);
  }
}

/**
 * Vypočte pozice značek podél jedné hrany.
 * Symetrie: první značka na offset, poslední na (délka - offset), mezi nimi rovnoměrně.
 */
function positionsAlongEdge(
  edge: Edge,
  lengthMm: number,
  offsetXMm: number,
  offsetYMm: number,
  widthMm: number,
  heightMm: number,
  count: number
): MarkPosition[] {
  if (count <= 0 || lengthMm <= 0) return [];

  const result: MarkPosition[] = [];
  const step = count === 1 ? 0 : lengthMm / (count - 1);

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i * step; // u jedné značky střed
    const rel = count === 1 ? lengthMm / 2 : t;

    switch (edge) {
      case "top": {
        result.push({
          x: offsetXMm + rel,
          y: heightMm - offsetYMm,
          edge: "top",
        });
        break;
      }
      case "bottom": {
        result.push({
          x: offsetXMm + rel,
          y: offsetYMm,
          edge: "bottom",
        });
        break;
      }
      case "left": {
        result.push({
          x: offsetXMm,
          y: offsetYMm + rel,
          edge: "left",
        });
        break;
      }
      case "right": {
        result.push({
          x: widthMm - offsetXMm,
          y: offsetYMm + rel,
          edge: "right",
        });
        break;
      }
    }
  }
  return result;
}

/**
 * Z požadované rozteče a délky hrany určí počet značek (symetricky: první a poslední na koncích).
 * Počet = floor((délka - 2*offset) / rozteč) + 1, ale délka už je (length - 0) v naší logice,
 * protože length je "použitelná délka" = width - 2*offsetX pro horní/dolní atd.
 */
function countFromSpacing(usableLengthMm: number, spacingMm: number): number {
  if (spacingMm <= 0 || usableLengthMm <= 0) return 0;
  const n = Math.floor(usableLengthMm / spacingMm) + 1;
  return Math.max(0, n);
}

/**
 * Hlavní funkce: vypočte všechny pozice značek podle parametrů.
 * Hraniční případy: příliš malá plocha nebo velká rozteč → méně nebo 0 značek + varování.
 */
export function computeGrommetMarks(params: GrommetMarksParams): GrommetMarksResult {
  const warnings: string[] = [];
  const {
    widthMm,
    heightMm,
    edges,
    offsetXMm,
    offsetYMm,
    mode,
    countPerEdge = 2,
    spacingMm = 30,
  } = params;

  if (widthMm <= 0 || heightMm <= 0) {
    return { positions: [], warnings: ["Šířka a výška musí být kladné."] };
  }

  if (edges.length === 0) {
    return { positions: [], warnings: ["Není vybrána žádná hrana."] };
  }

  const positions: MarkPosition[] = [];

  for (const edge of edges) {
    const lengthMm = getEdgeLengthMm(edge, widthMm, heightMm, offsetXMm, offsetYMm);

    if (lengthMm <= 0) {
      warnings.push(`Hrana ${edge}: žádná použitelná délka (offset větší než rozměr).`);
      continue;
    }

    let count: number;
    if (mode === "count") {
      count = Math.max(0, Math.floor(countPerEdge));
      if (count === 0) {
        warnings.push(`Hrana ${edge}: počet značek musí být alespoň 1.`);
        continue;
      }
      if (count === 1 && lengthMm > 0) {
        // jedna značka uprostřed
      } else if (count > 1 && lengthMm < 0.1) {
        warnings.push(`Hrana ${edge}: příliš malá délka pro ${count} značek.`);
        count = 0;
      }
    } else {
      count = countFromSpacing(lengthMm, spacingMm);
      if (count === 0) {
        warnings.push(
          `Hrana ${edge}: rozteč ${spacingMm} mm je větší než použitelná délka ${lengthMm.toFixed(1)} mm.`
        );
      }
    }

    const onEdge = positionsAlongEdge(
      edge,
      lengthMm,
      offsetXMm,
      offsetYMm,
      widthMm,
      heightMm,
      count
    );
    positions.push(...onEdge);
  }

  return { positions, warnings };
}
