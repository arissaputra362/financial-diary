/*
  OJK workbook parser helper (T-011 implementation provenance).

  The seed data file is generated from the official OJK workbook, not typed by
  hand and never from mockup names. This script keeps that step reproducible:

    1. Download the latest official file from the OJK page recorded in
       prisma/data/bank-institutions-ojk-2026-06.ts.
    2. Extract it (the workbook is a ZIP of XML):
         Expand-Archive -Path "<file>.xlsx" -DestinationPath "<dir>"
    3. Run:
         bun prisma/scripts/parse-ojk-workbook.ts "<dir>"
    4. Review the printed entries and diff the generated data file manually.

  It intentionally does NOT write the seed file: a human must verify counts,
  footnote stripping, and collisions before the snapshot is committed.

  Expected sheet: xl/worksheets/sheet1.xml, "Daftar Bank Umum" (A1:F110 in the
  June 2026 workbook). Section headers are OJK group headings, not bank rows.
*/

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SECTION_HEADERS = new Set([
  "BANK UMUM PERSERO",
  "BANK UMUM SWASTA NASIONAL",
  "BANK PEMBANGUNAN DAERAH",
  "KANTOR CABANG BANK YANG BERKEDUDUKAN DI LUAR NEGERI",
]);

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCharCode(Number(decimal)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&");
}

function sharedStrings(extractDir: string): string[] {
  const xml = readFileSync(join(extractDir, "xl", "sharedStrings.xml"), "utf8");
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((text) => decodeXml(text[1]))
      .join(""),
  );
}

type ParsedRow = { row: number; code: string; name: string; group: string };

export function parseSheet(extractDir: string): ParsedRow[] {
  const strings = sharedStrings(extractDir);
  const xml = readFileSync(join(extractDir, "xl", "worksheets", "sheet1.xml"), "utf8");
  const rows: string[][] = [];

  for (const rowMatch of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2];
      const column = /r="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? "";
      const colIndex =
        column.split("").reduce((acc, char) => acc * 26 + (char.charCodeAt(0) - 64), 0) - 1;
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = "";
      if (type === "s" && raw !== undefined) value = strings[Number(raw)] ?? "";
      else if (raw !== undefined) value = decodeXml(raw);
      cells[colIndex] = value;
    }
    rows[Number(rowMatch[1]) - 1] = Array.from({ length: cells.length }, (_, i) => cells[i] ?? "");
  }

  let group = "";
  const entries: ParsedRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const first = (row[0] ?? "").trim();
    if (SECTION_HEADERS.has(first)) {
      group = first;
      continue;
    }
    if (!/^\d+$/.test(first)) continue;
    const code = (row[1] ?? "").trim();
    const rawName = (row[2] ?? "").trim();
    if (!code || !rawName) continue;
    /* OJK adds footnote markers ("11)") that are annotations, not names. */
    const name = rawName.replace(/\s+\d{1,2}\)\s*$/u, "").trim();
    entries.push({ row: i + 1, code, name, group });
  }
  return entries;
}

function main(): void {
  const extractDir = process.argv[2];
  if (!extractDir) {
    console.error("Usage: bun prisma/scripts/parse-ojk-workbook.ts <extracted-xlsx-dir>");
    process.exitCode = 1;
    return;
  }
  const entries = parseSheet(extractDir);
  const byGroup = new Map<string, number>();
  for (const entry of entries) byGroup.set(entry.group, (byGroup.get(entry.group) ?? 0) + 1);
  console.log(JSON.stringify({ total: entries.length, byGroup: Object.fromEntries(byGroup), entries }, null, 2));
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/scripts/parse-ojk-workbook.ts")) main();
