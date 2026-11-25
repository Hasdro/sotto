// Sotto desktop (D-022): the same app as the web build, in its own window on Windows, Mac and
// Linux. The web build is served from inside the app (app://sotto), never from the internet; the
// app talks to the Sotto server for accounts and straight to the AI and speech vendors for calls.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { execFile, spawn } = require("node:child_process");
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  nativeImage,
  Notification,
  net,
  protocol,
  session,
  shell,
  Tray,
} = require("electron");

/** Window background before the page paints: the design-system canvas (D-041), light or dark. */
function canvasColor() {
  return nativeTheme.shouldUseDarkColors ? "#111112" : "#fcfcfc";
}
const { callApp } = require("./call-apps.cjs");
const { parseMicUsage } = require("./win-mic.cjs");
const { createSecureStore, registerSecureStore } = require("./secure-store.cjs");
const { registerDeepLinks, registerPrivacy } = require("./deep-link.cjs");
const { registerNotify } = require("./notify.cjs");
const {
  createDiskLogger,
  installProcessHandlers,
  attachWindowSafety,
  registerSafetyIpc,
} = require("./crash-safety.cjs");

const WEB = path.join(__dirname, "web");
const ORIGIN = "app://sotto";
// The user-facing name (D-026). Technical identifiers keep "sotto": the app:// origin, appId and
// the user-data folder, so sign-ins and settings survive the rename.
const NAME = "AGN Sales Shield";
app.setName(NAME);
// The productName change must not move the profile: pin ~/Library/Application Support/sotto-desktop
// (%APPDATA%\sotto-desktop on Windows), unless a dev run passes its own --user-data-dir.
if (!app.commandLine.hasSwitch("user-data-dir")) {
  app.setPath("userData", path.join(app.getPath("appData"), "sotto-desktop"));
}
const safetyLogger = createDiskLogger({ userDataDir: app.getPath("userData") });
safetyLogger.prune();
installProcessHandlers({ proc: process, logger: safetyLogger });
let safetyIpc = { getRecoveryState: () => null };
// Pages may reach https/wss vendors (calls run on this device); scripts only from the app itself.
// SOTTO_LOCAL_SERVER (development only) also allows a plain-http server on this machine.
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(process.env.SOTTO_LOCAL_SERVER ?? "")
  ? ` ${process.env.SOTTO_LOCAL_SERVER}`
  : "";
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  `img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https: wss:${LOCAL}; ` +
  "media-src 'self' blob:; object-src 'none'; base-uri 'none'";

// W1-DESK (draft D-054 (backlog)): agn-sales-shield:// brings the person back (one instance; focus on open).
let pendingLink = null;
const firstInstance = registerDeepLinks({
  app,
  argv: process.argv,
  defaultApp: Boolean(process.defaultApp),
  onFocus: () => {
    if (app.isReady()) focusMain(); // a cold start via the link opens the window as usual
  },
  onLink: (msg) => {
    if (mainWin && !mainWin.webContents.isLoading()) mainWin.webContents.send("deep-link", msg);
    else pendingLink = msg;
  },
});
if (!firstInstance) app.exit(0); // the first instance got the link and focused itself

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
let lastMini = null;

// Shortcuts from any app: ⌃⌥S start or end listening, ⌃⌥C copy the card, ⌃⌥M the mini window.
// Windows uses Ctrl+Shift+Alt: AltGr is Ctrl+Alt there, so adding Shift keeps these from firing
// when someone types an AltGr character.
function shortcutsFor(platform) {
  return platform === "win32"
    ? { listen: "Control+Shift+Alt+S", copy: "Control+Shift+Alt+C", mini: "Control+Shift+Alt+M" }
    : { listen: "Control+Alt+S", copy: "Control+Alt+C", mini: "Control+Alt+M" };
}
const SHORTCUTS = shortcutsFor(process.platform);

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
    width: 520,
    height: 260,
    x: area.x + area.width - 540,
    y: area.y + 20,
    minWidth: 300,
    minHeight: 160,
    title: NAME,
    alwaysOnTop: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: canvasColor(),
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

// The tray icon (owner, 22 Oct 2026; the shield symbol since T-048), "● Live" during a call, and the same menu
// on macOS and Windows. A macOS menu-bar item has a title; a Windows notification-area icon has
// none, so Windows shows the state in the tooltip and as a disabled "● Live" line in the menu.
let tray = null;
function focusMain() {
  if (!mainWin) return createWindow();
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
}
function trayTemplate() {
  const items = [];
  if (process.platform === "win32" && lastMini?.live) {
    items.push({ label: "● Live", enabled: false }, { type: "separator" });
  }
  items.push(
    { label: `Open ${NAME}`, click: focusMain },
    { label: "Show the mini window", accelerator: SHORTCUTS.mini, click: () => showMini(true) },
    {
      label: "Start or end listening",
      accelerator: SHORTCUTS.listen,
      click: () => mainWin?.webContents.send("shortcut", "listen"),
    },
    { type: "separator" },
    { label: `Quit ${NAME}`, role: "quit" },
  );
  return items;
}
function updateTray() {
  if (!tray) return;
  const live = Boolean(lastMini?.live);
  if (process.platform === "darwin") {
    tray.setTitle(live ? " ● Live" : ""); // macOS has a menu-bar title
    tray.setToolTip(NAME);
  } else {
    tray.setToolTip(live ? `${NAME}: live` : NAME); // Windows has no title, only a tooltip
  }
  tray.setContextMenu(Menu.buildFromTemplate(trayTemplate()));
}
function createTray() {
  if (tray || (process.platform !== "darwin" && process.platform !== "win32")) return;
  // macOS: a template image (black + alpha, 16 pt with @2x), so the menu bar tints it for light
  // and dark. Windows: a colour .ico with 16 and 32 px entries for the notification area.
  const assets = path.join(__dirname, "build-assets");
  const icon =
    process.platform === "darwin"
      ? nativeImage.createFromPath(path.join(assets, "trayTemplate.png"))
      : nativeImage.createFromPath(path.join(assets, "tray.ico"));
  if (process.platform === "darwin") icon.setTemplateImage(true);
  tray = new Tray(icon);
  updateTray();
}

