/**
 * T-049 grep check (D-026): no user-facing "Sotto" anywhere the person can see it. Technical
 * identifiers keep lowercase "sotto" (app://sotto, sotto.* storage keys, @sotto/* packages,
 * sotto-desktop) and comments may mention the old name; neither is scanned. Everything else,
 * string literals in app, UI and desktop code, the app and installer manifests, and the logo
 * page, must say AGN Sales Shield.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const SCAN = [
  "apps/app/app",
  "apps/app/components",
  "apps/app/features",
  "apps/app/lib",
  "packages/ui/src",
  "apps/desktop/main.cjs",
  "apps/desktop/preload.cjs",
  "apps/desktop/package.json",
  "apps/app/app.json",
  "docs/design/logo/index.html",
  "apps/agent-worker/sotto_worker/cloud/owner",
];
const CODE = new Set([".ts", ".tsx", ".cjs", ".mjs", ".js", ".css"]);
const SKIP = /(\.test\.tsx?$|__tests__|node_modules)/;

function files(path: string): string[] {
  const abs = join(root, path);
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs).flatMap((name) => {
    const child = join(path, name);
    if (SKIP.test(child)) return [];
    return statSync(join(root, child)).isDirectory() ? files(child) : [join(root, child)];
  });
}

/** Drops comments so only code and strings remain (a `//` inside a URL is kept). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

function userFacingHits(path: string, source: string): string[] {
  const ext = extname(path);
  const text = CODE.has(ext) ? stripComments(source) : source;
  return text
    .split("\n")
    .map((line, i) => [line, i + 1] as const)
    .filter(([line]) => /\bSotto\b|سوتو/.test(line))
    .map(([line, n]) => `${relative(root, path)}:${n}: ${line.trim()}`);
}

describe("brand name (T-049, D-026)", () => {
  it("strips comments but keeps strings and URLs", () => {
    expect(userFacingHits("a.ts", "// Sotto here\nconst x = 1; /* Sotto */")).toEqual([]);
    expect(userFacingHits("a.ts", 'const s = "Open Sotto";')).toHaveLength(1);
    expect(userFacingHits("a.ts", 'const u = "https://x.io"; // Sotto')).toEqual([]);
    expect(userFacingHits("a.ts", 'const k = "sotto.locale";')).toEqual([]);
    expect(userFacingHits("a.ts", 'const ar = "يستخدمها سوتو";')).toHaveLength(1);
    // the owner console is scanned too (UX-08); a planted string fails
    expect(userFacingHits("owner.js", 'h("div", {}, "Sotto Owner")')).toHaveLength(1);
    expect(userFacingHits("index.html", "<title>Sotto Owner Console</title>")).toHaveLength(1);
  });

  it("no user-facing Sotto remains in app, UI, desktop, manifests or the logo page", () => {
    const hits = SCAN.flatMap(files).flatMap((f) => userFacingHits(f, readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
