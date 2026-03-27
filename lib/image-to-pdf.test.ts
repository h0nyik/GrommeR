/**
 * Unit testy pro vytvoření PDF z obrázku.
 */

import { describe, expect, it } from "vitest";
import { loadPdfDocument } from "./pdf-utils";
import {
  createPdfFromImage,
  getImageDimensionsMm,
  isSupportedImageType,
} from "./image-to-pdf";

/** Minimální platné 1×1 PNG (base64). */
const MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function getMinimalPngBytes(): Uint8Array {
  return new Uint8Array(
    Buffer.from(MINIMAL_PNG_BASE64, "base64")
  );
}

describe("image-to-pdf", () => {
  describe("isSupportedImageType", () => {
    it("akceptuje image/jpeg a image/png", () => {
      expect(isSupportedImageType("image/jpeg")).toBe(true);
      expect(isSupportedImageType("image/png")).toBe(true);
    });
    it("odmítne ostatní typy", () => {
      expect(isSupportedImageType("image/gif")).toBe(false);
      expect(isSupportedImageType("application/pdf")).toBe(false);
    });
  });

  describe("createPdfFromImage", () => {
    it("vytvoří PDF s jednou stránkou o rozměrech obrázku", async () => {
      const pngBytes = getMinimalPngBytes();
      const pdfBytes = await createPdfFromImage(pngBytes, "image/png");

      expect(pdfBytes).toBeInstanceOf(Uint8Array);
      expect(pdfBytes.length).toBeGreaterThan(100);

      const doc = await loadPdfDocument(pdfBytes);
      const pages = doc.getPages();
      expect(pages).toHaveLength(1);
      expect(pages[0].getWidth()).toBe(1);
      expect(pages[0].getHeight()).toBe(1);
    });
  });

  describe("getImageDimensionsMm", () => {
    it("vrátí rozměry v mm (1×1 px ≈ 0,35×0,35 mm)", async () => {
      const pngBytes = getMinimalPngBytes();
      const dim = await getImageDimensionsMm(pngBytes, "image/png");
      const ptToMm = 25.4 / 72;
      expect(dim.widthMm).toBeCloseTo(ptToMm, 4);
      expect(dim.heightMm).toBeCloseTo(ptToMm, 4);
    });
  });
});
