(() => {
  const statusEl = document.getElementById("coach-status");
  const rowsEl = document.getElementById("coach-rows");

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function renderRow(c) {
    const tr = document.createElement("tr");
    const capVal = c.cap_usd == null ? "" : String(c.cap_usd);
    const estMin = c.cap_minutes == null ? "—" : `${c.cap_minutes} min`;
    tr.innerHTML = `
      <td>${escapeHtml(c.name)}</td>
      <td><input type="checkbox" class="js-stages" ${c.stages_configured ? "checked" : ""} aria-label="Stages configured" /></td>
      <td><input type="checkbox" class="js-enabled" ${c.enabled ? "checked" : ""} aria-label="Voice coach enabled" /></td>
      <td><input type="number" step="1" min="0" class="js-cap" value="${capVal}" placeholder="Not set" aria-label="Monthly cap USD" /></td>
      <td class="js-min">${estMin}</td>
      <td>$${Number(c.spend_usd || 0).toFixed(2)} (${Number(c.used_minutes || 0).toFixed(1)} min)</td>
      <td>${escapeHtml(c.reason)}</td>
      <td><button type="button" class="btn js-save">Save</button></td>
    `;
    const capInput = tr.querySelector(".js-cap");
    const minCell = tr.querySelector(".js-min");
    const cpm = Number(c.cost_per_min_usd || 0.04);
    capInput.addEventListener("input", () => {
      const v = Number(capInput.value);
      minCell.textContent = v > 0 && cpm > 0 ? `${(v / cpm).toFixed(1)} min` : "—";
    });
    tr.querySelector(".js-save").addEventListener("click", async () => {
      const rawCap = capInput.value.trim();
      const payload = {
        stages_configured: tr.querySelector(".js-stages").checked,
        enabled: tr.querySelector(".js-enabled").checked,
        cap_usd: rawCap === "" ? null : Number(rawCap),
      };
      statusEl.textContent = `Saving ${c.name}…`;
      try {
        await api(`/api/owner/coach/companies/${encodeURIComponent(c.id)}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        statusEl.textContent = `Saved ${c.name}.`;
        await load();
      } catch (err) {
        statusEl.textContent = `Save failed: ${err.message}`;
      }
    });
    return tr;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[ch]);
  }

  async function load() {
    try {
      const data = await api("/api/owner/coach/companies");
      rowsEl.innerHTML = "";
      for (const c of data.companies || []) {
        rowsEl.appendChild(renderRow(c));
      }
      statusEl.textContent = `${(data.companies || []).length} companies loaded.`;
    } catch (err) {
      statusEl.textContent = `Could not load voice coach settings: ${err.message}`;
    }
  }

  load();
})();
