import { describe, expect, it } from "vitest";
import {
  assertInputFileSize,
  formatBytesCs,
  shouldLoadPdfPreview,
  toFriendlyInputError,
} from "./input-bytes";

describe("formatBytesCs", () => {
  it("formátuje MB a GB", () => {
    expect(formatBytesCs(850 * 1024 * 1024)).toContain("MB");
    expect(formatBytesCs(1.5 * 1024 * 1024 * 1024)).toContain("GB");
  });
});

describe("assertInputFileSize", () => {
  it("odmítne soubor nad limitem", () => {
    expect(() => assertInputFileSize(2_000 * 1024 * 1024)).toThrow(/příliš velký/i);
  });
});

describe("shouldLoadPdfPreview", () => {
  it("nevynucuje náhled u velkého PDF", () => {
    const big = new File([new Uint8Array(1)], "a.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(big, "size", { value: 60 * 1024 * 1024 });
    expect(shouldLoadPdfPreview(big)).toBe(false);
  });
});

describe("toFriendlyInputError", () => {
  it("přeloží Invalid array length", () => {
    const msg = toFriendlyInputError(new RangeError("Invalid array length"), "fallback", 850e6);
    expect(msg).toMatch(/příliš velký|paměť/i);
    expect(msg).toContain("Invalid array length");
  });
});
