const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSecureStore, registerSecureStore } = require("../secure-store.cjs");

// A stand-in for Electron's safeStorage: reversible, and visibly not plain text.
function fakeSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from(`enc:${Buffer.from(s).toString("hex")}`),
    decryptString: (b) => {
      const text = b.toString();
      if (!text.startsWith("enc:")) throw new Error("bad");
      return Buffer.from(text.slice(4), "hex").toString();
    },
  };
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "secure-store-"));
}

test("stores only ciphertext and reads it back", () => {
  const dir = tmpDir();
  const store = createSecureStore({ safeStorage: fakeSafeStorage(), dir });
  assert.equal(store.set("sotto.session", '{"access":"sa_x"}'), true);
  const raw = fs.readFileSync(path.join(dir, "secure-store.json"), "utf8");
  assert.ok(!raw.includes("sa_x"), "the token never sits in the file as text");
  assert.equal(store.get("sotto.session"), '{"access":"sa_x"}');
  assert.deepEqual(store.keys(), ["sotto.session"]);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(path.join(dir, "secure-store.json")).mode & 0o777, 0o600);
  }
  store.delete("sotto.session");
  assert.equal(store.get("sotto.session"), null);
  assert.deepEqual(store.keys(), []);
});

test("refuses without OS encryption and never writes plain text", () => {
  const dir = tmpDir();
  const store = createSecureStore({ safeStorage: fakeSafeStorage(false), dir });
  assert.equal(store.available(), false);
  assert.equal(store.set("sotto.session", "secret"), false);
  assert.equal(fs.existsSync(path.join(dir, "secure-store.json")), false);
  assert.equal(store.get("sotto.session"), null);
});

test("accepts only the app's own key names and bounded values", () => {
  const store = createSecureStore({ safeStorage: fakeSafeStorage(), dir: tmpDir() });
  for (const key of ["other", "sotto", "../sotto.x", "sotto.X", 7]) {
    assert.equal(store.set(key, "v"), false, String(key));
  }
  assert.equal(store.set("sotto.session", "x".repeat(20_000)), false);
  assert.equal(store.set("sotto.session", 42), false);
});

test("an unreadable entry reads as signed out, not a crash", () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, "secure-store.json"),
    JSON.stringify({ "sotto.session": "eA==" }),
  );
  const store = createSecureStore({ safeStorage: fakeSafeStorage(), dir });
  assert.equal(store.get("sotto.session"), null);
  fs.writeFileSync(path.join(dir, "secure-store.json"), "not json");
  assert.equal(store.get("sotto.session"), null);
});

test("IPC answers only pages of the app's own origin", async () => {
  const handlers = {};
  const ipcMain = { handle: (name, fn) => (handlers[name] = fn) };
  const store = createSecureStore({ safeStorage: fakeSafeStorage(), dir: tmpDir() });
  registerSecureStore({ ipcMain, store, origin: "app://sotto" });
  const own = { senderFrame: { url: "app://sotto/call" } };
  const foreign = { senderFrame: { url: "https://evil.example/" } };
  const lookalike = { senderFrame: { url: "app://sotto.evil/" } };
  assert.equal(handlers["secure-store:set"](own, "sotto.session", "v"), true);
  assert.equal(handlers["secure-store:get"](own, "sotto.session"), "v");
  assert.equal(handlers["secure-store:get"](foreign, "sotto.session"), null);
  assert.equal(handlers["secure-store:get"](lookalike, "sotto.session"), null);
  assert.equal(handlers["secure-store:set"](foreign, "sotto.session", "x"), false);
  handlers["secure-store:delete"](foreign, "sotto.session");
  assert.equal(handlers["secure-store:get"](own, "sotto.session"), "v");
});
