import { describe, expect, it } from "vitest";
import { normalizeInstitutionName } from "@/lib/institution-name";
import {
  BANK_INSTITUTION_SEED,
  BANK_INSTITUTION_SEED_VERSION,
  BANK_INSTITUTION_SOURCE_PERIOD,
  BANK_INSTITUTION_SOURCE_SHA256,
  OJK_GROUP_BPD,
  OJK_GROUP_FOREIGN_BRANCH,
  OJK_GROUP_PERSERO,
  OJK_GROUP_SWASTA,
} from "./bank-institutions-ojk-2026-06";

/*
  Seed integrity smoke test. The data file is generated from the verified OJK
  workbook named in its header; this test guards repeatability and the source
  metadata, not a live OJK connection.
*/
describe("OJK bank catalog seed data (AC-BI-2/AC-BI-13)", () => {
  it("contains 105 unique named bank rows with provenance", () => {
    expect(BANK_INSTITUTION_SEED).toHaveLength(105);
    expect(BANK_INSTITUTION_SEED_VERSION).toBe("ojk-office-list-2026-06-v1");
    expect(BANK_INSTITUTION_SOURCE_PERIOD).toBe("2026-06");
    expect(BANK_INSTITUTION_SOURCE_PERIOD).toMatch(/^[0-9]{4}-(0[1-9]|1[0-2])$/);
    expect(BANK_INSTITUTION_SOURCE_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("has no duplicate OJK code or normalized name", () => {
    const codes = new Set(BANK_INSTITUTION_SEED.map((row) => row.code));
    const names = new Set(BANK_INSTITUTION_SEED.map((row) => normalizeInstitutionName(row.name)));
    expect(codes.size).toBe(BANK_INSTITUTION_SEED.length);
    expect(names.size).toBe(BANK_INSTITUTION_SEED.length);
  });

  it("covers the four OJK workbook groups with the parsed counts", () => {
    const counts = new Map<string, number>();
    for (const row of BANK_INSTITUTION_SEED) {
      counts.set(row.group, (counts.get(row.group) ?? 0) + 1);
    }
    expect(counts.get(OJK_GROUP_PERSERO)).toBe(4);
    expect(counts.get(OJK_GROUP_SWASTA)).toBe(67);
    expect(counts.get(OJK_GROUP_BPD)).toBe(27);
    expect(counts.get(OJK_GROUP_FOREIGN_BRANCH)).toBe(7);
  });

  it("uses official source names, not the six mockup examples as a list", () => {
    const names = BANK_INSTITUTION_SEED.map((row) => row.name);
    expect(names).toContain("PT BANK CENTRAL ASIA Tbk");
    expect(names).toContain("PT BANK RAKYAT INDONESIA (PERSERO) Tbk");
    expect(names).toContain("PT BANK SYARIAH INDONESIA Tbk");
    /* The mockup's short display names are not invented aliases in the seed. */
    expect(names).not.toContain("BCA");
    expect(names).not.toContain("BRI");
    expect(names).not.toContain("BSI");
  });
});
