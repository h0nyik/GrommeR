/**
 * Testy lossless cest pro TIFF a passthrough JPG/PNG.
 */

import { describe, expect, it } from "vitest";
import UTIF from "utif";
import { prepareRasterForPdfEmbed } from "./image-decode";
import { tryExtractEmbeddedJpegFromTiff } from "./tiff-jpeg-extract";
import { createPdfFromImage } from "./image-to-pdf";
import { loadPdfDocument } from "./pdf-utils";

/** Minimální platný 1×1 JPEG. */
const MINIMAL_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGA/wD/2Q==";

function minimalJpeg(): Uint8Array {
  return new Uint8Array(Buffer.from(MINIMAL_JPEG_BASE64, "base64"));
}

function writeIfdEntry(
  view: DataView,
  offset: number,
  tag: number,
  type: number,
  count: number,
  value: number
): number {
  view.setUint16(offset, tag, true);
  view.setUint16(offset + 2, type, true);
  view.setUint32(offset + 4, count, true);
  view.setUint32(offset + 8, value, true);
  return offset + 12;
}

/** Jednoduchý TIFF s JPEGInterchangeFormat (tiskový JPEG-in-TIFF scénář). */
function buildTiffWithJpegInterchange(
  jpeg: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const ifdOffset = 8;
  const entryCount = 8;
  const ifdSize = 2 + entryCount * 12 + 4;
  const dataOffset = ifdOffset + ifdSize;
  const totalSize = dataOffset + jpeg.length;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  bytes[0] = 0x49;
  bytes[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);

  let p = ifdOffset;
  view.setUint16(p, entryCount, true);
  p += 2;
  p = writeIfdEntry(view, p, 256, 3, 1, width);
  p = writeIfdEntry(view, p, 257, 3, 1, height);
  p = writeIfdEntry(view, p, 259, 3, 1, 7);
  p = writeIfdEntry(view, p, 262, 3, 1, 6);
  p = writeIfdEntry(view, p, 277, 3, 1, 3);
  p = writeIfdEntry(view, p, 278, 3, 1, height);
  p = writeIfdEntry(view, p, 273, 4, 1, dataOffset);
  p = writeIfdEntry(view, p, 279, 4, 1, jpeg.length);
  p = writeIfdEntry(view, p, 513, 4, 1, dataOffset);
  p = writeIfdEntry(view, p, 514, 4, 1, jpeg.length);
  view.setUint32(p, 0, true);

  bytes.set(jpeg, dataOffset);
  return bytes;
}

function createTestTiffRgba(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    rgba[o] = 10;
    rgba[o + 1] = 20;
    rgba[o + 2] = 30;
    rgba[o + 3] = 255;
  }
  return new Uint8Array(UTIF.encodeImage(rgba, width, height));
}

describe("tiff-jpeg-extract", () => {
  it("extrahuje vložený JPEG beze změny bajtů", () => {
    const jpeg = minimalJpeg();
    const tiff = buildTiffWithJpegInterchange(jpeg, 1, 1);
    const extracted = tryExtractEmbeddedJpegFromTiff(tiff);
    expect(extracted).not.toBeNull();
    expect(Array.from(extracted!)).toEqual(Array.from(jpeg));
  });
});

describe("image quality paths", () => {
  it("JPG a PNG projdou prepareRaster beze změny bajtů", async () => {
    const jpeg = minimalJpeg();
    const jpegPrep = await prepareRasterForPdfEmbed(jpeg, "image/jpeg");
    expect(jpegPrep.mimeType).toBe("image/jpeg");
    expect(Array.from(jpegPrep.bytes)).toEqual(Array.from(jpeg));

    const minimalPng = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64"
      )
    );
    const pngPrep = await prepareRasterForPdfEmbed(minimalPng, "image/png");
    expect(pngPrep.mimeType).toBe("image/png");
    expect(Array.from(pngPrep.bytes)).toEqual(Array.from(minimalPng));
  });

  it("JPEG-in-TIFF vytvoří PDF bez PNG mezikroku", async () => {
    const jpeg = minimalJpeg();
    const tiff = buildTiffWithJpegInterchange(jpeg, 1, 1);
    const prepared = await prepareRasterForPdfEmbed(tiff, "image/tiff");
    expect(prepared.mimeType).toBe("image/jpeg");
    expect(Array.from(prepared.bytes)).toEqual(Array.from(jpeg));

    const pdf = await createPdfFromImage(tiff, "image/tiff");
    const doc = await loadPdfDocument(pdf);
    expect(doc.getPages()).toHaveLength(1);
  });

  it("8bit RGBA TIFF zachová rozměry pixelů v PDF", async () => {
    const tiff = createTestTiffRgba(6, 4);
    const pdf = await createPdfFromImage(tiff, "image/tiff");
    const doc = await loadPdfDocument(pdf);
    const page = doc.getPages()[0];
    expect(page.getWidth()).toBe(6);
    expect(page.getHeight()).toBe(4);
  });
});
