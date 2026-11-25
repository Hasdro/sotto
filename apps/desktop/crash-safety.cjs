/**
 * Desktop crash safety, redacted disk logging (L5: critical errors only, <= 5 MB / 7 days),
 * and renderer auto-reload with active-call state restore (S2).
 */
const fs = require("node:fs");
const path = require("node:path");

const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB (L5)
const MAX_LOG_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (L5)

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/g;
const KEY_RE =
  /\b(?:sk-[A-Za-z0-9_-]{12,}|sk-ant-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{16,}|gho_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|AIza[0-9A-Za-z_-]{20,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,})\b/gi;

const BLOCKED_KEYS = new Set([
  "transcript",
  "customer_name",
  "name",
  "phone",
  "email",
  "api_key",
  "token",
  "secret",
  "password",
  "authorization",
  "cookie",
]);

function redactString(value) {
  return String(value)
    .replace(KEY_RE, "[REDACTED_KEY]")
    .replace(EMAIL_RE, "[REDACTED_EMAIL]")
    .replace(PHONE_RE, "[REDACTED_PHONE]")
    .slice(0, 1024);
}

function redactRecord(obj) {
  if (!obj || typeof obj !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (BLOCKED_KEYS.has(k.toLowerCase())) continue;
    if (typeof v === "string") out[k] = redactString(v);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

/**
 * Redacted critical-error disk logger stored in `<userData>/logs/safety.log` (L5).
 * Enforces <= 5 MB total size and <= 7 days retention on write and prune.
 */
function createDiskLogger({
  userDataDir,
  now = () => Date.now(),
  maxBytes = MAX_LOG_BYTES,
  maxAgeMs = MAX_LOG_AGE_MS,
}) {
  const dir = path.join(userDataDir, "logs");
  const file = path.join(dir, "safety.log");

  function ensureDir() {
    fs.mkdirSync(dir, { recursive: true });
  }

  function prune() {
    if (!fs.existsSync(file)) return;
    const cutoff = now() - maxAgeMs;
    const raw = fs.readFileSync(file, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const kept = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (typeof parsed.tsMs === "number" && parsed.tsMs >= cutoff) kept.push(line);
      } catch {
        // drop malformed line
      }
    }
    let joined = kept.join("\n") + (kept.length ? "\n" : "");
    while (Buffer.byteLength(joined, "utf8") > maxBytes && kept.length > 1) {
      kept.shift();
      joined = `${kept.join("\n")}\n`;
    }
    fs.writeFileSync(file, joined, "utf8");
  }

  function writeCritical(stage, event, details = {}) {
    try {
      ensureDir();
      const entry = {
        tsMs: now(),
        level: "error",
        stage: redactString(stage),
        event: redactString(event),
        meta: redactRecord(details),
      };
      fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf8");
      const stat = fs.statSync(file);
      if (stat.size > maxBytes) prune();
    } catch {
      // Never crash the app because disk logging failed.
    }
  }

  function readRecent(maxLines = 100) {
    try {
      prune();
      if (!fs.existsSync(file)) return "";
      const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
      return lines.slice(-maxLines).join("\n");
    } catch {
      return "";
    }
  }

  return { file, writeCritical, prune, readRecent };
}

/** Attach Node process crash handlers (uncaughtException, unhandledRejection). */
function installProcessHandlers({ proc = process, logger }) {
  const onUncaught = (err) => {
    logger.writeCritical("electron.main", "uncaughtException", {
      error_name: err?.name || "Error",
      message: err?.message || String(err),
      stack: err?.stack ? String(err.stack).split("\n").slice(0, 6).join(" | ") : "",
    });
  };
  const onRejection = (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.writeCritical("electron.main", "unhandledRejection", {
      error_name: err.name || "Error",
      message: err.message,
    });
  };
  proc.on("uncaughtException", onUncaught);
  proc.on("unhandledRejection", onRejection);
  return () => {
    proc.removeListener("uncaughtException", onUncaught);
    proc.removeListener("unhandledRejection", onRejection);
  };
}

/**
 * Attach renderer crash & load-failure recovery to a BrowserWindow:
 * reloads the window automatically and preserves recovery state (e.g. active callId/route).
 */
function attachWindowSafety({
  win,
  origin,
  logger,
  getRecoveryState = () => null,
  reloadDelayMs = 250,
  maxReloadsPerMin = 5,
  now = () => Date.now(),
}) {
  const reloadTimes = [];

  function scheduleReload(reason) {
    const t = now();
    while (reloadTimes.length && t - reloadTimes[0] > 60_000) reloadTimes.shift();
    if (reloadTimes.length >= maxReloadsPerMin) {
      logger.writeCritical("electron.renderer", "reload_loop_stopped", { reason });
      return false;
    }
    reloadTimes.push(t);
    const saved = getRecoveryState();
    const target =
      saved?.route && typeof saved.route === "string" && saved.route.startsWith("/")
        ? `${origin}${saved.route}`
        : `${origin}/`;
    setTimeout(() => {
      if (!win.isDestroyed()) void win.loadURL(target);
    }, reloadDelayMs);
    return true;
  }

  win.webContents.on("render-process-gone", (_event, details) => {
    logger.writeCritical("electron.renderer", "render-process-gone", {
      reason: details?.reason || "unknown",
      exitCode: Number(details?.exitCode ?? -1),
    });
    if (details?.reason !== "clean-exit") scheduleReload(details?.reason || "crashed");
  });

  win.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame === false || errorCode === -3) return; // ignore subframe or aborted loads
      logger.writeCritical("electron.renderer", "did-fail-load", {
        errorCode: Number(errorCode),
        errorDescription: String(errorDescription || ""),
        url: String(validatedURL || ""),
      });
      scheduleReload(`did-fail-load:${errorCode}`);
    },
  );

  return { scheduleReload };
}

/** Register IPC channels for renderer critical logging, diagnostics export, and recovery state. */
function registerSafetyIpc({ ipcMain, logger, origin }) {
  let recoveryState = null;
  const fromOwn = (event) => {
    const url = event?.senderFrame?.url ?? event?.sender?.getURL?.() ?? "";
    return typeof url === "string" && url.startsWith(`${origin}/`);
  };

  ipcMain.handle("obs:log-critical", (event, entry) => {
    if (!fromOwn(event)) return false;
    logger.writeCritical(
      String(entry?.stage || "renderer"),
      String(entry?.event || "error"),
      entry?.meta && typeof entry.meta === "object" ? entry.meta : {},
    );
    return true;
  });

  ipcMain.handle("obs:read-diagnostics", (event) => {
    if (!fromOwn(event)) return "";
    return logger.readRecent(100);
  });

  ipcMain.handle("call:save-recovery", (event, state) => {
    if (!fromOwn(event)) return false;
    recoveryState = state && typeof state === "object" ? { ...state, savedAt: Date.now() } : null;
    return true;
  });

  ipcMain.handle("call:take-recovery", (event) => {
    if (!fromOwn(event)) return null;
    const out = recoveryState;
    recoveryState = null;
    return out;
  });

  return {
    getRecoveryState: () => recoveryState,
  };
}

module.exports = {
  MAX_LOG_BYTES,
  MAX_LOG_AGE_MS,
  redactString,
  redactRecord,
  createDiskLogger,
  installProcessHandlers,
  attachWindowSafety,
  registerSafetyIpc,
};
