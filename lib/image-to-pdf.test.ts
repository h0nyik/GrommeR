/**
 * Unit testy pro vytvoření PDF z obrázku.
 */

import { describe, expect, it } from "vitest";
import UTIF from "utif";
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
  return new Uint8Array(Buffer.from(MINIMAL_PNG_BASE64, "base64"));
}

function createTestTiff(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255);
  return new Uint8Array(UTIF.encodeImage(rgba, width, height));
}

describe("image-to-pdf", () => {
  describe("isSupportedImageType", () => {
    it("akceptuje podporované MIME typy", () => {
      expect(isSupportedImageType("image/jpeg")).toBe(true);
      expect(isSupportedImageType("image/png")).toBe(true);
      expect(isSupportedImageType("image/tiff")).toBe(true);
      expect(isSupportedImageType("image/webp")).toBe(true);
    });
    it("odmítne ostatní typy", () => {
      expect(isSupportedImageType("image/gif")).toBe(true);
      expect(isSupportedImageType("image/svg+xml")).toBe(false);
      expect(isSupportedImageType("application/pdf")).toBe(false);
    });
  });

  describe("createPdfFromImage", () => {
    it("vytvoří PDF s jednou stránkou o rozměrech PNG", async () => {
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

    it("vytvoří PDF z TIFF", async () => {
      const tiffBytes = createTestTiff(4, 3);
      const pdfBytes = await createPdfFromImage(tiffBytes, "image/tiff");
      const doc = await loadPdfDocument(pdfBytes);
      const pages = doc.getPages();
      expect(pages).toHaveLength(1);
      expect(pages[0].getWidth()).toBe(4);
      expect(pages[0].getHeight()).toBe(3);
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

    it("vrátí rozměry TIFF v mm", async () => {
      const tiffBytes = createTestTiff(10, 5);
      const dim = await getImageDimensionsMm(tiffBytes, "image/tiff");
      const ptToMm = 25.4 / 72;
      expect(dim.widthMm).toBeCloseTo(10 * ptToMm, 3);
      expect(dim.heightMm).toBeCloseTo(5 * ptToMm, 3);
    });
  });
});
