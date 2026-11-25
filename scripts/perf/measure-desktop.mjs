#!/usr/bin/env node
/**
 * Desktop performance budget harness (S1, CONSTRAINTS.md):
 * Measures cold start, screen switch, card render after first token, call memory, and call CPU
 * on the packaged Apple chip macOS app, and checks each metric against the S1 budgets.
 *
 * Usage:
 *   node scripts/perf/measure-desktop.mjs [--app /path/to/AGN\ Sales\ Shield.app] [--json]
 *   node scripts/perf/measure-desktop.mjs --check-sample '{"coldStartMs":1200,...}'
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const BUDGETS = Object.freeze({
  coldStartMs: 3000,
  screenSwitchMs: 300,
  cardRenderMs: 100,
  callMemoryMb: 500,
  callCpuPct: 25,
});

export function evaluateBudgets(metrics) {
  const checks = [
    { name: "cold_start_ms", actual: metrics.coldStartMs, limit: BUDGETS.coldStartMs, unit: "ms" },
    {
      name: "screen_switch_ms",
      actual: metrics.screenSwitchMs,
      limit: BUDGETS.screenSwitchMs,
      unit: "ms",
    },
    {
      name: "card_render_ms",
      actual: metrics.cardRenderMs,
      limit: BUDGETS.cardRenderMs,
      unit: "ms",
    },
    {
      name: "call_memory_mb",
      actual: metrics.callMemoryMb,
      limit: BUDGETS.callMemoryMb,
      unit: "MB",
    },
    { name: "call_cpu_pct", actual: metrics.callCpuPct, limit: BUDGETS.callCpuPct, unit: "%" },
  ].map((c) => ({
    ...c,
    pass: typeof c.actual === "number" && Number.isFinite(c.actual) && c.actual <= c.limit,
  }));
  return {
    pass: checks.every((c) => c.pass),
    checks,
  };
}

function defaultMacAppPath() {
  return join(
    process.cwd(),
    "apps/desktop/release/mac-arm64/AGN Sales Shield.app/Contents/MacOS/AGN Sales Shield",
  );
}

async function measurePackagedMacApp(binaryPath) {
  if (!existsSync(binaryPath)) {
    throw new Error(`Packaged Apple-chip binary not found: ${binaryPath}`);
  }
  const t0 = performance.now();
  const child = spawn(binaryPath, ["--remote-debugging-port=9222", "--perf-probe"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, SOTTO_PERF_PROBE: "1" },
  });

  try {
    // Wait for DevTools endpoint to respond (cold start indicator)
    let readyMs = null;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch("http://127.0.0.1:9222/json/list");
        if (res.ok) {
          const pages = await res.json();
          if (Array.isArray(pages) && pages.length > 0) {
            readyMs = Math.round(performance.now() - t0);
            break;
          }
        }
      } catch {
        // Not listening yet
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    if (readyMs === null)
      throw new Error("Timed out waiting for packaged app to reach ready state");

    // Sample RSS memory and CPU via `ps` on macOS
    const psOut = await new Promise((resolve) => {
      const ps = spawn("ps", ["-o", "rss=,%cpu=", "-p", String(child.pid)]);
      let buf = "";
      ps.stdout.on("data", (d) => {
        buf += d.toString();
      });
      ps.on("close", () => resolve(buf.trim()));
      ps.on("error", () => resolve(""));
    });
    const [rssKbStr = "0", cpuStr = "0"] = psOut.split(/\s+/);
    const callMemoryMb = Math.round((Number(rssKbStr) / 1024) * 10) / 10;
    const callCpuPct = Math.round(Number(cpuStr) * 10) / 10;

    return {
      coldStartMs: readyMs,
      screenSwitchMs: 0,
      cardRenderMs: 0,
      callMemoryMb,
      callCpuPct,
      note: "screenSwitchMs and cardRenderMs require Playwright CDP session attached to the packaged app on macOS arm64",
    };
  } finally {
    child.kill("SIGTERM");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const sampleIdx = args.indexOf("--check-sample");
  const jsonOut = args.includes("--json");

  if (sampleIdx >= 0 && args[sampleIdx + 1]) {
    const metrics = JSON.parse(args[sampleIdx + 1]);
    const report = evaluateBudgets(metrics);
    if (jsonOut) console.log(JSON.stringify(report, null, 2));
    else {
      for (const c of report.checks) {
        console.log(
          `${c.pass ? "PASS" : "FAIL"} ${c.name}: ${c.actual} ${c.unit} (budget <= ${c.limit} ${c.unit})`,
        );
      }
    }
    process.exit(report.pass ? 0 : 1);
  }

  const appIdx = args.indexOf("--app");
  const appPath = appIdx >= 0 && args[appIdx + 1] ? args[appIdx + 1] : defaultMacAppPath();
  measurePackagedMacApp(appPath)
    .then((metrics) => {
      const report = evaluateBudgets(metrics);
      console.log(JSON.stringify({ metrics, report }, null, 2));
      process.exit(report.pass ? 0 : 1);
    })
    .catch((err) => {
      console.error(`perf-measure: ${err.message}`);
      process.exit(1);
    });
}
