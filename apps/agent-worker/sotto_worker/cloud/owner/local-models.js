// Owner console JS controller for Local & Offline Models (L6, D-095, D-096)
(() => {
  const listEl = document.getElementById("local-models-list");
  const statusEl = document.getElementById("local-models-status");
  const usersEl = document.getElementById("local-models-users");
  const companySel = document.getElementById("lmUserCompany");
  const userForm = document.getElementById("lm-user-form");

  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid !== null && kid !== undefined) el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
  }

  async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
    return data;
  }

  function policyCheckbox(c, field, labelText) {
    const cb = h("input", {
      type: "checkbox",
      checked: Boolean(c[field]),
      "aria-label": `${labelText} for ${c.name}`,
      onchange: async () => {
        try {
          await api("/api/owner/local-models/company", {
            method: "POST",
            body: { company_id: c.id, [field]: cb.checked },
          });
          if (statusEl) statusEl.textContent = `Updated ${c.name}.`;
        } catch (err) {
          cb.checked = !cb.checked;
          if (statusEl) statusEl.textContent = err.message;
        }
      },
    });
    return h("label", {}, cb, ` ${labelText}`);
  }

  async function refresh() {
    if (!listEl) return;
    try {
      const data = await api("/api/owner/local-models");
      const rows = (data.companies || []).map((c) =>
        h(
          "div",
          { class: "row" },
          h("strong", {}, c.name),
          policyCheckbox(c, "text_enabled", "Text"),
          policyCheckbox(c, "voice_enabled", "Voice"),
          policyCheckbox(c, "allow_cloud_backup", "Allow cloud backup"),
        ),
      );
      listEl.replaceChildren(
        ...(rows.length ? rows : [h("p", { class: "note" }, "No companies yet.")]),
      );

      if (companySel) {
        const prev = companySel.value;
        companySel.replaceChildren(
          ...(data.companies || []).map((c) => h("option", { value: c.id }, c.name)),
        );
        if (prev) companySel.value = prev;
      }

      if (usersEl) {
        const uRows = (data.user_overrides || []).map((u) =>
          h(
            "div",
            { class: "row" },
            h("span", {}, `${u.company_id} / ${u.user_id} (${u.feature_id})`),
            h("span", {}, u.enabled ? "Forced ON" : "Forced OFF"),
          ),
        );
        usersEl.replaceChildren(...uRows);
      }
    } catch {
      if (statusEl) statusEl.textContent = "Could not load local-model policies.";
    }
  }

  userForm?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(userForm);
    const mode = String(fd.get("mode") || "inherit");
    const enabled = mode === "inherit" ? null : mode === "on";
    try {
      await api("/api/owner/local-models/user", {
        method: "POST",
        body: {
          company_id: String(fd.get("company_id") || ""),
          user_id: String(fd.get("user_id") || ""),
          feature_id: String(fd.get("feature_id") || "local_models_text"),
          enabled,
        },
      });
      if (statusEl) statusEl.textContent = "User override updated.";
      void refresh();
    } catch (err) {
      if (statusEl) statusEl.textContent = err.message;
    }
  });

  void refresh();
})();
