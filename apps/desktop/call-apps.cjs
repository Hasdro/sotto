// Which app is on a call (owner, 21 Oct 2026): the call watcher reports the bundle IDs of the
// apps using a microphone; a call app among them means a call is on. Sotto itself never counts.
// shortcut: matched by name, so a new softphone needs a line here; a setting can list more later.
const CALL_APPS = [
  /zoom/, // us.zoom.xos
  /teams/, // com.microsoft.teams2
  /3cx/,
  /yeastar|linkus/,
  /webex|cisco/,
  /facetime/,
  /whatsapp/,
  /slack/,
  /skype/,
  /telegram/,
  /discord/,
  /zoiper|bria|counterpath|microsip|groundwire/,
  // Google Meet and web softphones run in a browser.
  /chrome|safari|webkit|firefox|edgemac|thebrowser|brave|opera|vivaldi/,
];

const OWN = /^app\.sotto\.desktop|^com\.github\.electron/;

/** The first call app using a microphone, or null. */
function callApp(inputs) {
  for (const raw of inputs) {
    const id = String(raw).toLowerCase();
    if (OWN.test(id)) continue;
    if (CALL_APPS.some((re) => re.test(id))) return raw;
  }
  return null;
}

module.exports = { callApp };
