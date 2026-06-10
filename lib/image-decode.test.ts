/**
 * Unit testy pro dekódování rastrů (TIFF → PNG).
 */

import { describe, expect, it } from "vitest";
import UTIF from "utif";
import { decodeTiffToPngBytes, decodeTiffToRgba, prepareRasterForPdfEmbed } from "./image-decode";

function createTestTiff(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    rgba[o] = 200;
    rgba[o + 1] = 40;
    rgba[o + 2] = 60;
    rgba[o + 3] = 255;
  }
  return new Uint8Array(UTIF.encodeImage(rgba, width, height));
}

describe("image-decode", () => {
  describe("decodeTiffToRgba", () => {
    it("dekóduje TIFF do RGBA", () => {
      const tiff = createTestTiff(3, 2);
      const decoded = decodeTiffToRgba(tiff);
      expect(decoded.width).toBe(3);
      expect(decoded.height).toBe(2);
      expect(decoded.rgba.length).toBe(3 * 2 * 4);
      expect(decoded.rgba[0]).toBe(200);
    });
  });

  describe("decodeTiffToPngBytes", () => {
    it("vrátí PNG hlavičku", () => {
      const tiff = createTestTiff(2, 2);
      const png = decodeTiffToPngBytes(tiff);
      expect(png[0]).toBe(0x89);
      expect(String.fromCharCode(png[1], png[2], png[3])).toBe("PNG");
    });
  });

  describe("prepareRasterForPdfEmbed", () => {
    it("ponechá JPEG beze změny", async () => {
      const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
      const prepared = await prepareRasterForPdfEmbed(jpeg, "image/jpeg");
      expect(prepared.mimeType).toBe("image/jpeg");
      expect(prepared.bytes).toBe(jpeg);
    });

    it("převede nekomprimovaný TIFF na lossless PNG", async () => {
      const tiff = createTestTiff(2, 2);
      const prepared = await prepareRasterForPdfEmbed(tiff, "image/tiff");
      expect(prepared.mimeType).toBe("image/png");
      expect(prepared.bytes[0]).toBe(0x89);
    });
  });
});
