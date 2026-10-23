import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  AC-F3-9 smoke: no client-side module may read server env or import a
  server-only module, and the built client chunks (when a build exists) must not
  contain server credential names. The OCR call always goes through the route.
*/

const ROOT = process.cwd();
const SECRET_NAMES = ["GEMINI_API_KEY", "DATABASE_URL", "BLOB_READ_WRITE_TOKEN", "AUTH_SECRET"];

function walk(dir: string, match: (name: string) => boolean, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, match, acc);
    } else if (match(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function clientSourceFiles(): string[] {
  const components = walk(join(ROOT, "components"), (name) => /\.(ts|tsx)$/.test(name));
  const appTsx = walk(join(ROOT, "app"), (name) => /\.tsx$/.test(name) && !name.endsWith(".test.tsx")).filter(
    (file) => !file.replace(/\\/g, "/").includes("/app/api/"),
  );
  return [...components, ...appTsx];
}

describe("AC-F3-9 client secret isolation", () => {
  it("has no client module that reads server env or imports lib/server", () => {
    const offenders: string[] = [];
    for (const file of clientSourceFiles()) {
      const content = readFileSync(file, "utf8");
      const patterns: Array<[RegExp, string]> = [
        [/\bprocess\.env\b/, "process.env"],
        [/@\/lib\/server/, "@/lib/server import"],
        ...SECRET_NAMES.map((name) => [new RegExp(`\\b${name}\\b`), name] as [RegExp, string]),
        [/\bNEXT_PUBLIC_/, "NEXT_PUBLIC_"],
      ];
      for (const [pattern, label] of patterns) {
        if (pattern.test(content)) offenders.push(`${file} -> ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not contain credential names in the built client chunks (when built)", () => {
    const chunksDir = join(ROOT, ".next", "static", "chunks");
    if (!existsSync(chunksDir)) {
      /* Build has not run in this session; source-level isolation still checked. */
      expect(existsSync(chunksDir)).toBe(false);
      return;
    }
    const offenders: string[] = [];
    for (const file of walk(chunksDir, (name) => name.endsWith(".js"))) {
      const content = readFileSync(file, "utf8");
      for (const name of SECRET_NAMES) {
        if (content.includes(name)) offenders.push(`${file} -> ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});