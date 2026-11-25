// Owner console JS controller for Local & Offline Models (L6, D-095, D-096)
(() => {
  const listEl = document.getElementById("local-models-list");
  async function refresh() {
    if (!listEl) return;
    try {
      const res = await fetch("/api/v1/owner/local-models");
      if (!res.ok) return;
      const data = await res.json();
      listEl.innerHTML = (data.companies || [])
        .map(
          (c) =>
            `<div class="row">
              <strong>${c.name}</strong>
              <label><input type="checkbox" data-company="${c.id}" data-field="text_enabled" ${c.text_enabled ? "checked" : ""}/> Text</label>
              <label><input type="checkbox" data-company="${c.id}" data-field="voice_enabled" ${c.voice_enabled ? "checked" : ""}/> Voice</label>
              <label><input type="checkbox" data-company="${c.id}" data-field="allow_cloud_backup" ${c.allow_cloud_backup ? "checked" : ""}/> Allow cloud backup</label>
            </div>`,
        )
        .join("");
    } catch {
      listEl.textContent = "Could not load local-model policies.";
    }
  }
  void refresh();
})();
