const assert = require("node:assert/strict");
const { test } = require("node:test");
const { callApp } = require("../call-apps.cjs");
const { parseMicUsage } = require("../win-mic.cjs");

// Fixtures below are byte-for-byte the shape of `reg query "<store>" /s` on Windows 10/11:
// a column-0 key header, four-space-indented "Name    REG_TYPE    data" lines, a blank line
// between keys. CRLF is what reg.exe writes when stdout is a pipe.
const ROOT =
  "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone";

const START = "0x1dd217e84c2c69a1";
const STOP = "0x1dd217e84c2c69a2";

const ZOOM_KEY = "NonPackaged\\C:#Program Files#Zoom#bin#Zoom.exe";
const CHROME_KEY = "NonPackaged\\C:#Program Files#Google#Chrome#Application#chrome.exe";
const SOTTO_KEY = "NonPackaged\\C:#Program Files#Sotto#Sotto.exe";
const SLACK_KEY = "NonPackaged\\C:#Program Files#Slack#slack.exe";
const DISCORD_KEY = "NonPackaged\\C:#Program Files#Discord#Discord.exe";
const WEBEX_KEY = "NonPackaged\\C:#Program Files#Webex#webex.exe";
const TELEGRAM_KEY = "NonPackaged\\C:#Program Files#Telegram#Telegram.exe";

const ZOOM = "C:\\Program Files\\Zoom\\bin\\Zoom.exe";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SOTTO = "C:\\Program Files\\Sotto\\Sotto.exe";
const WEBEX = "C:\\Program Files\\Webex\\webex.exe";
const TELEGRAM = "C:\\Program Files\\Telegram\\Telegram.exe";
const TEAMS = "MSTeams_8wekyb3d8bbwe";

function block(subkey, values = []) {
  const key = subkey ? `${ROOT}\\${subkey}` : ROOT;
  const lines = [key, "    Value    REG_SZ    Allow"];
  for (const [name, type, data] of values) lines.push(`    ${name}    ${type}    ${data}`);
  return `${lines.join("\r\n")}\r\n`;
}

function store(...blocks) {
  return blocks.join("\r\n");
}

const IN_USE = [CHROME, SOTTO, ZOOM, TEAMS];

test("a real reg query /s dump returns exactly the apps using the microphone", () => {
  const output = store(
    block(null),
    block("NonPackaged"),
    block(ZOOM_KEY, [
      ["LastUsedTimeStart", "REG_QWORD", START],
      ["LastUsedTimeStop", "REG_QWORD", "0x0"],
    ]),
    block(TEAMS, [
      ["LastUsedTimeStart", "REG_QWORD", START],
      ["LastUsedTimeStop", "REG_QWORD", "0x0"],
    ]),
    block(CHROME_KEY, [
      ["LastUsedTimeStart", "REG_QWORD", START],
      ["LastUsedTimeStop", "REG_QWORD", "0x0"],
    ]),
    block(SOTTO_KEY, [
      ["LastUsedTimeStart", "REG_QWORD", START],
      ["LastUsedTimeStop", "REG_QWORD", "0x0"],
    ]),
    // Stopped: LastUsedTimeStop is no longer zero.
    block(SLACK_KEY, [
      ["LastUsedTimeStart", "REG_QWORD", START],
      ["LastUsedTimeStop", "REG_QWORD", STOP],
    ]),
    // Never used: both are zero, so Stop == 0 alone must not count as a call.
    block(DISCORD_KEY, [
      ["LastUsedTimeStart", "REG_QWORD", "0x0"],
      ["LastUsedTimeStop", "REG_QWORD", "0x0"],
    ]),
  );

  assert.deepEqual(parseMicUsage(output), { inputs: IN_USE });
});

test("the parser returns the Swift watcher's shape, and Sotto is excluded by call-apps", () => {
  const output = store(
    block(null),
    block(ZOOM_KEY, [
      ["LastUsedTimeStart", "REG_QWORD", START],
      ["LastUsedTimeStop", "REG_QWORD", "0x0"],
    ]),
    block(SOTTO_KEY, [
      ["LastUsedTimeStart", "REG_QWORD", START],
      ["LastUsedTimeStop", "REG_QWORD", "0x0"],
    ]),
  );

  const parsed = parseMicUsage(output);
  assert.deepEqual(Object.keys(parsed), ["inputs"]);
  assert.ok(Array.isArray(parsed.inputs));
  // The parser reports Sotto honestly; call-apps.cjs is what keeps it from being a call.
  assert.ok(parsed.inputs.includes(SOTTO));
  assert.equal(callApp(parsed.inputs), ZOOM);
  assert.equal(callApp([SOTTO]), null);
});

test("an empty or missing store returns no inputs", () => {
  assert.deepEqual(parseMicUsage(store(block(null), block("NonPackaged"))), { inputs: [] });
  assert.deepEqual(parseMicUsage(""), { inputs: [] });
  assert.deepEqual(parseMicUsage("\r\n\r\n"), { inputs: [] });
});

