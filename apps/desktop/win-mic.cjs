// Sotto's Windows microphone watcher parser: which apps are using a microphone right now, read
// from the registry. Pure CommonJS: no Electron, no child_process, no I/O. The desktop app runs
// `reg query ... /s` and hands the stdout here. It reads only the *names* of apps that used the
// microphone — never audio, never a device name, never a sample.
//
// Source (verified 22 Oct 2026):
//   HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone
//
// - Microsoft Q&A (learn.microsoft.com) names this exact store and its LastUsedTimeStart /
//   LastUsedTimeStop values:
//   https://learn.microsoft.com/en-us/answers/questions/1193937/detect-if-user-has-muted-unmuted-microphone-in-mes
// - Microsoft's `reg query` docs describe the command used and `/s` (recursive):
//   https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/reg-query
// - A real registry dump (Stack Overflow 63032108) confirms that under NonPackaged each desktop
//   app is a subkey holding its executable path with `#` in place of `\`, and that an app is
//   using the mic right now when LastUsedTimeStop is 0:
//   https://stackoverflow.com/questions/63032108/see-if-an-app-is-using-the-microphone-on-windows-10
// - Stack Overflow 78800678 shows the same NonPackaged subkey shape and confirms the values are
//   FILETIME (100 ns since 1601) hex, e.g. 0x1dd217e84c2c69a1:
//   https://stackoverflow.com/questions/78800678/in-the-windows-registry-what-values-are-stored-in-microphones-or-any-hardware
// - The DFIR Review paper "Can You Track Processes Accessing the Camera and Microphone on
//   Windows 10?" shows Store apps as direct child keys and desktop apps under NonPackaged with
//   `#` for `\`, each holding both timestamps:
//   https://dfir.pubpub.org/pub/nm5b39ae/release/1
// - The DFIR handbook's CapabilityAccessManager page confirms the same store and values:
//   https://windows.dfirhandbook.com/windows-artifacts/program-execution/capabilityaccessmanager
//
// `reg query ... /s` prints each key as a column-0 HKEY_ line followed by indented
// "    Name    REG_TYPE    data" lines and a blank line. LastUsedTimeStart is non-zero once the
// app has used the microphone; LastUsedTimeStop is zero while it is still using it. A stale
// entry with LastUsedTimeStop == 0 but LastUsedTimeStart == 0 was never used and is not a call.

"use strict";

// The command queries HKCU only. Everything after this suffix is the app entry; keys outside
// this store (another hive, webcam, a microphone2 key) are ignored.
const STORE = "\\capabilityaccessmanager\\consentstore\\microphone";
const HKCU_KEY = /^HKEY_CURRENT_USER\\/i;

// reg.exe writes key headers in column 0. Values are indented four spaces between fields.
const KEY_LINE = /^HKEY_/i;
const TIME_VALUE = /^\s+(LastUsedTimeStart|LastUsedTimeStop)\s+(REG_[A-Z0-9_]+)(?:\s+(.*))?$/i;
// REG_BINARY is printed as uppercase hex bytes; tolerate a wrapped hex continuation line.
const HEX_LINE = /^\s*(?:[0-9A-Fa-f]{2}\s*)+$/;

/** Hex digits of a registry number, or null when the text is not a number we can read. */
function hexDigits(text) {
  if (typeof text !== "string") return null;
  const digits = text.trim().replace(/^0x/i, "").replace(/[\s,]/g, "");
  if (!digits || !/^[0-9a-f]+$/i.test(digits)) return null;
  return digits;
}

function isZero(text) {
  const digits = hexDigits(text);
  return digits !== null && /^0+$/.test(digits);
}

function isNonZero(text) {
  const digits = hexDigits(text);
  return digits !== null && /[1-9a-f]/i.test(digits);
}

/** The app name a ConsentStore\microphone subkey stands for, or null for the store itself. */
function appName(key) {
  if (!HKCU_KEY.test(key)) return null;
  const lower = key.toLowerCase();
  const at = lower.indexOf(STORE);
  if (at < 0) return null;
  const tail = key.slice(at + STORE.length);
  if (!tail.startsWith("\\")) return null; // the microphone key itself, not an app
  const parts = tail.slice(1).split("\\").filter(Boolean);
  if (parts.length === 0) return null;

  if (parts[0].toLowerCase() === "nonpackaged") {
    if (parts.length < 2) return null;
    // Desktop apps: every `#` was a `\` in the executable path.
    return parts.slice(1).join("\\").replace(/#/g, "\\") || null;
  }
  // Store/MSIX apps: the subkey is the package family name, e.g. MSTeams_8wekyb3d8bbwe.
  return parts[0];
}

/**
 * Parse the stdout of
 * `reg query "HKCU\...\ConsentStore\microphone" /s`.
 * Returns the same shape the macOS helper prints: { inputs: string[] }.
 * Never throws; malformed input yields { inputs: [] }.
 */
function parseMicUsage(text) {
  const inputs = new Set();
  try {
    const raw = Buffer.isBuffer(text)
      ? text.toString("utf8")
      : typeof text === "string"
        ? text
        : "";
    let key = null;
    let start = null;
    let stop = null;
    let lastValue = null;
    let lastType = null;

    const flush = () => {
      // Both conditions matter: Stop == 0 alone is left behind by entries that were never used.
      if (key !== null && isZero(stop) && isNonZero(start)) {
        const name = appName(key);
        if (name) inputs.add(name);
      }
      key = null;
      start = null;
      stop = null;
      lastValue = null;
      lastType = null;
    };

    for (const line of raw.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/)) {
      if (KEY_LINE.test(line)) {
        flush();
        key = line.trim();
        continue;
      }
      if (key === null) continue; // anything before the first key is not ours
      if (line.trim() === "") {
        lastValue = null;
        lastType = null;
        continue;
      }

      const match = TIME_VALUE.exec(line);
      if (match) {
        lastValue = match[1].toLowerCase() === "lastusedtimestart" ? "start" : "stop";
        lastType = match[2].toUpperCase();
        // Ignore a value we cannot read instead of letting it erase a good one.
        if (hexDigits(match[3]) !== null) {
          if (lastValue === "start") start = match[3];
          else stop = match[3];
        }
        continue;
      }

      // A long REG_BINARY can be printed over more than one line; keep the bytes together.
      if (lastValue && lastType === "REG_BINARY" && HEX_LINE.test(line)) {
        if (lastValue === "start") start = (start ?? "") + line.trim();
        else stop = (stop ?? "") + line.trim();
      }
      // Any other value (Value, LastSetTime, REG_SZ "Allow", junk) is ignored.
    }
    flush();
  } catch {
    return { inputs: [] };
  }
  return { inputs: [...inputs].sort() };
}

module.exports = { parseMicUsage };
