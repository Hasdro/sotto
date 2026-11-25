#!/usr/bin/env node
/**
 * Packaged Apple-chip macOS launch smoke test (S3):
 * Launches the packaged .app, verifies the renderer opens and reaches sign-in (or home),
 * then quits cleanly. Exits non-zero on crash or timeout so publish-apps.sh blocks publishing.
 *
 * Usage: node apps/desktop/test/launch.mac.mjs [/path/to/AGN Sales Shield.app]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appBundle =
  process.argv[2] ??
  join(process.cwd(), "apps/desktop/release/mac-arm64/AGN Sales Shield.app");
const binary = join(appBundle, "Contents/MacOS/AGN Sales Shield");

if (!existsSync(binary)) {
  console.error(`launch.mac: packaged Apple-chip binary not found at ${binary}`);
  process.exit(1);
}

const userData = mkdtempSync(join(tmpdir(), "sotto-mac-launch-"));
const port = 9231;
const child = spawn(binary, [`--user-data-dir=${userData}`, `--remote-debugging-port=${port}`], {
  stdio: ["ignore", "pipe", "pipe"],
});

let exitedEarly = false;
let stderr = "";
child.stderr.on("data", (d) => {
  stderr += d.toString();
});
child.on("exit", (code) => {
  if (code !== 0 && code !== null) exitedEarly = true;
});

async function waitForSignIn() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (exitedEarly) throw new Error(`App exited early:\n${stderr}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const targets = await res.json();
        const page = targets.find((t) => t.type === "page" && String(t.url || "").startsWith("app://sotto"));
        if (page) return page;
      }
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for app://sotto window to load. stderr:\n${stderr}`);
}

try {
  const page = await waitForSignIn();
  console.log(`launch.mac: PASS — reached ${page.url} (${page.title || "AGN Sales Shield"})`);
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
  if (child.exitCode === null) child.kill("SIGKILL");
} catch (err) {
  console.error(`launch.mac: FAIL — ${err.message}`);
  child.kill("SIGKILL");
  process.exitCode = 1;
} finally {
  rmSync(userData, { recursive: true, force: true });
}
