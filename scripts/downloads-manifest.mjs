#!/usr/bin/env node
// Builds apps/landing/downloads.json from a desktop release folder (T-066).
//   node scripts/downloads-manifest.mjs [releaseDir] [outFile]
// Defaults: apps/desktop/release → apps/landing/downloads.json. The version comes from
// apps/desktop/package.json unless SALESSHIELD_VERSION is set. Only Mac and Windows installers are listed.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function buildManifest(dir, version) {
  const names = readdirSync(dir);
  const patterns = {
    "mac-arm64": (n) => n.endsWith(".dmg") && n.includes("arm64"),
    "mac-x64": (n) => n.endsWith(".dmg") && !n.includes("arm64"),
    "win-x64": (n) => n.endsWith(".exe"),
  };
  const files = {};
  for (const [key, match] of Object.entries(patterns)) {
    const hits = names.filter(match).filter((n) => n.includes(version));
    if (hits.length !== 1) {
      throw new Error(
        `expected one ${key} installer for ${version} in ${dir}, found ${hits.length}`,
      );
    }
    const path = join(dir, hits[0]);
    files[key] = {
      file: hits[0],
      size: statSync(path).size,
      sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    };
  }
  return { version, generatedAt: new Date().toISOString(), files };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? join(root, "apps/desktop/release"));
  const out = resolve(process.argv[3] ?? join(root, "apps/landing/downloads.json"));
  const version =
    process.env.SALESSHIELD_VERSION ??
    JSON.parse(readFileSync(join(root, "apps/desktop/package.json"), "utf8")).version;
  writeFileSync(out, `${JSON.stringify(buildManifest(dir, version), null, 2)}\n`);
  console.log(`wrote ${out} (v${version})`);
}
