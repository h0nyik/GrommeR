/**
 * Unit testy pro generátor názvu výstupního souboru.
 */

import { describe, expect, it } from "vitest";
import {
  formatDimensionsForFilename,
  formatSpacingForFilename,
  generateOutputFilename,
  sanitizeBaseName,
} from "./output-filename";

describe("sanitizeBaseName", () => {
  it("odstraní příponu .pdf", () => {
    expect(sanitizeBaseName("banner.pdf")).toBe("banner");
  });

  it("odstraní suffixy final, export, v3", () => {
    expect(sanitizeBaseName("banner_final")).toBe("banner");
    expect(sanitizeBaseName("banner-export")).toBe("banner");
    expect(sanitizeBaseName("banner v3")).toBe("banner");
  });

  it("zkrátí na 25 znaků", () => {
    const long = "a".repeat(40);
    expect(sanitizeBaseName(long).length).toBeLessThanOrEqual(25);
  });

  it("nahradí diakritiku a mezery", () => {
    expect(sanitizeBaseName("Bannér pro tisk")).toBe("Banner_pro_tisk");
  });

  it("vrátí vystup pro prázdný výsledek", () => {
    expect(sanitizeBaseName("___final.pdf")).toBe("vystup");
  });
});

describe("formatDimensionsForFilename", () => {
  it("použije metry pro velké rozměry", () => {
    expect(formatDimensionsForFilename(13000, 2000)).toBe("13x2m");
  });

  it("použije cm pro menší rozměry (mm -> cm)", () => {
    expect(formatDimensionsForFilename(500, 240)).toBe("50x24cm");
  });
});

describe("formatSpacingForFilename", () => {
  it("jedna rozteč -> GS30", () => {
    expect(formatSpacingForFilename(30)).toBe("GS30");
  });

  it("dvě různé rozteče -> GS30x40", () => {
    expect(formatSpacingForFilename(30, 40)).toBe("GS30x40");
  });
});

describe("generateOutputFilename", () => {
  it("sestaví celý název dle konvence", () => {
    const name = generateOutputFilename({
      originalFileName: "banner-tisk.pdf",
      widthMm: 500,
      heightMm: 240,
      spacingCm: 30,
    });
    expect(name).toBe("banner-tisk__50x24cm__GS30__TISK.pdf");
  });

  it("s metry a zkráceným základem", () => {
    const name = generateOutputFilename({
      originalFileName: "Velký banner final v2.pdf",
      widthMm: 10000,
      heightMm: 2000,
      spacingCm: 25,
    });
    expect(name).toMatch(/^Velky_banner__10x2m__GS25__TISK\.pdf$/);
  });
});
