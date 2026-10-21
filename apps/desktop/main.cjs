// Sotto desktop (D-022): the same app as the web build, in its own window on Windows, Mac and
// Linux. The web build is served from inside the app (app://sotto), never from the internet; the
// app talks to the Sotto server for accounts and straight to the AI and speech vendors for calls.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawn } = require("node:child_process");
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  net,
  protocol,
  session,
  shell,
} = require("electron");
const { callApp } = require("./call-apps.cjs");

const WEB = path.join(__dirname, "web");
const ORIGIN = "app://sotto";
// Pages may reach https/wss vendors (calls run on this device); scripts only from the app itself.
// SOTTO_LOCAL_SERVER (development only) also allows a plain-http server on this machine.
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(process.env.SOTTO_LOCAL_SERVER ?? "")
  ? ` ${process.env.SOTTO_LOCAL_SERVER}`
  : "";
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  `img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https: wss:${LOCAL}; ` +
  "media-src 'self' blob:; object-src 'none'; base-uri 'none'";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

async function serve(request) {
  const { pathname } = new URL(request.url);
  let file = path.normalize(path.join(WEB, decodeURIComponent(pathname)));
  if (path.relative(WEB, file).startsWith("..")) return new Response("not found", { status: 404 });
  const exists = fs.existsSync(file) && fs.statSync(file).isFile();
  if (!exists) {
    if (path.extname(pathname)) return new Response("not found", { status: 404 });
    file = path.join(WEB, "index.html"); // client-side route
  }
  const response = await net.fetch(pathToFileURL(file).toString());
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", CSP);
  return new Response(response.body, { status: response.status, headers });
}

function openExternal(url) {
  if (url.startsWith("https://")) void shell.openExternal(url);
}

let mainWin = null;
let miniWin = null;

function guard(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url); // "Get a key" links open in the browser
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) {
      event.preventDefault();
      openExternal(url);
    }
  });
}

// The mini window (owner, 22 Oct 2026): the newest card, always on top beside Zoom or the
// softphone, in the top-right corner. The main window owns the call and sends it the card.
function showMini(show) {
  if (!show) {
    miniWin?.hide();
    return;
  }
  if (miniWin && !miniWin.isDestroyed()) {
    miniWin.showInactive();
    return;
  }
  // `screen` only after the app is ready (Electron docs); read here, never at load time.
  const area = require("electron").screen.getPrimaryDisplay().workArea;
  miniWin = new BrowserWindow({
    width: 420,
    height: 260,
    x: area.x + area.width - 440,
    y: area.y + 20,
    minWidth: 300,
    minHeight: 160,
    title: "Sotto",
    alwaysOnTop: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: "#F1F4F2",
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  miniWin.setAlwaysOnTop(true, "floating");
  miniWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  guard(miniWin);
  miniWin.once("ready-to-show", () => miniWin?.showInactive());
  miniWin.on("closed", () => {
    miniWin = null;
  });
  void miniWin.loadURL(`${ORIGIN}/mini`);
}

let lastMini = null;
ipcMain.on("mini-state", (event, state) => {
  if (event.sender !== mainWin?.webContents) return; // only the main window feeds it
  lastMini = state;
  if (miniWin && !miniWin.isDestroyed()) miniWin.webContents.send("mini-state", state);
});
ipcMain.handle("mini-last", () => lastMini);
ipcMain.on("mini-show", (_event, show) => showMini(Boolean(show)));
ipcMain.on("mini-action", (event, action) => {
  if (event.sender !== miniWin?.webContents) return;
  if (action === "open" && mainWin) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
  }
  if (["open", "copy", "listen"].includes(action)) mainWin?.webContents.send("shortcut", action);
});

// Shortcuts from any app: ⌃⌥S start or end listening, ⌃⌥C copy the card, ⌃⌥M the mini window.
function registerShortcuts() {
  const send = (what) => mainWin?.webContents.send("shortcut", what);
  globalShortcut.register("Control+Alt+S", () => send("listen"));
  globalShortcut.register("Control+Alt+C", () => send("copy"));
  globalShortcut.register("Control+Alt+M", () =>
    showMini(!(miniWin && !miniWin.isDestroyed() && miniWin.isVisible())),
  );
}
app.on("will-quit", () => globalShortcut.unregisterAll());

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: "Sotto",
    backgroundColor: "#F1F4F2",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  guard(win);
  mainWin = win;
  win.on("closed", () => {
    if (mainWin === win) mainWin = null;
    miniWin?.close(); // the mini window has nothing to show without the main window
  });
  void win.loadURL(`${ORIGIN}/`);
}

app.whenReady().then(() => {
  protocol.handle("app", serve);
  // Only audio capture, only for the app's own pages: the microphone, or the computer's sound.
  const own = (url) => typeof url === "string" && url.startsWith(`${ORIGIN}/`);
  const allowed = (wc, permission) =>
    (permission === "media" || permission === "display-capture") && own(wc.getURL());
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) =>
    callback(allowed(wc, permission)),
  );
  session.defaultSession.setPermissionCheckHandler((wc, permission) =>
    wc ? allowed(wc, permission) : false,
  );
  // The computer's sound (D-024): the other side of a Zoom, Google Meet or softphone call. Chromium
  // needs a picture to go with it; the page stops that video track at once and keeps the sound.
  // On macOS 14.2+ this uses Apple's audio tap (NSAudioCaptureUsageDescription in Info.plist).
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      if (!own(request.frame?.url) || !request.audioRequested) {
        callback(null);
        return;
      }
      // The app's own window as the picture needs no screen-recording permission; only the
      // system-audio permission (asked once by macOS) applies.
      callback({ video: request.frame, audio: "loopback" });
    },
    { useSystemPicker: false },
  );
  createWindow();
  registerShortcuts();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Auto pick-up (owner, 21 Oct 2026), macOS: a small helper reports which apps use a microphone;
// when a call app starts or stops, the page hears it and starts or ends listening by itself.
let callState = { app: null };
function watchCalls() {
  if (process.platform !== "darwin") return;
  const bin = app.isPackaged
    ? path.join(process.resourcesPath, "call-watch")
    : path.join(__dirname, "build", "call-watch");
  if (!fs.existsSync(bin)) return;
  const child = spawn(bin, [], { stdio: ["ignore", "pipe", "ignore"] });
  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk;
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      nl = buf.indexOf("\n");
      let inputs;
      try {
        inputs = JSON.parse(line).inputs;
      } catch {
        continue;
      }
      const next = { app: Array.isArray(inputs) ? callApp(inputs) : null };
      if (next.app === callState.app) continue;
      callState = next;
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send("call-state", callState);
    }
  });
  child.on("error", () => {}); // no helper, no auto pick-up: the Start button still works
  app.on("will-quit", () => child.kill());
}
ipcMain.handle("call-state", () => callState);
app.whenReady().then(watchCalls);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
