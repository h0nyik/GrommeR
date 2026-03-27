/**
 * Unit testy pro výpočet pozic značek průchodek.
 */

import { describe, expect, it } from "vitest";
import { computeGrommetMarks } from "./grommet-marks";

describe("computeGrommetMarks", () => {
  it("vrací prázdné pozice při nulové šířce nebo výšce", () => {
    const r1 = computeGrommetMarks({
      widthMm: 0,
      heightMm: 100,
      edges: ["top"],
      offsetXMm: 10,
      offsetYMm: 10,
      mode: "count",
      countPerEdge: 3,
    });
    expect(r1.positions).toHaveLength(0);
    expect(r1.warnings.length).toBeGreaterThan(0);

    const r2 = computeGrommetMarks({
      widthMm: 100,
      heightMm: 0,
      edges: ["top"],
      offsetXMm: 10,
      offsetYMm: 10,
      mode: "count",
      countPerEdge: 3,
    });
    expect(r2.positions).toHaveLength(0);
  });

  it("vrací prázdné pozice při žádné vybrané hraně", () => {
    const r = computeGrommetMarks({
      widthMm: 100,
      heightMm: 100,
      edges: [],
      offsetXMm: 10,
      offsetYMm: 10,
      mode: "count",
      countPerEdge: 3,
    });
    expect(r.positions).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes("žádná hrana"))).toBe(true);
  });

  it("umístí 3 značky na horní hranu se symetrií (režim count)", () => {
    const r = computeGrommetMarks({
      widthMm: 100,
      heightMm: 50,
      edges: ["top"],
      offsetXMm: 10,
      offsetYMm: 5,
      mode: "count",
      countPerEdge: 3,
    });
    expect(r.positions).toHaveLength(3);
    expect(r.positions.every((p) => p.edge === "top")).toBe(true);
    // y by měla být konstantní (horní hrana minus offset)
    expect(r.positions[0].y).toBe(50 - 5);
    expect(r.positions[1].y).toBe(50 - 5);
    expect(r.positions[2].y).toBe(50 - 5);
    // první u offsetu, poslední u (width - offset)
    expect(r.positions[0].x).toBeCloseTo(10, 5);
    expect(r.positions[2].x).toBeCloseTo(90, 5);
    // střední uprostřed
    expect(r.positions[1].x).toBeCloseTo(50, 5);
  });

  it("umístí 1 značku na hranu uprostřed", () => {
    const r = computeGrommetMarks({
      widthMm: 100,
      heightMm: 50,
      edges: ["bottom"],
      offsetXMm: 10,
      offsetYMm: 5,
      mode: "count",
      countPerEdge: 1,
    });
    expect(r.positions).toHaveLength(1);
    expect(r.positions[0].x).toBeCloseTo(50, 5);
    expect(r.positions[0].y).toBe(5);
    expect(r.positions[0].edge).toBe("bottom");
  });

  it("režim spacing: počet značek odpovídá rozteči", () => {
    const r = computeGrommetMarks({
      widthMm: 100,
      heightMm: 50,
      edges: ["top"],
      offsetXMm: 10,
      offsetYMm: 5,
      mode: "spacing",
      spacingMm: 40,
    });
    // použitelná délka = 100 - 20 = 80 mm, rozteč 40 → 3 značky (0, 40, 80 v relativních souřadnicích)
    expect(r.positions).toHaveLength(3);
    expect(r.positions[0].x).toBeCloseTo(10, 5);
    expect(r.positions[1].x).toBeCloseTo(50, 5);
    expect(r.positions[2].x).toBeCloseTo(90, 5);
  });

  it("levá a pravá hrana: souřadnice x konstantní, y se mění", () => {
    const r = computeGrommetMarks({
      widthMm: 80,
      heightMm: 60,
      edges: ["left", "right"],
      offsetXMm: 10,
      offsetYMm: 10,
      mode: "count",
      countPerEdge: 2,
    });
    expect(r.positions).toHaveLength(4); // 2 na left, 2 na right
    const left = r.positions.filter((p) => p.edge === "left");
    const right = r.positions.filter((p) => p.edge === "right");
    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);
    expect(left.every((p) => p.x === 10)).toBe(true);
    expect(right.every((p) => p.x === 70)).toBe(true);
    // left: y 10 a 50 (height - 2*offset = 40, střed 20, takže 10+0=10, 10+40=50)
    expect(left[0].y).toBeCloseTo(10, 5);
    expect(left[1].y).toBeCloseTo(50, 5);
  });

  it("příliš velký offset: varování a žádné značky na dané hraně", () => {
    const r = computeGrommetMarks({
      widthMm: 20,
      heightMm: 20,
      edges: ["top"],
      offsetXMm: 15,
      offsetYMm: 5,
      mode: "count",
      countPerEdge: 3,
    });
    // použitelná délka = 20 - 30 = -10 → 0
    expect(r.positions).toHaveLength(0);
    expect(r.warnings.some((w) => w.includes("žádná použitelná délka") || w.includes("offset"))).toBe(
      true
    );
  });

  it("režim spacing s velkou roztečí: méně značek nebo varování", () => {
    const r = computeGrommetMarks({
      widthMm: 50,
      heightMm: 50,
      edges: ["top"],
      offsetXMm: 10,
      offsetYMm: 10,
      mode: "spacing",
      spacingMm: 100,
    });
    // použitelná délka = 30 mm, rozteč 100 → 0 značek (floor(30/100)+1 = 0+1 = 1? No: floor(30/100)=0, 0+1=1)
    // Actually 1 mark in the middle
    expect(r.positions.length).toBeLessThanOrEqual(1);
  });
});
