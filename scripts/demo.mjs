#!/usr/bin/env node
// `pnpm demo`: build the web app, then start the local demo server (D-013).
// Options: --no-build (reuse apps/app/dist), --fake (ignore API keys), --speed=0.5 (faster scenarios).
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dist = join(root, "apps", "app", "dist");

if (!args.includes("--no-build") || !existsSync(join(dist, "index.html"))) {
  console.log("Building the web app (apps/app → dist)…");
  const build = spawnSync("pnpm", ["--filter", "@sotto/app", "export:web"], {
    cwd: root,
    stdio: "inherit",
    // The demo bridge only runs in builds that opt in (apps/app/features/call/devGate.ts).
    env: { ...process.env, CI: "1", EXPO_PUBLIC_SOTTO_DEMO: "1" },
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const worker = join(root, "apps", "agent-worker");
const envFile = join(root, ".env");
const uvArgs = ["run", "--frozen"];
if (existsSync(envFile)) uvArgs.push("--env-file", envFile);
uvArgs.push("python", "-m", "sotto_worker.demo", "--static", dist);
for (const a of args) if (a === "--fake" || a.startsWith("--speed=")) uvArgs.push(a);

const child = spawn("uv", uvArgs, { cwd: worker, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
