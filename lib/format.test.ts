import { describe, expect, it } from "vitest";
import { formatIDR, formatSignedIDR } from "./format";

/*
  Unit tests for the money formatter (WO-004 deferred evidence, now real).
  IDR scale is 0: the stored integer is rupiah directly, so no division by 100.
  The canonical string has NO space after "Rp" (docs/design/05-ai-advisor-panel.md).
*/
describe("formatIDR", () => {
  it("formats zero as Rp0", () => {
    expect(formatIDR(0)).toBe("Rp0");
  });

  it("formats small amounts without separators", () => {
    expect(formatIDR(1)).toBe("Rp1");
    expect(formatIDR(999)).toBe("Rp999");
  });

  it("groups thousands with dots and no space after Rp", () => {
    expect(formatIDR(1_000_000)).toBe("Rp1.000.000");
    expect(formatIDR(1_250_000)).toBe("Rp1.250.000");
  });

  it("formats two decimal digits with an Indonesian comma", () => {
    expect(formatIDR(3_000.12)).toBe("Rp3.000,12");
    expect(formatIDR(5_120.43)).toBe("Rp5.120,43");
  });

  it("puts the minus sign before Rp", () => {
    expect(formatIDR(-1_250_000)).toBe("-Rp1.250.000");
  });

  it("never emits negative zero", () => {
    expect(formatIDR(-0)).toBe("Rp0");
    // Computed negative zero (0 * -1) must also normalize to Rp0.
    expect(formatIDR(0 * -1)).toBe("Rp0");
  });
});

describe("formatSignedIDR", () => {
  it("formats zero without a sign", () => {
    expect(formatSignedIDR(0)).toBe("Rp0");
  });

  it("prefixes positive amounts with a plus sign", () => {
    expect(formatSignedIDR(1)).toBe("+Rp1");
    expect(formatSignedIDR(999)).toBe("+Rp999");
    expect(formatSignedIDR(1_000_000)).toBe("+Rp1.000.000");
    expect(formatSignedIDR(1_250_000)).toBe("+Rp1.250.000");
  });

  it("prefixes negative amounts with a minus sign", () => {
    expect(formatSignedIDR(-1_250_000)).toBe("-Rp1.250.000");
  });

  it("never emits negative zero", () => {
    expect(formatSignedIDR(-0)).toBe("Rp0");
    // Computed negative zero (0 * -1) must also normalize to Rp0.
    expect(formatSignedIDR(0 * -1)).toBe("Rp0");
  });
});
