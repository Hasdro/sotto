// Owner console Setup Guide controller (L2)
(() => {
  const root = document.getElementById("owner-setup-steps");

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

  function safeHref(href) {
    const raw = String(href || "");
    return raw.startsWith("/") ? raw : "/owner";
  }

  async function load(verifiedId = null) {
    if (!root) return;
    try {
      const res = await fetch("/api/owner/setup", { credentials: "same-origin" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const cards = (data.steps || []).map((s) => {
        const statusText = verifiedId === s.id ? `${s.status} (verified)` : s.status;
        const testBtn = h(
          "button",
          {
            type: "button",
            class: "ghost",
            onclick: () => void load(s.id),
          },
          "Test it",
        );
        const fixLink = s.ok
          ? null
          : h("a", { class: "button primary", href: safeHref(s.fix_href) }, "Fix it");
        return h(
          "section",
          { class: "panel" },
          h("div", { class: "row" }, h("strong", {}, s.title), h("span", {}, statusText)),
          h("p", {}, s.what_it_does),
          h("p", { class: "note" }, `Recommended default: ${s.recommended_default}`),
          h("div", { class: "row" }, testBtn, fixLink),
        );
      });
      root.replaceChildren(...cards);
    } catch {
      root.textContent = "Could not load setup steps.";
    }
  }

  void load();
})();
