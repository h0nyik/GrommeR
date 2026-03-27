/**
 * Unit testy pro práci s PDF (načtení, boxy, vložení značek).
 */

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  addGrommetMarksToPdf,
  getPageInfo,
  loadPdfDocument,
} from "./pdf-utils";

/** Vytvoří minimální PDF s jednou stránkou (šířka 400 pt, výška 600 pt). */
async function createMinimalPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([400, 600]);
  return doc.save();
}

describe("loadPdfDocument", () => {
  it("načte PDF a vrátí dokument s alespoň jednou stránkou", async () => {
    const bytes = await createMinimalPdf();
    const doc = await loadPdfDocument(bytes);
    const pages = doc.getPages();
    expect(pages.length).toBe(1);
  });

  it("akceptuje ArrayBuffer", async () => {
    const bytes = await createMinimalPdf();
    const buf = bytes.buffer;
    const doc = await loadPdfDocument(buf);
    expect(doc.getPages().length).toBe(1);
  });
});

describe("getPageInfo", () => {
  it("vrátí rozměry stránky v mm a všechny boxy", async () => {
    const bytes = await createMinimalPdf();
    const doc = await loadPdfDocument(bytes);
    const page = doc.getPages()[0];
    const info = getPageInfo(page, 0);

    expect(info.pageIndex).toBe(0);
    expect(info.mediaBox.width).toBe(400);
    expect(info.mediaBox.height).toBe(600);
    expect(info.mediaBox.x).toBe(0);
    expect(info.mediaBox.y).toBe(0);

    // pdf-lib výchozí: CropBox = MediaBox, ArtBox = CropBox
    expect(info.cropBox.width).toBe(400);
    expect(info.artBox.width).toBe(400);

    // widthMm/heightMm jsou z TrimBoxu; pokud TrimBox není nastaven, pdf-lib fallbackuje na MediaBox.
    // Pro minimální PDF bez TrimBoxu → TrimBox = MediaBox = 400×600 pt.
    const expectedWidthMm = (400 * 25.4) / 72;
    const expectedHeightMm = (600 * 25.4) / 72;
    expect(info.widthMm).toBeCloseTo(expectedWidthMm, 5);
    expect(info.heightMm).toBeCloseTo(expectedHeightMm, 5);
  });
});

describe("addGrommetMarksToPdf", () => {
  it("přidá značky a vrátí platné PDF bytes", async () => {
    const bytes = await createMinimalPdf();
    const result = await addGrommetMarksToPdf(
      bytes,
      {
        widthMm: 100,
        heightMm: 100,
        edges: ["top"],
        offsetXMm: 10,
        offsetYMm: 10,
        mode: "count",
        countPerEdge: 3,
      },
      {
        shape: "circle",
        sizeMm: 5,
        borderColor: { type: "rgb", r: 0, g: 0, b: 0 },
      }
    );

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(100);

    const doc = await loadPdfDocument(result);
    expect(doc.getPages().length).toBe(1);
  });

  it("vykreslí čtvercové značky při shape square", async () => {
    const bytes = await createMinimalPdf();
    const result = await addGrommetMarksToPdf(
      bytes,
      {
        widthMm: 140,
        heightMm: 210,
        edges: ["bottom"],
        offsetXMm: 10,
        offsetYMm: 10,
        mode: "count",
        countPerEdge: 1,
      },
      {
        shape: "square",
        sizeMm: 8,
        borderColor: { type: "rgb", r: 1, g: 0, b: 0 },
      }
    );

    expect(result.length).toBeGreaterThan(100);
    const doc = await loadPdfDocument(result);
    expect(doc.getPages().length).toBe(1);
  });
});
