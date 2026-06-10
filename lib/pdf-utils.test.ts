/**
 * Unit testy pro práci s PDF (načtení, boxy, vložení značek).
 */

import { PDFDocument, PDFName, PDFNumber, rgb } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  addGrommetMarksToPdf,
  getPageInfo,
  loadPdfDocument,
  normalizeDrawingScale,
} from "./pdf-utils";

/** Vytvoří minimální PDF s jednou stránkou (šířka 400 pt, výška 600 pt). Musí mít kreslený obsah kvůli embedPage při měřítku. */
async function createMinimalPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 600]);
  page.drawRectangle({
    x: 1,
    y: 1,
    width: 398,
    height: 598,
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.5,
  });
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

describe("normalizeDrawingScale", () => {
  it("vrátí 1 pro neplatné nebo chybějící hodnoty", () => {
    expect(normalizeDrawingScale(undefined)).toBe(1);
    expect(normalizeDrawingScale(NaN)).toBe(1);
    expect(normalizeDrawingScale(0)).toBe(1);
    expect(normalizeDrawingScale(-2)).toBe(1);
  });

  it("omezuje horní mez", () => {
    expect(normalizeDrawingScale(200)).toBe(100);
  });

  it("ponechá platné N", () => {
    expect(normalizeDrawingScale(10)).toBe(10);
    expect(normalizeDrawingScale(2.5)).toBe(2.5);
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

describe("addGrommetMarksToPdf in-place (1:1)", () => {
  it("přidá značky bez nového dokumentu při měřítku 1", async () => {
    const bytes = await createMinimalPdf();
    const result = await addGrommetMarksToPdf(
      bytes,
      {
        widthMm: 400 * (25.4 / 72),
        heightMm: 600 * (25.4 / 72),
        edges: ["top"],
        offsetXMm: 5,
        offsetYMm: 5,
        mode: "count",
        countPerEdge: 2,
      },
      {
        shape: "circle",
        sizeMm: 5,
        borderColor: { type: "rgb", r: 0, g: 0, b: 0 },
      },
      { drawingScale: 1 }
    );
    expect(result.length).toBeGreaterThan(100);
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

  it("při drawingScale 2 zvětší výstupní stránku 2× oproti zdroji", async () => {
    const bytes = await createMinimalPdf();
    const srcInfo = getPageInfo((await loadPdfDocument(bytes)).getPages()[0], 0);

    const result = await addGrommetMarksToPdf(
      bytes,
      {
        widthMm: 1,
        heightMm: 1,
        edges: ["top"],
        offsetXMm: 10,
        offsetYMm: 10,
        mode: "count",
        countPerEdge: 2,
      },
      {
        shape: "circle",
        sizeMm: 5,
        borderColor: { type: "rgb", r: 0, g: 0, b: 0 },
      },
      { drawingScale: 2 }
    );

    const outDoc = await loadPdfDocument(result);
    const outPage = outDoc.getPages()[0];
    const outInfo = getPageInfo(outPage, 0);

    expect(outInfo.widthMm).toBeCloseTo(srcInfo.widthMm * 2, 4);
    expect(outInfo.heightMm).toBeCloseTo(srcInfo.heightMm * 2, 4);
  });

  it("zpracuje plátno 2450×1300 mm při měřítku 1:1 (typická plachta)", async () => {
    const MM_TO_PT = 72 / 25.4;
    const wMm = 2450;
    const hMm = 1300;
    const doc = await PDFDocument.create();
    const page = doc.addPage([wMm * MM_TO_PT, hMm * MM_TO_PT]);
    page.drawRectangle({
      x: 10,
      y: 10,
      width: wMm * MM_TO_PT - 20,
      height: hMm * MM_TO_PT - 20,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    const bytes = await doc.save();

    const result = await addGrommetMarksToPdf(
      bytes,
      {
        widthMm: wMm,
        heightMm: hMm,
        edges: ["top", "bottom", "left", "right"],
        offsetXMm: 2.8,
        offsetYMm: 2.8,
        mode: "spacing",
        spacingMm: 480,
      },
      {
        shape: "circle",
        sizeMm: 5,
        borderColor: { type: "rgb", r: 0, g: 0, b: 0 },
      },
      { drawingScale: 1 }
    );

    expect(result.length).toBeGreaterThan(100);
    const outDoc = await loadPdfDocument(result);
    expect(outDoc.getPages().length).toBe(1);
  });

  it("podporuje velké cílové plátno přes PDF UserUnit", async () => {
    const bytes = await createMinimalPdf();
    const result = await addGrommetMarksToPdf(
      bytes,
      {
        widthMm: 12_000,
        heightMm: 2_000,
        edges: ["top", "bottom"],
        offsetXMm: 100,
        offsetYMm: 100,
        mode: "spacing",
        spacingMm: 500,
      },
      {
        shape: "circle",
        sizeMm: 20,
        borderColor: { type: "rgb", r: 0, g: 0, b: 0 },
      },
      { targetSizeMm: { widthMm: 12_000, heightMm: 2_000 } }
    );

    const doc = await loadPdfDocument(result);
    const page = doc.getPages()[0];
    const info = getPageInfo(page, 0);
    const userUnit = page.node.lookup(PDFName.of("UserUnit")) as PDFNumber;

    expect(info.widthMm).toBeCloseTo(12_000, 1);
    expect(info.heightMm).toBeCloseTo(2_000, 1);
    expect(userUnit.asNumber()).toBeGreaterThan(1);
  });
});
