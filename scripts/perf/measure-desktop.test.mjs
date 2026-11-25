// Run: node --test scripts/perf/measure-desktop.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { BUDGETS, evaluateBudgets, resolveMacBinaryPath } from "./measure-desktop.mjs";

test("S1 budgets match CONSTRAINTS.md", () => {
  assert.equal(BUDGETS.coldStartMs, 3000);
  assert.equal(BUDGETS.screenSwitchMs, 300);
  assert.equal(BUDGETS.cardRenderMs, 100);
  assert.equal(BUDGETS.callMemoryMb, 500);
  assert.equal(BUDGETS.callCpuPct, 25);
});

test("evaluateBudgets passes when all metrics are within budget", () => {
  const res = evaluateBudgets({
    coldStartMs: 1450,
    screenSwitchMs: 120,
    cardRenderMs: 42,
    callMemoryMb: 280,
    callCpuPct: 14.5,
  });
  assert.equal(res.pass, true);
  assert.ok(res.checks.every((c) => c.pass));
});

test("evaluateBudgets fails when any metric exceeds budget", () => {
  const res = evaluateBudgets({
    coldStartMs: 3400,
    screenSwitchMs: 120,
    cardRenderMs: 42,
    callMemoryMb: 280,
    callCpuPct: 14.5,
  });
  assert.equal(res.pass, false);
  const cold = res.checks.find((c) => c.name === "cold_start_ms");
  assert.equal(cold?.pass, false);
});

test("evaluateBudgets fails when any metric is missing or non-finite", () => {
  const res = evaluateBudgets({
    coldStartMs: 1200,
    screenSwitchMs: undefined,
    cardRenderMs: 42,
    callMemoryMb: 280,
    callCpuPct: 10,
  });
  assert.equal(res.pass, false);
});

test("resolveMacBinaryPath expands .app bundle directory to Contents/MacOS binary", () => {
  assert.equal(
    resolveMacBinaryPath("/tmp/AGN Sales Shield.app/Contents/MacOS/AGN Sales Shield"),
    "/tmp/AGN Sales Shield.app/Contents/MacOS/AGN Sales Shield",
  );
});