test("malformed output and malformed values never throw and never invent inputs", () => {
  const output = store(
    block(null),
    block(ZOOM_KEY, [
      ["LastUsedTimeStart", "REG_QWORD", START],
      ["LastUsedTimeStop", "REG_QWORD", "0x0"],
    ]),
    "this is not reg.exe output\r\n    LastUsedTimeStop    REG_QWORD\r\n",
    block(SLACK_KEY, [
      // Truncated value: no type, no data.
      ["LastUsedTimeStop"],
    ]),
    block(DISCORD_KEY, [
      ["LastUsedTimeStart", "REG_QWORD", "(value not set)"],
      ["LastUsedTimeStop", "REG_QWORD", "0x0"],
    ]),
    block(TEAMS, [
      ["LastUsedTimeStart", "REG_SZ", "Allow"],
      ["LastUsedTimeStop", "REG_SZ", "Allow"],
    ]),
  );

  assert.deepEqual(parseMicUsage(output), { inputs: [ZOOM] });
  for (const value of [null, undefined, 42, {}, []]) {
    assert.deepEqual(parseMicUsage(value), { inputs: [] });
  }
});

test("CRLF and LF output parse the same", () => {
  const output = store(
    block(null),
    block(ZOOM_KEY, [
      ["LastUsedTimeStart", "REG_QWORD", START],
      ["LastUsedTimeStop", "REG_QWORD", "0x0"],
    ]),
    block(TEAMS, [
      ["LastUsedTimeStart", "REG_QWORD", START],
      ["LastUsedTimeStop", "REG_QWORD", "0x0"],
    ]),
  );

  assert.deepEqual(parseMicUsage(output), { inputs: [ZOOM, TEAMS] });
  assert.deepEqual(parseMicUsage(output.replace(/\r\n/g, "\n")), { inputs: [ZOOM, TEAMS] });
});

test("REG_BINARY and REG_SZ hex timestamps are read like REG_QWORD", () => {
  const output = store(
    block(null),
    block("NonPackaged"),
    block(WEBEX_KEY, [
      ["LastUsedTimeStart", "REG_BINARY", "01DD217E84C2C69A"],
      ["LastUsedTimeStop", "REG_BINARY", "0000000000000000"],
    ]),
    block(TELEGRAM_KEY, [
      ["LastUsedTimeStart", "REG_SZ", START],
      ["LastUsedTimeStop", "REG_SZ", "0x0"],
    ]),
    block(SLACK_KEY, [
      ["LastUsedTimeStart", "REG_BINARY", "01DD217E84C2C69A"],
      ["LastUsedTimeStop", "REG_BINARY", "01DD217E84C2C69B"],
    ]),
  );

  assert.deepEqual(parseMicUsage(output), { inputs: [TELEGRAM, WEBEX] });

  // reg.exe normally prints binary on one line; a wrapped hex line must not lose the value.
  const wrapped = output
    .replace(
      "    LastUsedTimeStart    REG_BINARY    01DD217E84C2C69A",
      "    LastUsedTimeStart    REG_BINARY\r\n    01DD217E84C2C69A",
    )
    .replace(
      "    LastUsedTimeStop    REG_BINARY    0000000000000000",
      "    LastUsedTimeStop    REG_BINARY\r\n    0000000000000000",
    );
  assert.deepEqual(parseMicUsage(wrapped), { inputs: [TELEGRAM, WEBEX] });
});

test("keys outside the microphone store are ignored", () => {
  const output = [
    "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\webcam",
    "    Value    REG_SZ    Allow",
    "",
    `HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\webcam\\${ZOOM_KEY}`,
    `    LastUsedTimeStart    REG_QWORD    ${START}`,
    "    LastUsedTimeStop    REG_QWORD    0x0",
    "",
    `${ROOT}2\\NonPackaged\\C:#Program Files#Zoom#bin#Zoom.exe`,
    `    LastUsedTimeStart    REG_QWORD    ${START}`,
    "    LastUsedTimeStop    REG_QWORD    0x0",
    "",
    `HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged\\C:#Program Files#Zoom#bin#Zoom.exe`,
    `    LastUsedTimeStart    REG_QWORD    ${START}`,
    "    LastUsedTimeStop    REG_QWORD    0x0",
    "",
    ROOT,
    `    LastUsedTimeStart    REG_QWORD    ${START}`,
    "    LastUsedTimeStop    REG_QWORD    0x0",
    "",
  ].join("\r\n");

  assert.deepEqual(parseMicUsage(output), { inputs: [] });
});

test("results are sorted and deduplicated", () => {
  const output = store(
    block(null),
    block(ZOOM_KEY, [
      ["LastUsedTimeStart", "REG_QWORD", START],
      ["LastUsedTimeStop", "REG_QWORD", "0x0"],
    ]),
    block(TEAMS, [
      ["LastUsedTimeStart", "REG_QWORD", START],
      ["LastUsedTimeStop", "REG_QWORD", "0x0"],
    ]),
    block(ZOOM_KEY, [
      ["LastUsedTimeStart", "REG_QWORD", START],
      ["LastUsedTimeStop", "REG_QWORD", "0x0"],
    ]),
  );

  assert.deepEqual(parseMicUsage(output), { inputs: [ZOOM, TEAMS] });
});
