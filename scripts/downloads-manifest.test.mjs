// Run: node --test scripts/downloads-manifest.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildManifest } from "./downloads-manifest.mjs";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "manifest-"));
  writeFileSync(join(dir, "Sotto-0.2.0-arm64.dmg"), "arm");
  writeFileSync(join(dir, "Sotto-0.2.0.dmg"), "intel!");
  writeFileSync(join(dir, "Sotto Setup 0.2.0.exe"), "win");
  writeFileSync(join(dir, "Sotto-0.2.0.AppImage"), "linux");
  writeFileSync(join(dir, "Sotto-0.2.0.dmg.blockmap"), "x");
  return dir;
}

test("lists only mac and windows installers with size and sha256", () => {
  const m = buildManifest(fixture(), "0.2.0");
  assert.equal(m.version, "0.2.0");
  assert.deepEqual(Object.keys(m.files).sort(), ["mac-arm64", "mac-x64", "win-x64"]);
  assert.equal(m.files["mac-x64"].file, "Sotto-0.2.0.dmg");
  assert.equal(m.files["mac-x64"].size, 6);
  assert.match(m.files["mac-arm64"].sha256, /^[0-9a-f]{64}$/);
});

test("fails when an installer is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "manifest-"));
  writeFileSync(join(dir, "Sotto-0.2.0.dmg"), "a");
  assert.throws(() => buildManifest(dir, "0.2.0"), /mac-arm64/);
});
