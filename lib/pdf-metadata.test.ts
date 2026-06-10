import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { getPdfPageInfoLight } from "./pdf-metadata";

async function createTestPdf(widthPt: number, heightPt: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([widthPt, heightPt]);
  return doc.save();
}

describe("getPdfPageInfoLight", () => {
  it("vrátí rozměry stránky v mm", async () => {
    const widthPt = 400;
    const heightPt = 600;
    const bytes = await createTestPdf(widthPt, heightPt);
    const light = await getPdfPageInfoLight(bytes);
    const expectedWidthMm = (widthPt * 25.4) / 72;
    const expectedHeightMm = (heightPt * 25.4) / 72;

    expect(light.widthMm).toBeCloseTo(expectedWidthMm, 1);
    expect(light.heightMm).toBeCloseTo(expectedHeightMm, 1);
    expect(light.pageIndex).toBe(0);
  });
});
