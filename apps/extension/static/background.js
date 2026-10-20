// Sotto Chrome extension (D-022): the toolbar button opens the side panel. On install, a tab asks
// once for the microphone, because Chrome cannot show that prompt inside a side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") chrome.tabs.create({ url: "microphone.html" });
});
