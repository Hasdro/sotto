(() => {
  const statusEl = document.getElementById("memoryStatus");
  const listEl = document.getElementById("memoryList");
  const searchEl = document.getElementById("memorySearch");
  let companies = [];

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") node.className = v;
        else node.setAttribute(k, String(v));
      }
    }
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderRules(rules) {
    if (!rules || !rules.length) {
      return el("p", { class: "ss-muted" }, "No rules yet.");
    }
    const ul = el("ul", { class: "memory-rules" });
    for (const r of rules) {
      const li = el("li", { class: r.enabled === false ? "ss-muted" : "" });
      li.textContent = r.enabled === false ? `${r.text} (disabled)` : r.text;
      ul.appendChild(li);
    }
    return ul;
  }

  function render() {
    if (!listEl) return;
    const q = (searchEl && searchEl.value ? searchEl.value : "").trim().toLowerCase();
    listEl.innerHTML = "";
    const filtered = companies.filter((c) => {
      if (!q) return true;
      if (c.name.toLowerCase().includes(q)) return true;
      return (c.agents || []).some(
        (a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q),
      );
    });
    if (!filtered.length) {
      listEl.appendChild(el("p", { class: "ss-muted" }, "No matching companies."));
      return;
    }
    for (const c of filtered) {
      const panel = el("section", { class: "panel", "aria-label": c.name });
      const mode = c.review_before_apply ? "Review before apply" : "Auto-apply";
      panel.appendChild(
        el("h2", null, `${c.name} · ${c.plan} · ${mode} · ${c.pending_total} pending`),
      );
      panel.appendChild(el("h3", null, "Company-wide rules"));
      panel.appendChild(renderRules(c.company_rules));
      panel.appendChild(el("h3", null, "Agents"));
      if (!c.agents || !c.agents.length) {
        panel.appendChild(el("p", { class: "ss-muted" }, "No active agents."));
      } else {
        for (const a of c.agents) {
          const box = el("div", { class: "agent-memory" });
          const label = `${a.name} (${a.email}) · ${a.role}${a.pending_count ? ` · ${a.pending_count} pending` : ""}`;
          box.appendChild(el("strong", null, label));
          box.appendChild(renderRules(a.rules));
          panel.appendChild(box);
        }
      }
      listEl.appendChild(panel);
    }
  }

  async function load() {
    try {
      const res = await fetch("/api/owner/memory", { credentials: "same-origin" });
      if (!res.ok) {
        if (statusEl) statusEl.textContent = `Could not load style memory (HTTP ${res.status}).`;
        return;
      }
      const data = await res.json();
      companies = Array.isArray(data.companies) ? data.companies : [];
      if (statusEl) {
        statusEl.textContent = `Showing ${companies.length} ${companies.length === 1 ? "company" : "companies"} (read-only).`;
      }
      render();
    } catch (_err) {
      if (statusEl) statusEl.textContent = "Could not load style memory.";
    }
  }

  if (searchEl) searchEl.addEventListener("input", render);
  void load();
})();