ipcMain.on("mini-state", (event, state) => {
  if (event.sender !== mainWin?.webContents) return; // only the main window feeds it
  const changed = Boolean(state?.live) !== Boolean(lastMini?.live);
  lastMini = state;
  if (changed) updateTray();
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

// Shortcuts from any app (⌃⌥ on macOS, Ctrl+Shift+Alt on Windows; see shortcutsFor above).
function registerShortcuts() {
  const send = (what) => mainWin?.webContents.send("shortcut", what);
  globalShortcut.register(SHORTCUTS.listen, () => send("listen"));
  globalShortcut.register(SHORTCUTS.copy, () => send("copy"));
  globalShortcut.register(SHORTCUTS.mini, () =>
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
    title: NAME,
    backgroundColor: canvasColor(),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  guard(win);
  attachWindowSafety({
    win,
    origin: ORIGIN,
    logger: safetyLogger,
    getRecoveryState: () => safetyIpc.getRecoveryState(),
  });
  mainWin = win;
  win.webContents.on("did-finish-load", () => {
    if (pendingLink) win.webContents.send("deep-link", pendingLink);
    pendingLink = null;
  });
  win.on("closed", () => {
    if (mainWin === win) mainWin = null;
    miniWin?.close(); // the mini window has nothing to show without the main window
  });
  void win.loadURL(`${ORIGIN}/`);
}

app.whenReady().then(() => {
  protocol.handle("app", serve);
  // Sign-in tokens in OS secure storage (D-029); safeStorage is ready once the app is.
  const { safeStorage } = require("electron");
  const secure = createSecureStore({ safeStorage, dir: app.getPath("userData") });
  registerSecureStore({ ipcMain, store: secure, origin: ORIGIN });
  safetyIpc = registerSafetyIpc({ ipcMain, logger: safetyLogger, origin: ORIGIN });
  // UX-21: open the OS privacy pane for the microphone or the computer's sound (fixed list).
  registerPrivacy({ ipcMain, shell, platform: process.platform, origin: ORIGIN });
  // INT-08: due follow-up steps; a click focuses the window and opens the step (never sends).
  registerNotify({
    ipcMain,
    Notification,
    origin: ORIGIN,
    onOpen: (stepId) => {
      focusMain();
      mainWin?.webContents.send("notify-open", stepId);
    },
  });
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
  createTray();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Auto pick-up (owner, 21 Oct 2026): a watcher reports which apps use a microphone; when a call
// app starts or stops, the page hears it and starts or ends listening by itself. macOS uses the
// small Swift helper over Core Audio; Windows reads the ConsentStore registry once a second.
// Both produce the same { inputs: [...] } shape and go through the same call-state messages.
let callState = { app: null };
function publishCallState(appName) {
  const next = { app: appName };
  if (next.app === callState.app) return;
  callState = next;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("call-state", callState);
  }
}

const MIC_STORE =
  "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone";
// Fixed arguments only: no shell and no user input. `reg` is a Windows system binary on PATH.
const MIC_ARGS = ["query", MIC_STORE, "/s"];
let micTimer = null;
let micBusy = false;

function pollMic() {
  if (micBusy) return; // a slow reg.exe must not stack up polls
  micBusy = true;
  execFile("reg", MIC_ARGS, { windowsHide: true, timeout: 5000 }, (error, stdout) => {
    micBusy = false;
    if (error) return; // keep the last state; try again on the next tick
    publishCallState(callApp(parseMicUsage(stdout).inputs));
  });
}

function watchWindowsCalls() {
  pollMic();
  micTimer = setInterval(pollMic, 1000);
  app.on("will-quit", () => {
    clearInterval(micTimer);
    micTimer = null;
  });
}

function watchCalls() {
  if (process.platform === "win32") return watchWindowsCalls();
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
      publishCallState(Array.isArray(inputs) ? callApp(inputs) : null);
    }
  });
  child.on("error", () => {}); // no helper, no auto pick-up: the Start button still works
  app.on("will-quit", () => child.kill());
}
ipcMain.handle("call-state", () => callState);
app.whenReady().then(watchCalls);

app.on("window-all-closed", () => {
  // macOS keeps running without windows; Windows does the same while its tray icon is there, so
  // "Open Sotto" can bring the window back. Closing the tray's Quit really quits.
  if (process.platform === "darwin" || (process.platform === "win32" && tray)) return;
  app.quit();
});
