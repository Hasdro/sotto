// Owner console UI controller for Call Logs to GitHub (L3, L4, D-095)
(() => {
  const statusEl = document.getElementById("logs-repo-status");
  const listEl = document.getElementById("logs-company-list");
  const userListEl = document.getElementById("logs-user-list");
  const companySel = document.getElementById("logsUserCompany");
  const form = document.getElementById("logs-repo-form");
  const userForm = document.getElementById("logs-user-form");

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

  async function refresh() {
    if (!listEl) return;
    try {
      const data = await api("/api/owner/logs");
      if (statusEl) {
        statusEl.textContent = data.configured
          ? `Connected to ${data.repo}`
          : "Not configured yet — enter a private repo and token above.";
      }
      const rows = (data.companies || []).map((c) => {
        const cb = h("input", {
          type: "checkbox",
          checked: Boolean(c.enabled),
          "aria-label": `Enable call logs for ${c.name}`,
          onchange: async () => {
            try {
              await api("/api/owner/logs/company", {
                method: "POST",
                body: { company_id: c.id, enabled: cb.checked },
              });
              if (statusEl) statusEl.textContent = `Updated ${c.name}.`;
            } catch (err) {
              cb.checked = !cb.checked;
              if (statusEl) statusEl.textContent = err.message;
            }
          },
        });
        return h("div", { class: "row" }, h("span", {}, c.name), h("label", {}, cb, " Enabled"));
      });
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

      if (userListEl) {
        const uRows = (data.user_overrides || []).map((u) =>
          h(
            "div",
            { class: "row" },
            h("span", {}, `${u.company_id} / ${u.user_id}`),
            h("span", {}, u.enabled ? "Forced ON" : "Forced OFF"),
          ),
        );
        userListEl.replaceChildren(...uRows);
      }
    } catch {
      if (statusEl) statusEl.textContent = "Could not load call-log settings.";
    }
  }

  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    try {
      await api("/api/owner/logs/repo", {
        method: "POST",
        body: { repo: String(fd.get("repo") || ""), token: String(fd.get("token") || "") },
      });
      if (statusEl) statusEl.textContent = "Saved.";
      form.reset();
      void refresh();
    } catch (err) {
      if (statusEl) statusEl.textContent = err.message;
    }
  });

  userForm?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(userForm);
    const mode = String(fd.get("mode") || "inherit");
    const enabled = mode === "inherit" ? null : mode === "on";
    try {
      await api("/api/owner/logs/user", {
        method: "POST",
        body: {
          company_id: String(fd.get("company_id") || ""),
          user_id: String(fd.get("user_id") || ""),
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
