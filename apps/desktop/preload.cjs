// The one bridge from the desktop app to its page (auto pick-up): which call app, if any, is
// using a microphone right now. Nothing else of Electron or Node reaches the page.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sottoDesktop", {
  callState: () => ipcRenderer.invoke("call-state"),
  onCallState: (cb) => {
    const listener = (_event, state) => cb(state);
    ipcRenderer.on("call-state", listener);
    return () => ipcRenderer.removeListener("call-state", listener);
  },
});
