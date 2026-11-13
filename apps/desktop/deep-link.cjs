// W1-DESK (D-054, UX-21, UX-35): the `agn-sales-shield://` link that brings the person back to
// the app after a browser step (Zoho connect), and "open the OS privacy pane" for the microphone
// and the computer's sound. Pure functions plus two small registrars, so tests need no Electron.
//
// The link carries no tokens: only a closed list of paths is understood and the query is ignored.
// The privacy opener only knows fixed OS settings URLs; nothing from the page reaches openExternal.

const SCHEME = "agn-sales-shield";

// path → what the page is told. Anything else is dropped.
const LINKS = Object.freeze({
  "zoho/connected": { kind: "zoho", status: "connected" },
  "zoho/cancelled": { kind: "zoho", status: "cancelled" },
});

/** The page message for a deep link, or null for anything not on the list. */
function parseDeepLink(raw) {
  if (typeof raw !== "string" || raw.length > 200) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${SCHEME}:`) return null;
  // agn-sales-shield://zoho/connected → host "zoho", pathname "/connected".
  const path = `${url.hostname}${url.pathname}`.replace(/\/+$/, "").toLowerCase();
  const hit = LINKS[path];
  return hit ? { ...hit } : null;
}

/** The deep link in a second instance's argv (Windows, Linux), if any. */
function linkFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  return argv.find((a) => typeof a === "string" && a.startsWith(`${SCHEME}://`)) ?? null;
}

// Fixed OS settings panes. macOS: Privacy & Security › Microphone, and › Screen & System Audio
// Recording (where "system audio recording only" apps are listed, macOS 14.2+). Windows has a
// microphone privacy page; the computer's sound needs no permission there (loopback).
const PRIVACY = Object.freeze({
  darwin: {
    mic: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    "system-audio": "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  },
  win32: {
    mic: "ms-settings:privacy-microphone",
  },
});
const PRIVACY_KINDS = Object.freeze(["mic", "system-audio"]);

/** The settings URL for this kind on this platform; null when there is none (or not allowed). */
function privacySettingsUrl(kind, platform) {
  if (!PRIVACY_KINDS.includes(kind)) return null;
  return PRIVACY[platform]?.[kind] ?? null;
}

function ownFrame(event, origin) {
  const url = event?.senderFrame?.url ?? "";
  return url === origin || url.startsWith(`${origin}/`);
}

/** IPC "privacy:open": only the app's own pages, only the fixed list. Resolves to a result. */
function registerPrivacy({ ipcMain, shell, platform, origin }) {
  ipcMain.handle("privacy:open", async (event, kind) => {
    if (!ownFrame(event, origin)) return { ok: false, reason: "forbidden" };
    if (!PRIVACY_KINDS.includes(kind)) return { ok: false, reason: "unknown" };
    const url = privacySettingsUrl(kind, platform);
    if (!url) return { ok: false, reason: "not_needed" };
    await shell.openExternal(url);
    return { ok: true };
  });
}

/**
 * Registers the scheme with the OS and routes links to `onLink(message)`. macOS delivers them
 * with "open-url"; Windows and Linux start a second instance whose argv holds the link, which
 * the single-instance lock turns into "second-instance" here. Returns false when another
 * instance owns the lock (the caller quits).
 */
function registerDeepLinks({ app, argv, defaultApp, onLink, onFocus }) {
  // Only the installed app claims the scheme: a dev run (`electron .`) must never take it from
  // the owner's installed copy on the same machine.
  if (!defaultApp) app.setAsDefaultProtocolClient(SCHEME);
  if (!app.requestSingleInstanceLock()) return false;
  const deliver = (raw) => {
    onFocus();
    const msg = parseDeepLink(raw);
    if (msg) onLink(msg);
  };
  app.on("open-url", (event, url) => {
    event.preventDefault();
    deliver(url);
  });
  app.on("second-instance", (_event, args) => {
    const raw = linkFromArgv(args);
    if (raw) deliver(raw);
    else onFocus();
  });
  // Windows/Linux cold start from a link: the link is in this process's own argv.
  const first = linkFromArgv(argv);
  if (first) app.whenReady().then(() => deliver(first));
  return true;
}

module.exports = {
  SCHEME,
  PRIVACY_KINDS,
  parseDeepLink,
  linkFromArgv,
  privacySettingsUrl,
  registerPrivacy,
  registerDeepLinks,
};
