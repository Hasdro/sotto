// Sotto desktop (D-022): the same app as the web build, in its own window on Windows, Mac and
// Linux. The web build is served from inside the app (app://sotto), never from the internet; the
// app talks to the Sotto server for accounts and straight to the AI and speech vendors for calls.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, desktopCapturer, net, protocol, session, shell } = require("electron");

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

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: "Sotto",
    backgroundColor: "#F1F4F2",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
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
  // needs a screen to go with it; the page stops that video track at once and keeps the sound.
  // On macOS 14.2+ this uses Apple's audio tap (NSAudioCaptureUsageDescription in Info.plist).
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      if (!own(request.frame?.url) || !request.audioRequested) {
        callback(null);
        return;
      }
      desktopCapturer
        .getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } })
        .then((sources) => {
          if (sources[0]) callback({ video: sources[0], audio: "loopback" });
          else callback(null);
        })
        .catch(() => callback(null));
    },
    { useSystemPicker: false },
  );
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
