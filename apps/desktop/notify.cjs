// INT-08 (D-055): system notifications for due follow-up steps. The page asks for one with a
// step id and two short lines; clicking it brings the window forward and tells the page which
// step to open. A notification never sends anything: the agent sends from the opened step.
//
// Only the app's own pages may ask; the id must be a step id (16 hex) and the text is cut short,
// so a page cannot make the OS show arbitrary long content or open a URL.

const STEP_ID = /^[a-f0-9]{16}$/;
const MAX_TITLE = 80;
const MAX_BODY = 160;

/** A clean notice, or null when the request is not one the app makes. */
function cleanNotice(raw) {
  if (!raw || typeof raw !== "object") return null;
  const { stepId, title, body } = raw;
  if (typeof stepId !== "string" || !STEP_ID.test(stepId)) return null;
  if (typeof title !== "string" || !title.trim()) return null;
  const one = (s, max) =>
    String(s ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  return { stepId, title: one(title, MAX_TITLE), body: one(body, MAX_BODY) };
}

function ownFrame(event, origin) {
  const url = event?.senderFrame?.url ?? "";
  return url === origin || url.startsWith(`${origin}/`);
}

/**
 * Registers `notify:show`. `Notification` is Electron's class (a fake in tests); `onOpen(stepId)`
 * focuses the main window and forwards the step to the page.
 */
function registerNotify({ ipcMain, Notification, origin, onOpen }) {
  const live = new Set(); // keep a reference until clicked or closed (else GC drops the click)
  ipcMain.handle("notify:show", (event, raw) => {
    if (!ownFrame(event, origin)) return false;
    const notice = cleanNotice(raw);
    if (!notice || !Notification?.isSupported?.()) return false;
    const n = new Notification({ title: notice.title, body: notice.body, silent: false });
    live.add(n);
    n.on("click", () => {
      live.delete(n);
      onOpen(notice.stepId);
    });
    n.on("close", () => live.delete(n));
    n.show();
    return true;
  });
  return live;
}

module.exports = { cleanNotice, registerNotify, STEP_ID };
