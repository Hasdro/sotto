// The one bridge from the desktop app to its pages: which call app, if any, is using a
// microphone (auto pick-up), the global shortcuts, and the mini window's card. Nothing else of
// Electron or Node reaches the page.
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
});
