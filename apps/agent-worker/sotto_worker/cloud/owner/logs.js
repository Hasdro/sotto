// Owner console UI controller for Call Logs to GitHub (L3, L4, D-095)
(() => {
  const statusEl = document.getElementById("logs-repo-status");
  const listEl = document.getElementById("logs-company-list");
  const form = document.getElementById("logs-repo-form");

  async function refresh() {
    if (!listEl) return;
    try {
      const res = await fetch("/api/v1/owner/logs");
      if (!res.ok) return;
      const data = await res.json();
      if (statusEl) {
        statusEl.textContent = data.configured
          ? `Connected to ${data.repo}`
          : "Not configured yet — enter a private repo and token above.";
      }
      listEl.innerHTML = (data.companies || [])
        .map(
          (c) =>
            `<div class="row"><span>${c.name}</span><label><input type="checkbox" data-company="${c.id}" ${
              c.enabled ? "checked" : ""
            }/> Enabled</label></div>`,
        )
        .join("");
    } catch {
      if (statusEl) statusEl.textContent = "Could not load call-log settings.";
    }
  }

  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const res = await fetch("/api/v1/owner/logs/repo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: fd.get("repo"), token: fd.get("token") }),
    });
    if (statusEl) statusEl.textContent = res.ok ? "Saved." : "Failed to save repository.";
    void refresh();
  });

  void refresh();
})();
