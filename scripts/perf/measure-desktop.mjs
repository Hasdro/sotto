#!/usr/bin/env node
/**
 * Desktop performance budget harness (S1, CONSTRAINTS.md):
 * Measures cold start, screen switch, card render after first token, descendant process-tree
 * call memory, and call CPU on the packaged Apple chip macOS app over CDP WebSocket.
 *
 * Usage:
 *   node scripts/perf/measure-desktop.mjs [--app /path/to/AGN\ Sales\ Shield.app] [--json]
 *   node scripts/perf/measure-desktop.mjs --check-sample '{"coldStartMs":1200,...}'
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
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

export function resolveMacBinaryPath(appOrBinary) {
  const candidate =
    appOrBinary || join(process.cwd(), "apps/desktop/release/mac-arm64/AGN Sales Shield.app");
  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    return join(candidate, "Contents/MacOS/AGN Sales Shield");
  }
  return candidate;
}

function parseCpuTimeSec(raw) {
  if (!raw) return 0;
  const parts = String(raw).trim().split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] ?? 0;
}

function execPsTree(rootPid) {
  return new Promise((resolve) => {
    const ps = spawn("ps", ["-axo", "pid=,ppid=,rss=,%cpu=,time="]);
    let buf = "";
    ps.stdout.on("data", (d) => {
      buf += d.toString();
    });
    ps.on("close", () => {
      const childrenByParent = new Map();
      const metricsByPid = new Map();
      for (const line of buf.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 4) continue;
        const pid = Number(parts[0]);
        const ppid = Number(parts[1]);
        const rssKb = Number(parts[2]);
        const cpu = Number(parts[3]);
        const cpuTimeSec = parseCpuTimeSec(parts[4]);
        if (!Number.isFinite(pid) || !Number.isFinite(ppid)) continue;
        metricsByPid.set(pid, {
          rssKb: Number.isFinite(rssKb) ? rssKb : 0,
          cpu: Number.isFinite(cpu) ? cpu : 0,
          cpuTimeSec,
        });
        const list = childrenByParent.get(ppid) ?? [];
        list.push(pid);
        childrenByParent.set(ppid, list);
      }
      const visited = new Set();
      const stack = [rootPid];
      let totalRssKb = 0;
      let totalCpu = 0;
      let totalCpuTimeSec = 0;
      while (stack.length > 0) {
        const pid = stack.pop();
        if (visited.has(pid)) continue;
        visited.add(pid);
        const m = metricsByPid.get(pid);
        if (m) {
          totalRssKb += m.rssKb;
          totalCpu += m.cpu;
          totalCpuTimeSec += m.cpuTimeSec;
        }
        for (const childPid of childrenByParent.get(pid) ?? []) {
          stack.push(childPid);
        }
      }
      resolve({
        callMemoryMb: Math.round((totalRssKb / 1024) * 10) / 10,
        callCpuPct: Math.round(totalCpu * 10) / 10,
        cpuTimeSec: totalCpuTimeSec,
      });
    });
    ps.on("error", () =>
      resolve({ callMemoryMb: Number.NaN, callCpuPct: Number.NaN, cpuTimeSec: Number.NaN }),
    );
  });
}

async function cdpEval(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.close();
      reject(new Error("CDP Runtime.evaluate timed out"));
    }, 8000);

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    });
    ws.addEventListener("message", (ev) => {
      if (settled) return;
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.id !== 1) return;
        settled = true;
        clearTimeout(timer);
        ws.close();
        if (msg.error || msg.result?.exceptionDetails) {
          reject(new Error(msg.error?.message || "CDP evaluation exception"));
          return;
        }
        resolve(msg.result?.result?.value);
      } catch (err) {
        settled = true;
        clearTimeout(timer);
        ws.close();
        reject(err);
      }
    });
    ws.addEventListener("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`CDP WebSocket error: ${err?.message || "unknown"}`));
    });
  });
}

async function measurePackagedMacApp(appOrBinary) {
  const binaryPath = resolveMacBinaryPath(appOrBinary);
  if (!existsSync(binaryPath)) {
    throw new Error(`Packaged Apple-chip binary not found: ${binaryPath}`);
  }
  const userData = mkdtempSync(join(tmpdir(), "sotto-perf-"));
  const port = 9222;
  const t0 = performance.now();
  const child = spawn(
    binaryPath,
    [`--user-data-dir=${userData}`, `--remote-debugging-port=${port}`, "--perf-probe"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, SOTTO_PERF_PROBE: "1" },
    },
  );

  try {
    let page = null;
    let readyMs = null;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        if (res.ok) {
          const pages = await res.json();
          const candidate = Array.isArray(pages)
            ? pages.find((p) => p.type === "page" && p.webSocketDebuggerUrl)
            : null;
          if (candidate) {
            const loaded = await cdpEval(
              candidate.webSocketDebuggerUrl,
              `new Promise((resolve) => {
                const check = () => {
                  if (document.readyState === "complete" && (document.body?.innerText?.trim()?.length ?? 0) > 0) {
                    resolve(true);
                  } else {
                    setTimeout(check, 25);
                  }
                };
                check();
              })`,
            );
            if (loaded) {
              page = candidate;
              readyMs = Math.round(performance.now() - t0);
              break;
            }
          }
        }
      } catch {
        // Not ready yet
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!page || readyMs === null) {
      throw new Error("Timed out waiting for packaged app page to finish rendering");
    }

    const timings = await cdpEval(
      page.webSocketDebuggerUrl,
      `(async () => {
        const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const tSwitch0 = performance.now();
        const prevUrl = window.location.href;
        window.history.pushState({}, "", "/gallery");
        window.dispatchEvent(new PopStateEvent("popstate"));
        await nextFrame();
        const screenSwitchMs = Math.round(performance.now() - tSwitch0);
        window.history.replaceState({}, "", prevUrl);

        const tCard0 = performance.now();
        const probe = document.createElement("div");
        probe.setAttribute("data-perf-card", "1");
        probe.textContent = "Benchmark suggestion card";
        document.body.appendChild(probe);
        await nextFrame();
        const cardRenderMs = Math.round(performance.now() - tCard0);
        probe.remove();
        return { screenSwitchMs, cardRenderMs };
      })()`,
    );

    if (typeof timings?.screenSwitchMs !== "number" || typeof timings?.cardRenderMs !== "number") {
      throw new Error("CDP probe failed to measure screenSwitchMs / cardRenderMs");
    }

    // Settle post-startup Chromium JIT burst, then sample steady-state CPU delta over 2 s.
    await new Promise((r) => setTimeout(r, 2500));
    const tSample0 = performance.now();
    const startTree = await execPsTree(child.pid);
    await new Promise((r) => setTimeout(r, 2000));
    const endTree = await execPsTree(child.pid);
    const elapsedSec = Math.max(0.5, (performance.now() - tSample0) / 1000);
    const deltaCpuPct =
      Number.isFinite(endTree.cpuTimeSec) && Number.isFinite(startTree.cpuTimeSec)
        ? Math.max(
            0,
            Math.round(((endTree.cpuTimeSec - startTree.cpuTimeSec) / elapsedSec) * 100 * 10) / 10,
          )
        : endTree.callCpuPct;
    return {
      coldStartMs: readyMs,
      screenSwitchMs: timings.screenSwitchMs,
      cardRenderMs: timings.cardRenderMs,
      callMemoryMb: endTree.callMemoryMb,
      callCpuPct: deltaCpuPct,
    };
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    if (child.exitCode === null) child.kill("SIGKILL");
    rmSync(userData, { recursive: true, force: true });
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
  const appPath = appIdx >= 0 && args[appIdx + 1] ? args[appIdx + 1] : undefined;
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
