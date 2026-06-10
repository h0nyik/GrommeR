/**
 * Lehké načtení rozměrů PDF přes pdf.js – bez plného parsování obrázků v pdf-lib.
 * Vhodné pro analýzu velkých tiskových PDF v dávce.
 */

import type { PdfBox, PdfPageInfo } from "@/types/grommet";

const PT_TO_MM = 25.4 / 72;

let pdfjsWorkerConfigured = false;

async function getPdfJs() {
  const isBrowser = typeof window !== "undefined";
  const pdfjs = isBrowser
    ? await import("pdfjs-dist")
    : await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjsWorkerConfigured) {
    if (isBrowser) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url
      ).toString();
    } else {
      const { createRequire } = await import("node:module");
      const { pathToFileURL } = await import("node:url");
      const require = createRequire(import.meta.url);
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
        require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")
      ).href;
    }
    pdfjsWorkerConfigured = true;
  }
  return pdfjs;
}

function boxFromView(view: number[]): PdfBox {
  const [x1, y1, x2, y2] = view;
  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  };
}

/**
 * Vrátí rozměry první stránky PDF bez načtení celého dokumentu přes pdf-lib.
 */
export async function getPdfPageInfoLight(
  bytes: Uint8Array,
  pageIndex = 0
): Promise<PdfPageInfo> {
  const pdfjs = await getPdfJs();
  const data = new Uint8Array(bytes);

  const pdf = await pdfjs.getDocument({
    data,
    disableAutoFetch: true,
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  const page = await pdf.getPage(pageIndex + 1);
  const view = page.view;
  const userUnit =
    typeof (page as { userUnit?: number }).userUnit === "number" &&
    (page as { userUnit?: number }).userUnit! > 0
      ? (page as { userUnit: number }).userUnit
      : 1;

  const mediaBox = boxFromView(view);
  const trimBox = mediaBox;

  return {
    pageIndex,
    userUnit,
    mediaBox,
    cropBox: mediaBox,
    bleedBox: mediaBox,
    trimBox,
    artBox: mediaBox,
    widthMm: trimBox.width * userUnit * PT_TO_MM,
    heightMm: trimBox.height * userUnit * PT_TO_MM,
  };
}
