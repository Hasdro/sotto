const status = document.getElementById("status");
document.getElementById("allow").addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    status.textContent = "Done. You can close this tab and open Sotto from the toolbar.";
  } catch {
    status.textContent =
      "Chrome blocked the microphone. Allow it in the address bar, then try again.";
  }
});
