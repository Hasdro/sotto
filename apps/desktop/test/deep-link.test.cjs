// W1-DESK (D-054): the agn-sales-shield:// protocol and the whitelisted privacy-pane opener.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  SCHEME,
  parseDeepLink,
  linkFromArgv,
  privacySettingsUrl,
  registerPrivacy,
  registerDeepLinks,
} = require("../deep-link.cjs");

const ORIGIN = "app://sotto";

function fakeApp({ lock = true } = {}) {
  const handlers = {};
  return {
    registered: [],
    handlers,
    setAsDefaultProtocolClient(...args) {
      this.registered.push(args);
      return true;
    },
    requestSingleInstanceLock: () => lock,
    on(name, fn) {
      handlers[name] = fn;
    },
    whenReady: () => Promise.resolve(),
  };
}

test("the scheme is registered with the OS by the installed app", () => {
  const app = fakeApp();
  const ok = registerDeepLinks({
    app,
    argv: ["/Apps/AGN"],
    defaultApp: false,
    onLink() {},
    onFocus() {},
  });
  assert.equal(ok, true);
  assert.deepEqual(app.registered, [[SCHEME]]);
  assert.equal(SCHEME, "agn-sales-shield");
});

test("a dev run never takes the scheme from the installed app", () => {
  const app = fakeApp();
  registerDeepLinks({ app, argv: ["electron", "."], defaultApp: true, onLink() {}, onFocus() {} });
  assert.deepEqual(app.registered, []);
});

test("electron-builder declares the protocol for Mac and Windows and ships the module", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  assert.deepEqual(pkg.build.protocols, [
    { name: "AGN Sales Shield", schemes: ["agn-sales-shield"] },
  ]);
  assert.ok(pkg.build.files.includes("deep-link.cjs"));
});

test("a second instance hands over and quits; the first focuses and gets the link", () => {
  assert.equal(
    registerDeepLinks({
      app: fakeApp({ lock: false }),
      argv: [],
      defaultApp: false,
      onLink() {},
      onFocus() {},
    }),
    false,
  );
  const app = fakeApp();
  const got = [];
  let focused = 0;
  registerDeepLinks({
    app,
    argv: ["/Apps/AGN"],
    defaultApp: false,
    onLink: (m) => got.push(m),
    onFocus: () => focused++,
  });
  app.handlers["second-instance"]({}, ["/Apps/AGN", "agn-sales-shield://zoho/connected"]);
  app.handlers["second-instance"]({}, ["/Apps/AGN"]); // a plain second launch: focus only
  let prevented = false;
  app.handlers["open-url"](
    { preventDefault: () => (prevented = true) },
    "agn-sales-shield://zoho/cancelled",
  );
  assert.deepEqual(got, [
    { kind: "zoho", status: "connected" },
    { kind: "zoho", status: "cancelled" },
  ]);
  assert.equal(focused, 3);
  assert.equal(prevented, true);
});

test("only known paths are understood; tokens and other schemes are dropped", () => {
  assert.deepEqual(parseDeepLink("agn-sales-shield://zoho/connected"), {
    kind: "zoho",
    status: "connected",
  });
  assert.deepEqual(parseDeepLink("agn-sales-shield://zoho/connected/?code=abc"), {
    kind: "zoho",
    status: "connected",
  });
  const withQuery = parseDeepLink("agn-sales-shield://zoho/connected?token=secret");
  assert.equal(JSON.stringify(withQuery).includes("secret"), false);
  for (const bad of [
    "agn-sales-shield://open?url=https://evil.test",
    "agn-sales-shield://zoho/other",
    "https://zoho/connected",
    "javascript:alert(1)",
    "",
    null,
    `agn-sales-shield://zoho/connected${"x".repeat(300)}`,
  ]) {
    assert.equal(parseDeepLink(bad), null, String(bad));
  }
  assert.equal(
    linkFromArgv(["a", "--flag", "agn-sales-shield://zoho/connected"]),
    "agn-sales-shield://zoho/connected",
  );
  assert.equal(linkFromArgv(["a"]), null);
});

test("privacy panes map to the right URL per platform", () => {
  assert.equal(
    privacySettingsUrl("mic", "darwin"),
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
  );
  assert.equal(
    privacySettingsUrl("system-audio", "darwin"),
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  );
  assert.equal(privacySettingsUrl("mic", "win32"), "ms-settings:privacy-microphone");
  assert.equal(privacySettingsUrl("system-audio", "win32"), null); // loopback needs no permission
  assert.equal(privacySettingsUrl("mic", "linux"), null);
  for (const bad of ["camera", "https://evil.test", "", undefined, "constructor", "__proto__"]) {
    assert.equal(privacySettingsUrl(bad, "darwin"), null, String(bad));
  }
});

function privacyHarness(platform) {
  const opened = [];
  let handler;
  registerPrivacy({
    ipcMain: {
      handle: (name, fn) => {
        if (name === "privacy:open") handler = fn;
      },
    },
    shell: { openExternal: async (u) => opened.push(u) },
    platform,
    origin: ORIGIN,
  });
  const call = (kind, url = `${ORIGIN}/call`) => handler({ senderFrame: { url } }, kind);
  return { opened, call };
}

test("openPrivacySettings accepts only mic and system-audio from the app's own pages", async () => {
  const mac = privacyHarness("darwin");
  assert.deepEqual(await mac.call("mic"), { ok: true });
  assert.deepEqual(await mac.call("system-audio"), { ok: true });
  assert.deepEqual(await mac.call("camera"), { ok: false, reason: "unknown" });
  assert.deepEqual(await mac.call("https://evil.test"), { ok: false, reason: "unknown" });
  assert.deepEqual(await mac.call("mic", "https://evil.test/"), { ok: false, reason: "forbidden" });
  assert.deepEqual(mac.opened, [
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  ]);
  const win = privacyHarness("win32");
  assert.deepEqual(await win.call("mic"), { ok: true });
  assert.deepEqual(await win.call("system-audio"), { ok: false, reason: "not_needed" });
  assert.deepEqual(win.opened, ["ms-settings:privacy-microphone"]);
});

test("preload exposes openPrivacySettings and onDeepLink, nothing that opens a URL", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "preload.cjs"), "utf8");
  assert.match(
    src,
    /openPrivacySettings: \(kind\) => ipcRenderer\.invoke\("privacy:open", String\(kind\)\)/,
  );
  assert.match(src, /onDeepLink:/);
  assert.equal(/openExternal|shell/.test(src), false);
});
