/**
 * Unit testy pro detekci vstupních formátů.
 */

import { describe, expect, it } from "vitest";
import {
  getFileAcceptAttribute,
  getInputFileKind,
  getMimeFromFilename,
  getTauriFileExtensions,
  stripInputExtension,
} from "./input-formats";

function mockFile(name: string, type = ""): File {
  return new File([new Uint8Array([1])], name, { type });
}

describe("input-formats", () => {
  it("rozpozná PDF a běžné rastrové formáty", () => {
    expect(getInputFileKind(mockFile("a.pdf", "application/pdf"))).toBe("pdf");
    expect(getInputFileKind(mockFile("a.jpg"))).toBe("image/jpeg");
    expect(getInputFileKind(mockFile("a.jpeg", "image/jpeg"))).toBe("image/jpeg");
    expect(getInputFileKind(mockFile("a.png"))).toBe("image/png");
    expect(getInputFileKind(mockFile("a.tif"))).toBe("image/tiff");
    expect(getInputFileKind(mockFile("a.TIFF", "image/tiff"))).toBe("image/tiff");
    expect(getInputFileKind(mockFile("a.webp"))).toBe("image/webp");
    expect(getInputFileKind(mockFile("a.gif"))).toBe("image/gif");
    expect(getInputFileKind(mockFile("a.bmp"))).toBe("image/bmp");
  });

  it("odmítne nepodporované typy", () => {
    expect(getInputFileKind(mockFile("a.psd"))).toBeNull();
    expect(getInputFileKind(mockFile("a.svg", "image/svg+xml"))).toBeNull();
  });

  it("mapuje příponu na MIME pro Tauri import", () => {
    expect(getMimeFromFilename("grafika.tif")).toBe("image/tiff");
    expect(getMimeFromFilename("grafika.tiff")).toBe("image/tiff");
    expect(getMimeFromFilename("banner.webp")).toBe("image/webp");
  });

  it("stripInputExtension odstraní všechny vstupní přípony", () => {
    expect(stripInputExtension("banner.pdf")).toBe("banner");
    expect(stripInputExtension("banner.tif")).toBe("banner");
    expect(stripInputExtension("banner.tiff")).toBe("banner");
    expect(stripInputExtension("photo.JPG")).toBe("photo");
  });

  it("exportuje accept a Tauri extensions", () => {
    expect(getFileAcceptAttribute()).toContain("image/tiff");
    expect(getTauriFileExtensions()).toContain("tif");
    expect(getTauriFileExtensions()).toContain("tiff");
    expect(getTauriFileExtensions()).toContain("webp");
  });
});
