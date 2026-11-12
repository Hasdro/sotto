// Sign-in tokens in the operating system's secure storage (D-029): Electron safeStorage encrypts
// with a key the OS keeps (macOS Keychain, Windows DPAPI / Credential Manager), and only the
// ciphertext is written to a file in the app's data folder. Nothing here ever falls back to plain
// text: without OS encryption, `set` refuses and the app keeps its session in memory for the run.
const fs = require("node:fs");
const path = require("node:path");

// Only the app's own session keys; a page can never use this as general storage.
const KEY = /^sotto\.[a-z][a-z0-9._-]{0,40}$/;
const MAX_VALUE = 16 * 1024;

function createSecureStore({ safeStorage, dir, fileName = "secure-store.json" }) {
  const file = path.join(dir, fileName);

  function readAll() {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      return data && typeof data === "object" ? data : {};
    } catch {
      return {};
    }
  }

  function writeAll(data) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  function valid(key) {
    return typeof key === "string" && KEY.test(key);
  }

  return {
    available() {
      return safeStorage.isEncryptionAvailable();
    },
    get(key) {
      if (!valid(key) || !safeStorage.isEncryptionAvailable()) return null;
      const stored = readAll()[key];
      if (typeof stored !== "string") return null;
      try {
        return safeStorage.decryptString(Buffer.from(stored, "base64"));
      } catch {
        return null; // written by another OS user or a reinstalled keychain: sign in again
      }
    },
    set(key, value) {
      if (!valid(key) || typeof value !== "string" || value.length > MAX_VALUE) return false;
      if (!safeStorage.isEncryptionAvailable()) return false;
      const data = readAll();
      data[key] = safeStorage.encryptString(value).toString("base64");
      writeAll(data);
      return true;
    },
    delete(key) {
      if (!valid(key)) return;
      const data = readAll();
      if (!(key in data)) return;
      delete data[key];
      writeAll(data);
    },
    /** Key names only (never values), for checks and support. */
    keys() {
      return Object.keys(readAll());
    },
  };
}

/** The IPC handlers: only pages of the app's own origin may use them. */
function registerSecureStore({ ipcMain, store, origin }) {
  const own = (event) => {
    const url = event.senderFrame?.url ?? "";
    return url === origin || url.startsWith(`${origin}/`);
  };
  ipcMain.handle("secure-store:get", (event, key) => (own(event) ? store.get(key) : null));
  ipcMain.handle("secure-store:set", (event, key, value) =>
    own(event) ? store.set(key, value) : false,
  );
  ipcMain.handle("secure-store:delete", (event, key) => {
    if (own(event)) store.delete(key);
  });
}

module.exports = { createSecureStore, registerSecureStore, KEY };
