const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const {
  createDiskLogger,
  installProcessHandlers,
  attachWindowSafety,
  registerSafetyIpc,
} = require("../crash-safety.cjs");

test("disk logger writes redacted critical errors and prunes by age and size (L5)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sotto-log-"));
  let fakeNow = 1_700_000_000_000;
  const logger = createDiskLogger({
    userDataDir: dir,
    now: () => fakeNow,
    maxBytes: 600,
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  });

  logger.writeCritical("electron.main", "crash", {
    email: "secret@example.com",
    transcript: "customer secret text",
    message: "Failed for user bob@acme.com key sk-1234567890abcdef1234",
  });
  const first = logger.readRecent(10);
  assert.doesNotMatch(first, /secret@example\.com/);
  assert.doesNotMatch(first, /customer secret text/);
  assert.doesNotMatch(first, /bob@acme\.com/);
  assert.doesNotMatch(first, /sk-1234567890/);
  assert.match(first, /\[REDACTED_EMAIL\]/);
  assert.match(first, /\[REDACTED_KEY\]/);

  // Advance 8 days -> old entry pruned
  fakeNow += 8 * 24 * 60 * 60 * 1000;
  logger.writeCritical("electron.main", "fresh_error", { code: 500 });
  const afterAge = logger.readRecent(10);
  assert.doesNotMatch(afterAge, /"crash"/);
  assert.match(afterAge, /"fresh_error"/);

  // Write many lines -> stays <= maxBytes
  for (let i = 0; i < 20; i += 1) {
    logger.writeCritical("electron.main", `err_${i}`, { detail: "x".repeat(40) });
  }
  const size = fs.statSync(logger.file).size;
  assert.ok(size <= 600, `expected <= 600 bytes, got ${size}`);
});

test("process handlers capture uncaughtException and unhandledRejection", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sotto-proc-"));
  const logger = createDiskLogger({ userDataDir: dir });
  const fakeProc = new EventEmitter();
  const detach = installProcessHandlers({ proc: fakeProc, logger });
  fakeProc.emit("uncaughtException", new Error("boom sk-abcdef1234567890"));
  fakeProc.emit("unhandledRejection", new Error("rejected"));
  detach();
  const text = logger.readRecent(10);
  assert.match(text, /uncaughtException/);
  assert.match(text, /unhandledRejection/);
  assert.doesNotMatch(text, /sk-abcdef1234567890/);
});

test("renderer crash triggers auto-reload with saved route recovery state (S2)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sotto-win-"));
  const logger = createDiskLogger({ userDataDir: dir });
  const loaded = [];
  const webContents = new EventEmitter();
  const win = {
    webContents,
    isDestroyed: () => false,
    loadURL: (u) => {
      loaded.push(u);
      return Promise.resolve();
    },
  };

  attachWindowSafety({
    win,
    origin: "app://sotto",
    logger,
    getRecoveryState: () => ({ route: "/call", callId: "call-42" }),
    reloadDelayMs: 10,
  });

  webContents.emit("render-process-gone", {}, { reason: "crashed", exitCode: 1 });
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(loaded, ["app://sotto/call"]);
  assert.match(logger.readRecent(10), /render-process-gone/);
});

test("safety IPC rejects foreign origins and stores/takes recovery state", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sotto-ipc-"));
  const logger = createDiskLogger({ userDataDir: dir });
  const handlers = new Map();
  const ipcMain = { handle: (ch, fn) => handlers.set(ch, fn) };
  registerSafetyIpc({ ipcMain, logger, origin: "app://sotto" });

  const ownEvent = { senderFrame: { url: "app://sotto/call" } };
  const badEvent = { senderFrame: { url: "https://evil.example/" } };

  assert.equal(handlers.get("call:save-recovery")(badEvent, { route: "/call" }), false);
  assert.equal(
    handlers.get("call:save-recovery")(ownEvent, { route: "/call", callId: "c-9" }),
    true,
  );
  const taken = handlers.get("call:take-recovery")(ownEvent);
  assert.equal(taken.callId, "c-9");
  assert.equal(handlers.get("call:take-recovery")(ownEvent), null);
});
