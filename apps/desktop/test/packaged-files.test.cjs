// Every local module the main process requires must be in electron-builder's "files" list,
// or the installed app crashes at launch (0.6.0 shipped without notify.cjs).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const files = require(path.join(root, "package.json")).build.files;

function localRequires(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const src = fs.readFileSync(path.join(root, file), "utf8");
  for (const m of src.matchAll(/require\(["']\.\/([^"']+)["']\)/g)) localRequires(m[1], seen);
  return seen;
}

test("every module main.cjs and preload.cjs load is packaged", () => {
  const needed = new Set([...localRequires("main.cjs"), ...localRequires("preload.cjs")]);
  for (const f of needed)
    assert.ok(files.includes(f), `${f} is required but missing from build.files`);
});
