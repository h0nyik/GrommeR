/**
 * Lossless extrakce vloženého JPEG ze TIFF (časté u tiskových souborů).
 * Vyhne se dekódování → RGBA → PNG, které by zhoršilo kvalitu u JPEG-in-TIFF.
 */

import UTIF from "utif";

const SOI = 0xd8;
const EOI = 0xd9;

function sliceJpegThroughEoi(data: Uint8Array, start: number, maxEnd: number): Uint8Array | null {
  if (data[start] !== 0xff || data[start + 1] !== SOI) return null;
  let end = Math.min(maxEnd, data.length);
  for (let i = start + 2; i < maxEnd - 1; i++) {
    if (data[i] === 0xff && data[i + 1] === EOI) {
      end = i + 2;
      break;
    }
  }
  if (end <= start + 2) return null;
  return data.slice(start, end);
}

type TiffIfd = Record<string, number[]>;

function getStripRange(page: TiffIfd): { off: number; len: number } | null {
  const soff = page["t273"] ?? page["t324"];
  const bcnt = page["t279"] ?? page["t325"];
  if (!soff?.length || !bcnt?.length) return null;
  if (soff.length !== 1 || bcnt.length !== 1) return null;
  return { off: soff[0], len: bcnt[0] };
}

function assembleOldJpeg(
  page: TiffIfd,
  data: Uint8Array,
  off: number,
  len: number
): Uint8Array | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decode = (UTIF as any).decode;
  if (typeof decode?._decodeOldJPEGInit !== "function") return null;
  const init = decode._decodeOldJPEGInit(page, data, off, len) as {
    jpegOffset?: number;
    tables?: Uint8Array;
    sosMarker?: Uint8Array;
    sofPosition?: number;
  } | null;
  if (!init) return null;

  if (init.jpegOffset != null) {
    return sliceJpegThroughEoi(data, init.jpegOffset, data.length);
  }

  if (!init.tables || !init.sosMarker) return null;

  const tables = new Uint8Array(init.tables);
  if (init.sofPosition != null && init.sofPosition + 8 < tables.length) {
    const height = page["t257"]?.[0] ?? 0;
    const width = page["t256"]?.[0] ?? 0;
    tables[init.sofPosition + 5] = (height >>> 8) & 255;
    tables[init.sofPosition + 6] = height & 255;
    tables[init.sofPosition + 7] = (width >>> 8) & 255;
    tables[init.sofPosition + 8] = width & 255;
  }

  const scanStartsWithSos =
    data[off] === 0xff && data[off + 1] === 0xda;
  const bodyLen = scanStartsWithSos ? len : init.sosMarker.length + len;
  const out = new Uint8Array(tables.length + bodyLen + 2);
  out.set(tables);
  let writeAt = tables.length;
  if (!scanStartsWithSos) {
    out.set(init.sosMarker, writeAt);
    writeAt += init.sosMarker.length;
  }
  for (let i = 0; i < len; i++) out[writeAt++] = data[off + i];
  out[writeAt++] = 0xff;
  out[writeAt++] = EOI;
  return out.subarray(0, writeAt);
}

/**
 * Pokud TIFF obsahuje JPEG bitstream (bez ztráty), vrátí jeho bajty pro pdf-lib embedJpg.
 * Jinak null → použije se lossless RGBA/PNG cesta.
 */
export function tryExtractEmbeddedJpegFromTiff(bytes: Uint8Array): Uint8Array | null {
  const data = new Uint8Array(bytes);
  const ifds = UTIF.decode(data.slice().buffer) as TiffIfd[];
  if (!ifds.length) return null;

  const page = ifds[0];
  const width = page["t256"]?.[0];
  const height = page["t257"]?.[0];
  if (!width || !height) return null;

  const jifOff = page["t513"]?.[0];
  const jifLen = page["t514"]?.[0];
  if (jifOff != null && jifLen != null && jifLen >= 2) {
    const slice = sliceJpegThroughEoi(data, jifOff, jifOff + jifLen);
    if (slice) return slice;
  }

  const cmpr = page["t259"]?.[0] ?? 1;
  if (cmpr !== 6 && cmpr !== 7) return null;

  const strip = getStripRange(page);
  if (!strip) return null;

  const direct = sliceJpegThroughEoi(data, strip.off, strip.off + strip.len);
  if (direct) return direct;

  if (cmpr === 6) {
    return assembleOldJpeg(page, data, strip.off, strip.len);
  }

  return null;
}

/** Formáty TIFF komprese bez ztráty pixelů při dekódování UTIF (8 bitů/kanál). */
export function isLosslessTiffCompression(compression: number): boolean {
  return (
    compression === 1 ||
    compression === 5 ||
    compression === 8 ||
    compression === 32773
  );
}

export function describeTiffQualityPath(page: TiffIfd): "jpeg-embed" | "lossless-rgba" | "lossy-rgba" {
  const cmpr = page["t259"]?.[0] ?? 1;
  if (cmpr === 6 || cmpr === 7 || page["t513"] != null) return "jpeg-embed";
  if (isLosslessTiffCompression(cmpr)) return "lossless-rgba";
  return "lossy-rgba";
}
