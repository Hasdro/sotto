// Owner console Setup Guide controller (L2)
(function () {
  const root = document.getElementById("owner-setup-steps");
  async function load() {
    if (!root) return;
    try {
      const res = await fetch("/api/v1/owner/setup");
      if (!res.ok) return;
      const data = await res.json();
      root.innerHTML = (data.steps || [])
        .map(
          (s) =>
            `<section class="card">
              <div class="row"><strong>${s.title}</strong><span>${s.status}</span></div>
              <p>${s.what_it_does}</p>
              <p class="muted">Recommended default: ${s.recommended_default}</p>
              <div class="row">
                <button class="btn" data-test="${s.id}">Test it</button>
                ${s.ok ? "" : `<a class="btn primary" href="${s.fix_href}">Fix it</a>`}
              </div>
            </section>`,
        )
        .join("");
    } catch {
      root.textContent = "Could not load setup steps.";
    }
  }
  void load();
})();
