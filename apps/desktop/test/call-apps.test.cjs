const assert = require("node:assert/strict");
const { test } = require("node:test");
const { callApp } = require("../call-apps.cjs");

test("a call app using the microphone is a call", () => {
  assert.equal(callApp(["us.zoom.xos"]), "us.zoom.xos");
  assert.equal(callApp(["com.microsoft.teams2"]), "com.microsoft.teams2");
  assert.equal(callApp(["com.google.Chrome.helper"]), "com.google.Chrome.helper");
  assert.equal(callApp(["com.yeastar.linkus"]), "com.yeastar.linkus");
});

test("a Windows call app path or package family name is a call", () => {
  assert.equal(
    callApp(["C:\\Program Files\\Zoom\\bin\\Zoom.exe"]),
    "C:\\Program Files\\Zoom\\bin\\Zoom.exe",
  );
  assert.equal(callApp(["MSTeams_8wekyb3d8bbwe"]), "MSTeams_8wekyb3d8bbwe");
  assert.equal(
    callApp(["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]),
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  );
  assert.equal(
    callApp(["C:\\Program Files\\Yeastar\\Linkus\\Linkus.exe"]),
    "C:\\Program Files\\Yeastar\\Linkus\\Linkus.exe",
  );
});

test("Sotto itself and other apps are not a call", () => {
  assert.equal(callApp([]), null);
  assert.equal(callApp(["app.sotto.desktop.helper"]), null);
  assert.equal(callApp(["com.github.Electron.helper"]), null);
  assert.equal(callApp(["com.apple.VoiceMemos"]), null);
  assert.equal(callApp(["app.sotto.desktop", "us.zoom.xos"]), "us.zoom.xos");

  // Windows: Sotto's installed process and the Electron binary used in development.
  assert.equal(callApp(["C:\\Program Files\\Sotto\\Sotto.exe"]), null);
  assert.equal(callApp(["C:\\Users\\hasan\\AppData\\Local\\Programs\\sotto\\Sotto.exe"]), null);
  assert.equal(callApp(["C:\\dev\\tools\\node_modules\\electron\\dist\\electron.exe"]), null);
  assert.equal(
    callApp(["C:\\Program Files\\Sotto\\Sotto.exe", "C:\\Program Files\\Zoom\\bin\\Zoom.exe"]),
    "C:\\Program Files\\Zoom\\bin\\Zoom.exe",
  );
});

test("a Windows app that is not a call app is not a call", () => {
  assert.equal(callApp(["C:\\Windows\\System32\\notepad.exe"]), null);
  assert.equal(callApp(["C:\\Program Files\\Audacity\\Audacity.exe"]), null);
});
