/**
 * Integrační testy na reálných velkých PDF z dílny (pokud jsou v kořeni repa).
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { addGrommetMarksToPdf, getPageInfo, loadPdfDocument } from "./pdf-utils";

const LARGE_PDFS = [
  "B!-plachta-Liberec-1030x770cm.pdf",
  "Banner logo 3500 x 1000 mm 2ks.pdf",
  "Banner_logo_3500_x_1000_m__3.5x1m__GS30__TISK.pdf",
];

describe("velké reálné PDF", () => {
  for (const name of LARGE_PDFS) {
    const path = join(process.cwd(), name);
    if (!existsSync(path)) continue;

    it(`zpracuje ${name} bez Invalid array length`, async () => {
      const bytes = readFileSync(path);
      const doc = await loadPdfDocument(bytes);
      const info = getPageInfo(doc.getPages()[0], 0);
      expect(info.widthMm).toBeGreaterThan(100);
      expect(info.heightMm).toBeGreaterThan(100);

      const result = await addGrommetMarksToPdf(
        bytes,
        {
          widthMm: info.widthMm,
          heightMm: info.heightMm,
          edges: ["top", "bottom", "left", "right"],
          offsetXMm: 28,
          offsetYMm: 28,
          mode: "spacing",
          spacingMm: 300,
        },
        {
          shape: "circle",
          sizeMm: 5,
          borderColor: { type: "rgb", r: 0, g: 0, b: 0 },
        },
        { drawingScale: 1 }
      );

      expect(result.length).toBeGreaterThan(1000);
    }, 120_000);
  }
});
