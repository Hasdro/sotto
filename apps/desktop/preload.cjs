// The one bridge from the desktop app to its pages: which call app, if any, is using a
// microphone (auto pick-up), the global shortcuts, the mini window's card, and the sign-in
// tokens' secure storage (D-029), the app's own deep links and the OS privacy panes (W1-DESK),
// and follow-up notifications (INT-08).
// Nothing else of Electron or Node reaches the page.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sottoDesktop", {
  callState: () => ipcRenderer.invoke("call-state"),
  onCallState: (cb) => {
    const listener = (_event, state) => cb(state);
    ipcRenderer.on("call-state", listener);
    return () => ipcRenderer.removeListener("call-state", listener);
  },
  onShortcut: (cb) => {
    const listener = (_event, what) => cb(what);
    ipcRenderer.on("shortcut", listener);
    return () => ipcRenderer.removeListener("shortcut", listener);
  },
  sendMini: (state) => ipcRenderer.send("mini-state", state),
  onMini: (cb) => {
    const listener = (_event, state) => cb(state);
    ipcRenderer.on("mini-state", listener);
    void ipcRenderer.invoke("mini-last").then((state) => state && cb(state));
    return () => ipcRenderer.removeListener("mini-state", listener);
  },
  showMini: (show) => ipcRenderer.send("mini-show", Boolean(show)),
  miniAction: (action) => ipcRenderer.send("mini-action", String(action)),
  // agn-sales-shield:// links (draft D-054 (backlog)), e.g. { kind: "zoho", status: "connected" }; no tokens.
  onDeepLink: (cb) => {
    const listener = (_event, msg) => cb(msg);
    ipcRenderer.on("deep-link", listener);
    return () => ipcRenderer.removeListener("deep-link", listener);
  },
  // "mic" or "system-audio" only; resolves { ok } or { ok: false, reason }.
  openPrivacySettings: (kind) => ipcRenderer.invoke("privacy:open", String(kind)),
  // INT-08: a system notification for a due follow-up step; a click opens that step.
  notify: (notice) => ipcRenderer.invoke("notify:show", notice),
  onNotifyOpen: (cb) => {
    const listener = (_event, stepId) => cb(stepId);
    ipcRenderer.on("notify-open", listener);
    return () => ipcRenderer.removeListener("notify-open", listener);
  },
  // Safety net & diagnostics (S2, L5): redacted critical log + reload state restore.
  logCritical: (entry) => ipcRenderer.invoke("obs:log-critical", entry),
  readDiagnostics: () => ipcRenderer.invoke("obs:read-diagnostics"),
  saveRecoveryState: (state) => ipcRenderer.invoke("call:save-recovery", state),
  takeRecoveryState: () => ipcRenderer.invoke("call:take-recovery"),
  // Keychain / Credential Manager through safeStorage (secure-store.cjs); app keys only.
  secureStore: {
    get: (key) => ipcRenderer.invoke("secure-store:get", String(key)),
    set: (key, value) => ipcRenderer.invoke("secure-store:set", String(key), String(value)),
    delete: (key) => ipcRenderer.invoke("secure-store:delete", String(key)),
  },
});
