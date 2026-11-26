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

  function tdText(text, className) {
    const td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  function checkboxCell(className, checked, ariaLabel) {
    const td = document.createElement("td");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = className;
    input.checked = Boolean(checked);
    input.setAttribute("aria-label", ariaLabel);
    td.appendChild(input);
    return { td, input };
  }

  function renderRow(c) {
    const tr = document.createElement("tr");
    const capVal = c.cap_usd == null ? "" : String(c.cap_usd);
    const estMin = c.cap_minutes == null ? "—" : `${c.cap_minutes} min`;

    tr.appendChild(tdText(c.name || ""));
    const stages = checkboxCell("js-stages", c.stages_configured, "Stages configured");
    tr.appendChild(stages.td);
    const enabled = checkboxCell("js-enabled", c.enabled, "Voice coach enabled");
    tr.appendChild(enabled.td);

    const capTd = document.createElement("td");
    const capInput = document.createElement("input");
    capInput.type = "number";
    capInput.step = "1";
    capInput.min = "0";
    capInput.className = "js-cap";
    capInput.value = capVal;
    capInput.placeholder = "Not set";
    capInput.setAttribute("aria-label", "Monthly cap USD");
    capTd.appendChild(capInput);
    tr.appendChild(capTd);

    const minCell = tdText(estMin, "js-min");
    tr.appendChild(minCell);
    tr.appendChild(
      tdText(
        `$${Number(c.spend_usd || 0).toFixed(2)} (${Number(c.used_minutes || 0).toFixed(1)} min)`,
      ),
    );
    tr.appendChild(tdText(c.reason || ""));

    const btnTd = document.createElement("td");
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn js-save";
    saveBtn.textContent = "Save";
    btnTd.appendChild(saveBtn);
    tr.appendChild(btnTd);

    const cpm = Number(c.cost_per_min_usd || 0.04);
    capInput.addEventListener("input", () => {
      const v = Number(capInput.value);
      minCell.textContent = v > 0 && cpm > 0 ? `${(v / cpm).toFixed(1)} min` : "—";
    });
    saveBtn.addEventListener("click", async () => {
      const rawCap = capInput.value.trim();
      const payload = {
        stages_configured: stages.input.checked,
        enabled: enabled.input.checked,
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

  async function load() {
    try {
      const data = await api("/api/owner/coach/companies");
      rowsEl.replaceChildren();
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
