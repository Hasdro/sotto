// INT-08: a due follow-up step's notification opens that step (and nothing else).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { cleanNotice, registerNotify } = require("../notify.cjs");

const ORIGIN = "app://sotto";
const STEP = "0123456789abcdef";

function fakes() {
  const handlers = {};
  const shown = [];
  class Notification {
    static isSupported() {
      return true;
    }
    constructor(opts) {
      this.opts = opts;
      this.events = {};
    }
    on(name, fn) {
      this.events[name] = fn;
    }
    show() {
      shown.push(this);
    }
  }
  const ipcMain = { handle: (name, fn) => (handlers[name] = fn) };
  return { handlers, shown, Notification, ipcMain };
}

const own = { senderFrame: { url: `${ORIGIN}/` } };

test("a click on the notification opens the right step", async () => {
  const f = fakes();
  const opened = [];
  registerNotify({ ...f, origin: ORIGIN, onOpen: (id) => opened.push(id) });
  const ok = await f.handlers["notify:show"](own, {
    stepId: STEP,
    title: "Follow-up due: WhatsApp for Jane",
    body: "Open it to check and send.",
  });
  assert.equal(ok, true);
  assert.equal(f.shown.length, 1);
  assert.deepEqual(f.shown[0].opts, {
    title: "Follow-up due: WhatsApp for Jane",
    body: "Open it to check and send.",
    silent: false,
  });
  assert.deepEqual(opened, []); // showing sends and opens nothing
  f.shown[0].events.click();
  assert.deepEqual(opened, [STEP]);
});

test("only the app's own pages may ask, with a real step id", async () => {
  const f = fakes();
  registerNotify({ ...f, origin: ORIGIN, onOpen() {} });
  const show = f.handlers["notify:show"];
  assert.equal(
    await show({ senderFrame: { url: "https://evil.test/" } }, { stepId: STEP, title: "x" }),
    false,
  );
  assert.equal(await show(own, { stepId: "../../etc", title: "x" }), false);
  assert.equal(await show(own, { stepId: STEP, title: "" }), false);
  assert.equal(await show(own, null), false);
  assert.equal(f.shown.length, 0);
});

test("text is cut to one short line", () => {
  const n = cleanNotice({ stepId: STEP, title: `a\n${"b".repeat(200)}`, body: "c".repeat(400) });
  assert.equal(n.title.length, 80);
  assert.ok(!n.title.includes("\n"));
  assert.equal(n.body.length, 160);
});

test("the preload exposes notify and onNotifyOpen, and main wires the click to the page", () => {
  const preload = fs.readFileSync(path.join(__dirname, "..", "preload.cjs"), "utf8");
  assert.match(preload, /notify: \(notice\) => ipcRenderer\.invoke\("notify:show", notice\)/);
  assert.match(preload, /ipcRenderer\.on\("notify-open"/);
  const main = fs.readFileSync(path.join(__dirname, "..", "main.cjs"), "utf8");
  assert.match(main, /registerNotify\(/);
  assert.match(main, /webContents\.send\("notify-open", stepId\)/);
});
