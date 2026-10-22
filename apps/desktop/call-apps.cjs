// Which app is on a call (owner, 21 Oct 2026): the call watcher reports the bundle IDs (macOS)
// or executable paths / package family names (Windows) of the apps using a microphone; a call
// app among them means a call is on. Sotto itself never counts.
// shortcut: matched by name, so a new softphone needs a line here; a setting can list more later.
const CALL_APPS = [
  /zoom/, // us.zoom.xos, Zoom.exe
  /teams/, // com.microsoft.teams2, ms-teams.exe, MSTeams_8wekyb3d8bbwe
  /3cx/, // 3CXPhone.exe
  /yeastar|linkus/, // com.yeastar.linkus, Linkus.exe
  /webex|cisco/, // Cisco Webex, webex.exe
  /facetime/,
  /whatsapp/, // WhatsApp.exe
  /slack/, // Slack.exe
  /skype/, // Skype.exe
  /telegram/, // Telegram.exe
  /discord/, // Discord.exe
  /zoiper|bria|counterpath|microsip|groundwire/,
  // Google Meet and web softphones run in a browser.
  /chrome|safari|webkit|firefox|edgemac|thebrowser|brave|opera|vivaldi/,
  /msedge|microsoftedge|\\edge\.exe$/, // Edge: msedge.exe, MicrosoftEdge.exe, edge.exe
];

// Sotto's own process, on macOS (bundle ID) and Windows (Sotto.exe, Electron's electron.exe
// while developing, or any path inside the install folder such as ...\Sotto\Sotto.exe).
const OWN =
  /^app\.sotto\.desktop|^com\.github\.electron|(?:^|\\)sotto\.exe$|(?:^|\\)electron\.exe$|\\sotto\\/;

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
