import { describe, expect, it, vi } from "vitest";
import {
  canUseNativePdfMarks,
  NATIVE_PDF_MARKS_THRESHOLD_BYTES,
} from "./pdf-native";
import * as tauriBridge from "./tauri-bridge";

describe("canUseNativePdfMarks", () => {
  it("povolí nativní cestu pro velké PDF v Tauri při měřítku 1:1", () => {
    vi.spyOn(tauriBridge, "isTauri").mockReturnValue(true);
    expect(
      canUseNativePdfMarks({
        sourcePath: "C:\\data\\banner.pdf",
        fileKind: "pdf",
        fileSize: NATIVE_PDF_MARKS_THRESHOLD_BYTES,
        drawingScale: 1,
        hasTargetSize: false,
      })
    ).toBe(true);
  });

  it("zakáže nativní cestu bez cesty nebo při měřítku", () => {
    vi.spyOn(tauriBridge, "isTauri").mockReturnValue(true);
    expect(
      canUseNativePdfMarks({
        sourcePath: null,
        fileKind: "pdf",
        fileSize: NATIVE_PDF_MARKS_THRESHOLD_BYTES,
        drawingScale: 1,
        hasTargetSize: false,
      })
    ).toBe(false);
    expect(
      canUseNativePdfMarks({
        sourcePath: "C:\\data\\banner.pdf",
        fileKind: "pdf",
        fileSize: NATIVE_PDF_MARKS_THRESHOLD_BYTES,
        drawingScale: 2,
        hasTargetSize: false,
      })
    ).toBe(false);
  });
});
