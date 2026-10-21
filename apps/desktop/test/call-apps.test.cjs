const assert = require("node:assert/strict");
const { test } = require("node:test");
const { callApp } = require("../call-apps.cjs");

test("a call app using the microphone is a call", () => {
  assert.equal(callApp(["us.zoom.xos"]), "us.zoom.xos");
  assert.equal(callApp(["com.microsoft.teams2"]), "com.microsoft.teams2");
  assert.equal(callApp(["com.google.Chrome.helper"]), "com.google.Chrome.helper");
  assert.equal(callApp(["com.yeastar.linkus"]), "com.yeastar.linkus");
});

test("Sotto itself and other apps are not a call", () => {
  assert.equal(callApp([]), null);
  assert.equal(callApp(["app.sotto.desktop.helper"]), null);
  assert.equal(callApp(["com.github.Electron.helper"]), null);
  assert.equal(callApp(["com.apple.VoiceMemos"]), null);
  assert.equal(callApp(["app.sotto.desktop", "us.zoom.xos"]), "us.zoom.xos");
});
