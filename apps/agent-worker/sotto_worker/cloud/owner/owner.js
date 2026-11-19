// AGN Sales Shield owner console (D-022). Plain JS, no build step, served with a strict CSP (no inline code).

const $ = (s, el = document) => el.querySelector(s);
const DAY = 86400000;
let companies = [];

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat())
    if (kid !== null && kid !== undefined) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}
const fmtNum = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString());
const fmtDate = (t) =>
  t
    ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "—";
const fmtWhen = (t) => {
  if (!t) return "never";
  const d = Date.now() - t;
  if (d < 60000) return "just now";
  if (d < 3600000) return `${Math.round(d / 60000)} min ago`;
  if (d < DAY) return `${Math.round(d / 3600000)} h ago`;
  return `${Math.round(d / DAY)} days ago`;
};
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2800);
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/owner/login") {
    showLogin();
    throw new Error("signed out");
  }
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

function showLogin() {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#email").focus();
}

async function start() {
  try {
    const me = await api("/api/owner/me");
    $("#whoEmail").textContent = me.email;
    $("#login").hidden = true;
    $("#app").hidden = false;
    for (const b of document.querySelectorAll(".tabs button"))
      b.hidden = me.must_change && b.dataset.view !== "account";
    if (me.must_change) {
      show("account");
      $("#pwMsg").textContent = "First sign-in: choose your own password to open the console.";
    } else {
      show("overview");
      // Round 3 (D-091): the admin tour plays once, unless dismissed.
      if (localStorage.getItem("sotto.adminTourDone") !== "1") setTimeout(openTour, 600);
    }
  } catch {
    /* showLogin already ran */
  }
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#loginError").textContent = "";
  try {
    await api("/api/owner/login", {
      method: "POST",
      body: { email: $("#email").value, password: $("#password").value },
    });
    $("#password").value = "";
    start();
  } catch (err) {
    $("#loginError").textContent = err.message;
  }
});
$("#logout").addEventListener("click", async () => {
  await api("/api/owner/logout", { method: "POST", body: {} }).catch(() => {});
  showLogin();
});

for (const b of document.querySelectorAll(".tabs button"))
  b.addEventListener("click", () => show(b.dataset.view));
function show(view) {
  for (const b of document.querySelectorAll(".tabs button")) {
    if (b.dataset.view === view) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  for (const s of document.querySelectorAll(".view")) s.hidden = s.id !== `v-${view}`;
  ({
    overview: loadOverview,
    companies: loadCompanies,
    features: loadFeatures,
    audit: loadAudit,
    bugs: loadBugReports,
    // T-079 views live in platform.js (loaded after this file).
    providers: () => window.platformViews.providers(),
    routing: () => window.platformViews.routing(),
    routingjob: () => window.platformViews.routingjob(),
    spend: () => window.platformViews.spend(),
    prompts: () => window.platformViews.prompts(),
    health: () => window.platformViews.health(),
    zoho: () => window.platformViews.zoho(),
    signups: () => window.platformViews.signups(),
    account: () => {
      loadZoho();
      loadSmtp();
      loadGithub();
    },
  })[view]();
}

// --- overview ------------------------------------------------------------------------------
async function loadOverview() {
  const s = await api("/api/owner/stats");
  const k = $("#kpis");
  k.replaceChildren(
    kpi(
      "Companies",
      s.companies,
      `${s.by_status.trial || 0} on trial · ${s.by_status.active || 0} paying`,
    ),
    kpi("Users", s.users, `${s.active_today} active today`),
    kpi("Devices", s.devices, "signed in, not revoked"),
    kpi(
      "Calls this month",
      s.month.calls,
      `${fmtNum(s.month.minutes)} minute${s.month.minutes === 1 ? "" : "s"}`,
    ),
    kpi("Cards this month", s.month.cards, `${fmtNum(s.month.holding_lines)} holding lines`),
    kpi(
      "Speed (p95, 30 days)",
      s.p95_ms_30d === null ? "—" : `${fmtNum(s.p95_ms_30d)} ms`,
      "limit 1,500 ms",
    ),
    kpi("Unanswered questions", s.month.escalations, "this month"),
  );
  drawChart($("#chart"), s.daily, s.now);
  bars($("#statusBars"), s.by_status, { trial: "", active: "", expired: "warn", suspended: "bad" });
  bars($("#platformBars"), s.platforms, {});
  const tl = $("#trials");
  tl.replaceChildren(
    s.trials_ending.length
      ? h(
          "table",
          {},
          h(
            "tbody",
            {},
            s.trials_ending.map((c) =>
              h(
                "tr",
                { onclick: () => openCompany(c.id) },
                h("td", {}, c.name, h("span", { class: "meta" }, c.admin_email || "")),
                h("td", {}, `${c.days_left} day(s) left`),
                h("td", {}, `${c.minutes_used} / ${c.minutes_month} min`),
              ),
            ),
          ),
        )
      : h("p", { class: "empty" }, "No trials end in the next 3 days."),
  );
}
function kpi(label, value, sub) {
  return h(
    "div",
    { class: "kpi" },
    h("div", { class: "label" }, label),
    h("div", { class: "value" }, typeof value === "number" ? fmtNum(value) : value),
    h("div", { class: "sub" }, sub),
  );
}
function bars(el, counts, tone) {
  const entries = Object.entries(counts);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  el.replaceChildren(
    ...(entries.length
      ? entries.map(([name, n]) => {
          const fill = h("div", { class: `fill ${tone[name] || ""}` });
          fill.style.width = `${(100 * n) / max}%`;
          return h(
            "div",
            { class: "barrow" },
            h("span", {}, name),
            h("div", { class: "track" }, fill),
            h("span", { class: "num" }, n),
          );
        })
      : [h("p", { class: "empty" }, "Nothing yet.")]),
  );
}
function drawChart(el, daily, now) {
  const NS = "http://www.w3.org/2000/svg";
  const W = 640,
    H = 220,
    L = 34,
    R = 34,
    T = 14,
    B = 26;
  const today = Math.floor(now / DAY);
  const days = Array.from({ length: 30 }, (_, i) => today - 29 + i);
  const byDay = Object.fromEntries(daily.map((d) => [Math.floor(d.day / DAY), d]));
  const calls = days.map((d) => byDay[d]?.calls || 0);
  const mins = days.map((d) => byDay[d]?.minutes || 0);
  // Axis tops are multiples of 4, so the four grid steps are whole numbers.
  const maxC = Math.ceil(Math.max(4, ...calls) / 4) * 4;
  const maxM = Math.ceil(Math.max(8, ...mins) / 4) * 4;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `Calls per day for the last 30 days; total ${calls.reduce((a, b) => a + b, 0)} calls`,
  );
  const add = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    svg.append(e);
    return e;
  };
  const x = (i) => L + ((W - L - R) * i) / days.length;
  const bw = ((W - L - R) / days.length) * 0.7;
  const y = (v) => T + (H - T - B) * (1 - v / maxC);
  const ym = (v) => T + (H - T - B) * (1 - v / maxM);
  for (let g = 0; g <= 4; g++) {
    const v = Math.round((maxC * g) / 4);
    add("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "grid" });
    add("text", { x: L - 6, y: y(v) + 3, "text-anchor": "end", class: "axis" }, v);
    add(
      "text",
      { x: W - R + 6, y: ym((maxM * g) / 4) + 3, class: "axis" },
      Math.round((maxM * g) / 4),
    );
  }
  calls.forEach((c, i) => {
    if (c > 0)
      add("rect", { x: x(i) + 1, y: y(c), width: bw, height: H - B - y(c), rx: 2, class: "bar" });
  });
  add("path", {
    d: mins.map((m, i) => `${i ? "L" : "M"}${x(i) + bw / 2 + 1},${ym(m)}`).join(" "),
    class: "line",
  });
  for (const i of [0, 10, 20, 29]) {
    add(
      "text",
      { x: x(i) + bw / 2, y: H - 8, "text-anchor": "middle", class: "axis" },
      new Date(days[i] * DAY).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    );
  }
  add("text", { x: L, y: 10, class: "legend" }, "■ calls (left)   — minutes (right)");
  el.replaceChildren(svg);
}

// --- companies -----------------------------------------------------------------------------
async function loadCompanies() {
  companies = (await api("/api/owner/companies")).companies;
  renderCompanies();
}
$("#search").addEventListener("input", renderCompanies);
$("#statusFilter").addEventListener("change", renderCompanies);
function renderCompanies() {
  const q = $("#search").value.trim().toLowerCase();
  const st = $("#statusFilter").value;
  const rows = companies.filter(
    (c) =>
      (!st || c.status === st) &&
      (!q || c.name.toLowerCase().includes(q) || (c.admin_email || "").includes(q)),
  );
  $("#companies tbody").replaceChildren(
    ...(rows.length
      ? rows.map((c) => {
          const pct = Math.min(100, (100 * c.minutes_used) / Math.max(1, c.minutes_month));
          const fill = h("div", { class: `fill ${pct > 90 ? "bad" : pct > 70 ? "warn" : ""}` });
          fill.style.width = `${pct}%`;
          return h(
            "tr",
            {
              tabindex: 0,
              onclick: () => openCompany(c.id),
              onkeydown: (e) => e.key === "Enter" && openCompany(c.id),
            },
            h("td", {}, h("b", {}, c.name), h("span", { class: "meta" }, c.admin_email || "")),
            h(
              "td",
              {},
              h("span", { class: `pill ${c.status}` }, c.status),
              h(
                "span",
                { class: "meta" },
                `${c.plan}${c.days_left !== null ? ` · ${c.days_left} d left` : ""}`,
              ),
            ),
            h("td", {}, `${c.seats_used} / ${c.seats}`),
            h(
              "td",
              {},
              h(
                "div",
                { class: "minibar" },
                h("div", { class: "track" }, fill),
                h("span", {}, `${fmtNum(c.minutes_used)} / ${fmtNum(c.minutes_month)}`),
              ),
            ),
            h("td", { class: "num" }, fmtNum(c.calls_30d)),
            h("td", { class: "num" }, c.p95_avg_ms === null ? "—" : `${fmtNum(c.p95_avg_ms)} ms`),
            h("td", {}, fmtWhen(c.last_active)),
          );
        })
      : [
          h(
            "tr",
            {},
            h(
              "td",
              { colspan: 7, class: "empty" },
              companies.length
                ? "No company matches."
                : "No companies yet. Companies appear when someone signs up in the app, or press New company.",
            ),
          ),
        ]),
  );
}

// Round 2 (D-078): a company opens as its own page, in a new tab, where the vendor does
// Gallabox, email per user and the other per-company work. Same origin, same sign-in.
function openCompany(id) {
  window.open(`/owner/company.html?id=${encodeURIComponent(id)}`, "_blank", "noopener");
}

function showSecret(title, value) {
  $("#sTitle").textContent = title;
  $("#sValue").textContent = value;
  $("#secretDialog").showModal();
}
$("#sDone").addEventListener("click", () => {
  $("#sValue").textContent = "";
  $("#secretDialog").close();
});
$("#sCopy").addEventListener("click", () =>
  navigator.clipboard?.writeText($("#sValue").textContent).then(
    () => toast("Copied"),
    () => toast("Select the text and copy it"),
  ),
);

$("#newCompany").addEventListener("click", () => {
  $("#newForm").reset();
  $("#nMsg").textContent = "";
  $("#newDialog").showModal();
});
$("#nCancel").addEventListener("click", () => $("#newDialog").close());
$("#newForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const r = await api("/api/owner/companies", {
      method: "POST",
      body: {
        name: $("#nName").value,
        admin_name: $("#nAdmin").value,
        admin_email: $("#nEmail").value,
        plan: $("#nPlan").value,
      },
    });
    $("#newDialog").close();
    loadCompanies();
    showSecret(`Admin password for ${$("#nEmail").value}`, r.temporary_password);
  } catch (err) {
    $("#nMsg").textContent = err.message;
  }
});

// --- features: entitlement matrix and kill switch (D-028) --------------------------------------
const FEATURE_NAMES = {
  call_review: "Call review",
  follow_up: "Follow-up email",
  recordings: "Recordings",
  reports: "Reports",
  ai_knowledge: "AI knowledge",
  integrations: "Integrations",
  zoho: "Zoho CRM",
  gallabox: "Gallabox",
  email_send: "Send email",
  whatsapp: "WhatsApp",
  prep: "Call prep",
  card_ratings: "Card ratings",
  learned_instructions: "Learned instructions",
};
const featureName = (id) => FEATURE_NAMES[id] || id;

async function loadFeatures() {
  renderFeatures(await api("/api/owner/features"));
}
function renderFeatures(data) {
  $("#kills tbody").replaceChildren(
    ...data.features.map((f) =>
      h(
        "tr",
        {},
        h("th", { scope: "row" }, featureName(f.id)),
        h(
          "td",
          {},
          f.killed_at
            ? h("span", { class: "status bad" }, `Killed since ${fmtDate(f.killed_at)}`)
            : h("span", { class: "status ok" }, "Live"),
          f.built ? null : h("small", { class: "kill-note" }, " Not released yet"),
        ),
        h(
          "td",
          { class: "act" },
          h(
            "button",
            {
              type: "button",
              class: f.killed_at ? "ghost" : "danger",
              "data-feature": f.id,
              onclick: () => setKill(f, !f.killed_at),
            },
            f.killed_at ? "Turn back on" : "Turn off for everyone",
          ),
        ),
      ),
    ),
  );
  $("#matrix thead").replaceChildren(
    h(
      "tr",
      {},
      h("th", { scope: "col" }, "Company"),
      data.features.map((f) => h("th", { scope: "col", class: "center" }, featureName(f.id))),
    ),
  );
  $("#matrix tbody").replaceChildren(
    ...(data.companies.length
      ? data.companies.map((c) =>
          h(
            "tr",
            {},
            h("th", { scope: "row" }, c.name),
            data.features.map((f) =>
              h(
                "td",
                { class: "center" },
                h("input", {
                  type: "checkbox",
                  checked: c.entitled[f.id],
                  "aria-label": `${featureName(f.id)} for ${c.name}`,
                  onchange: (e) => setEntitled(c, f.id, e.target),
                }),
              ),
            ),
          ),
        )
      : [
          h(
            "tr",
            {},
            h("td", { colspan: data.features.length + 1, class: "empty" }, "No companies yet."),
          ),
        ]),
  );
}
function confirmKill(f) {
  return new Promise((resolve) => {
    const dlg = $("#killDialog");
    $("#kBody").textContent =
      `${featureName(f.id)} stops working for every company. Apps follow within 10 minutes. You can turn it back on at any time.`;
    const done = (yes) => {
      dlg.close();
      resolve(yes);
    };
    $("#kCancel").onclick = () => done(false);
    $("#kConfirm").onclick = () => done(true);
    dlg.oncancel = () => resolve(false);
    dlg.showModal();
  });
}
async function setKill(f, killed) {
  if (killed && !(await confirmKill(f))) return;
  try {
    renderFeatures(
      await api(`/api/owner/features/${f.id}/kill`, { method: "PUT", body: { killed } }),
    );
    toast(killed ? `${featureName(f.id)} is off everywhere` : `${featureName(f.id)} is back on`);
  } catch (err) {
    toast(err.message);
  }
}
async function setEntitled(c, feature, box) {
  try {
    renderFeatures(
      await api(`/api/owner/companies/${c.id}/features`, {
        method: "PATCH",
        body: { [feature]: box.checked },
      }),
    );
    toast(`${featureName(feature)} ${box.checked ? "included for" : "removed from"} ${c.name}`);
  } catch (err) {
    box.checked = !box.checked;
    toast(err.message);
  }
}

// --- audit and account ---------------------------------------------------------------------
async function loadAudit() {
  const { items } = await api("/api/owner/audit");
  $("#audit tbody").replaceChildren(
    ...(items.length
      ? items.map((a) =>
          h(
            "tr",
            {},
            h("td", {}, new Date(a.at).toLocaleString()),
            h("td", {}, a.company || "—"),
            h("td", {}, a.actor || "—"),
            h("td", {}, a.action),
            h("td", {}, a.detail),
            h("td", {}, a.ip),
          ),
        )
      : [h("tr", {}, h("td", { colspan: 6, class: "empty" }, "Nothing logged yet."))]),
  );
}
$("#pwForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/owner/password", {
      method: "POST",
      body: { current: $("#pwCur").value, new: $("#pwNew").value },
    });
    $("#pwMsg").textContent = "Password changed.";
    $("#pwForm").reset();
    start();
  } catch (err) {
    $("#pwMsg").textContent = err.message;
  }
});

// --- Zoho platform client (D-031): write-only; the server never sends the ID or secret back ---
function zohoState(c) {
  $("#zohoState").textContent = c.configured
    ? `Saved (${c.dc}) on ${new Date(c.updated_at).toLocaleString()}. Paste new values to replace it.`
    : "No platform client yet.";
  $("#zohoRemove").hidden = !c.configured;
}
async function loadZoho() {
  try {
    zohoState(await api("/api/owner/zoho"));
  } catch (err) {
    $("#zohoState").textContent = err.message;
  }
}
$("#zohoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    zohoState(
      await api("/api/owner/zoho", {
        method: "PUT",
        body: {
          client_id: $("#zohoId").value,
          client_secret: $("#zohoSecret").value,
          dc: $("#zohoDc").value,
        },
      }),
    );
    $("#zohoForm").reset();
    $("#zohoMsg").textContent = "Saved.";
  } catch (err) {
    $("#zohoMsg").textContent = err.message;
  }
});
$("#zohoRemove").addEventListener("click", async () => {
  if (!confirm("Remove the platform Zoho client? People who use it will have to reconnect."))
    return;
  try {
    zohoState(await api("/api/owner/zoho", { method: "DELETE" }));
    $("#zohoMsg").textContent = "Removed.";
  } catch (err) {
    $("#zohoMsg").textContent = err.message;
  }
});

// --- platform SMTP (D-039): write-only; the server never sends the username or password back --
function smtpState(c) {
  $("#smtpState").textContent = c.configured
    ? `Saved: ${c.host}:${c.port}, from ${c.from_name} <${c.from_address}>, on ${new Date(c.updated_at).toLocaleString()}.`
    : "No platform mailbox yet.";
  if (c.configured) {
    $("#smtpHost").value = c.host;
    $("#smtpPort").value = String(c.port);
    $("#smtpFromName").value = c.from_name;
    $("#smtpFrom").value = c.from_address;
  }
  $("#smtpRemove").hidden = !c.configured;
  $("#smtpTest").hidden = !c.configured;
}
async function loadSmtp() {
  try {
    smtpState(await api("/api/owner/smtp"));
  } catch (err) {
    $("#smtpState").textContent = err.message;
  }
}
$("#smtpForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    smtpState(
      await api("/api/owner/smtp", {
        method: "PUT",
        body: {
          host: $("#smtpHost").value,
          port: Number($("#smtpPort").value),
          username: $("#smtpUser").value,
          password: $("#smtpPass").value,
          from_name: $("#smtpFromName").value,
          from_address: $("#smtpFrom").value,
        },
      }),
    );
    $("#smtpUser").value = "";
    $("#smtpPass").value = "";
    $("#smtpMsg").textContent = "Saved.";
  } catch (err) {
    $("#smtpMsg").textContent = err.message;
  }
});
$("#smtpTest").addEventListener("click", async () => {
  $("#smtpMsg").textContent = "Sending…";
  try {
    const r = await api("/api/owner/smtp/test", { method: "POST", body: {} });
    $("#smtpMsg").textContent = r.ok
      ? `Test email sent to ${r.to}.`
      : `The mail server said: ${r.error}`;
  } catch (err) {
    $("#smtpMsg").textContent = err.message;
  }
});
$("#smtpRemove").addEventListener("click", async () => {
  if (!confirm("Remove the platform mailbox? Organisations without their own cannot send email."))
    return;
  try {
    smtpState(await api("/api/owner/smtp", { method: "DELETE" }));
    $("#smtpMsg").textContent = "Removed.";
  } catch (err) {
    $("#smtpMsg").textContent = err.message;
  }
});

// --- GitHub issues (D-085): write-only token; the server never sends it back ----------------
let githubReady = null; // {configured, repo} from GET /api/owner/github, or null while unknown
function githubState(c) {
  githubReady = c;
  $("#githubState").textContent = c.configured
    ? `Saved · repo ${c.repo} · on ${new Date(c.updated_at).toLocaleString()}. Paste a new token to replace it.`
    : "No GitHub repo set yet.";
  if (c.configured && c.repo) $("#githubRepo").value = c.repo;
  $("#githubRemove").hidden = !c.configured;
  $("#githubTest").hidden = !c.configured;
}
async function loadGithub() {
  try {
    githubState(await api("/api/owner/github"));
  } catch (err) {
    $("#githubState").textContent = err.message;
  }
}
$("#githubForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    githubState(
      await api("/api/owner/github", {
        method: "PUT",
        body: { repo: $("#githubRepo").value.trim(), token: $("#githubToken").value },
      }),
    );
    $("#githubToken").value = "";
    $("#githubMsg").textContent = "Saved.";
  } catch (err) {
    $("#githubMsg").textContent = err.message;
  }
});
$("#githubTest").addEventListener("click", async () => {
  $("#githubMsg").textContent = "Testing…";
  try {
    const r = await api("/api/owner/github/test", { method: "POST", body: {} });
    $("#githubMsg").textContent = r.ok ? `Works: ${r.detail}` : `Failed: ${r.detail}`;
  } catch (err) {
    $("#githubMsg").textContent = err.message;
  }
});
$("#githubRemove").addEventListener("click", async () => {
  if (!confirm("Remove the GitHub repo and token? Issue reporting stops working.")) return;
  try {
    githubState(await api("/api/owner/github", { method: "DELETE" }));
    $("#githubMsg").textContent = "Removed.";
  } catch (err) {
    $("#githubMsg").textContent = err.message;
  }
});

// --- GitHub issue reporting (D-085): one icon button in every page head ----------------------
let issueShotUrl = null;
function pageAddress() {
  const base = location.href.split("#")[0];
  const current = document.querySelector(".tabs button[aria-current='page']");
  const view = current ? current.dataset.view : null;
  return view ? `${base}#v-${view}` : base;
}
function bugIcon() {
  // Stroke bug icon, same style as the sidebar icons (fill none, stroke currentColor).
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "ico");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML =
    '<ellipse cx="12" cy="14" rx="5" ry="6"/><path d="M12 8V5M9 5.5 7 3.5M15 5.5 17 3.5M7 12H3.5M7 16H3.5M17 12h3.5M17 16h3.5M10 14h4"/>';
  return svg;
}
function addIssueButtons() {
  for (const head of document.querySelectorAll(".page-head")) {
    if (head.querySelector(".issue-btn")) continue;
    const wrap = h("div", { class: "page-head-text" });
    while (head.firstChild) wrap.append(head.firstChild);
    const btn = h(
      "button",
      {
        type: "button",
        class: "ss-icon-btn issue-btn",
        "aria-label": "Report an issue on GitHub",
        title: "Report an issue on GitHub",
        onclick: openIssueDialog,
      },
      bugIcon(),
    );
    head.append(wrap, btn);
  }
}
async function openIssueDialog() {
  $("#issueAddr").value = pageAddress();
  $("#issueTitleInput").value = "";
  $("#issueDesc").value = "";
  $("#issueShot").value = "";
  $("#issueShotState").textContent = "";
  $("#issueMsg").textContent = "";
  issueShotUrl = null;
  if (githubReady === null) {
    try {
      githubReady = await api("/api/owner/github");
    } catch {
      githubReady = { configured: false };
    }
  }
  $("#issueSubmit").disabled = !githubReady.configured;
  $("#issueMsg").textContent = githubReady.configured
    ? ""
    : "GitHub is not set up yet — add the repo and token in Account › GitHub issues.";
  $("#issueDialog").showModal();
}
$("#issueCancel").addEventListener("click", () => $("#issueDialog").close());
$("#issueShot").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $("#issueShotState").textContent = "Uploading…";
  try {
    const res = await fetch("/api/v1/issue-attachments", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": file.type },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `upload failed (${res.status})`);
    issueShotUrl = data.url;
    $("#issueShotState").textContent = "Screenshot attached.";
  } catch (err) {
    issueShotUrl = null;
    $("#issueShotState").textContent = err.message;
  }
});
$("#issueSubmit").addEventListener("click", async () => {
  const title = $("#issueTitleInput").value.trim();
  const body = $("#issueDesc").value.trim();
  if (!title) {
    $("#issueMsg").textContent = "Add a one-line summary first.";
    return;
  }
  $("#issueMsg").textContent = "Sending…";
  try {
    const r = await api("/api/owner/github/issues", {
      method: "POST",
      body: {
        title,
        body,
        page_url: $("#issueAddr").value,
        ...(issueShotUrl ? { screenshot_url: issueShotUrl } : {}),
      },
    });
    $("#issueMsg").textContent = `Created: ${r.issue_url}`;
    toast("Issue created on GitHub");
    setTimeout(() => $("#issueDialog").close(), 1200);
  } catch (err) {
    $("#issueMsg").textContent = err.message;
  }
});
addIssueButtons();

// --- bug reports (D-086): review queue -------------------------------------------------------
let bugReports = [];
async function loadBugReports() {
  const q = $("#bugFilter").value;
  const data = await api(`/api/owner/bug-reports${q ? `?status=${encodeURIComponent(q)}` : ""}`);
  bugReports = data.reports;
  renderBugs();
}
$("#bugFilter").addEventListener("change", loadBugReports);
function bugStatusPill(s) {
  return h(
    "span",
    {
      class: `pill ${s === "submitted" ? "active" : s === "closed" ? "expired" : s === "reviewed" ? "trial" : ""}`,
    },
    s,
  );
}
function renderBugs() {
  $("#bugCount").textContent = `${bugReports.length} report${bugReports.length === 1 ? "" : "s"}`;
  $("#bugs tbody").replaceChildren(
    ...(bugReports.length
      ? bugReports.map((r) => bugRow(r))
      : [h("tr", {}, h("td", { colspan: 6, class: "empty" }, "No bug reports yet."))]),
  );
}
function bugRow(r) {
  const titleCell = h(
    "td",
    {},
    h("b", {}, r.title),
    r.description ? h("span", { class: "meta" }, r.description) : null,
    r.page_url
      ? h(
          "span",
          { class: "meta" },
          h("a", { href: r.page_url, target: "_blank", rel: "noopener noreferrer" }, "page"),
        )
      : null,
    r.screenshot_url
      ? h(
          "span",
          { class: "meta" },
          h(
            "a",
            { href: r.screenshot_url, target: "_blank", rel: "noopener noreferrer" },
            "screenshot",
          ),
        )
      : null,
  );
  const statusCell = h("td", {}, bugStatusPill(r.status));
  const issueCell = h(
    "td",
    {},
    r.github_issue_url
      ? h(
          "a",
          { href: r.github_issue_url, target: "_blank", rel: "noopener noreferrer" },
          `#${r.github_issue_url.split("/").pop()}`,
        )
      : "—",
  );
  const actions = h("td", { class: "act" });
  const editBtn = h("button", { type: "button", class: "ghost" }, "Edit");
  editBtn.onclick = () => editBugRow(r, titleCell, statusCell, actions);
  const submitBtn = h(
    "button",
    { type: "button", class: "primary", disabled: r.status === "submitted" },
    "Submit to GitHub",
  );
  submitBtn.onclick = async () => {
    try {
      const out = await api(`/api/owner/bug-reports/${r.id}/submit`, { method: "POST", body: {} });
      toast(`Issue created: ${out.issue_url}`);
      loadBugReports();
    } catch (err) {
      toast(err.message);
    }
  };
  actions.append(editBtn, " ", submitBtn);
  return h(
    "tr",
    {},
    h("td", {}, fmtWhen(r.created_at)),
    h("td", {}, r.company_name || r.company_id || "—"),
    titleCell,
    statusCell,
    issueCell,
    actions,
  );
}
function editBugRow(r, titleCell, statusCell, actions) {
  const titleInput = h("input", { value: r.title, "aria-label": "Report title" });
  const descInput = h(
    "textarea",
    { rows: 3, "aria-label": "Report description" },
    r.description || "",
  );
  const statusSel = h(
    "select",
    { "aria-label": "Report status" },
    ["new", "reviewed", "closed"].map((s) =>
      h("option", { value: s, selected: s === r.status }, s),
    ),
  );
  titleCell.replaceChildren(titleInput, descInput);
  statusCell.replaceChildren(statusSel);
  actions.replaceChildren();
  const saveBtn = h("button", { type: "button", class: "primary" }, "Save");
  saveBtn.onclick = async () => {
    try {
      await api(`/api/owner/bug-reports/${r.id}`, {
        method: "PATCH",
        body: {
          title: titleInput.value.trim(),
          description: descInput.value.trim(),
          status: statusSel.value,
        },
      });
      loadBugReports();
      toast("Report updated");
    } catch (err) {
      toast(err.message);
    }
  };
  const cancelBtn = h("button", { type: "button", class: "ghost" }, "Cancel");
  cancelBtn.onclick = () => renderBugs();
  actions.append(saveBtn, " ", cancelBtn);
}

// --- admin tour (D-091) ----------------------------------------------------------------------
// A 5-step overlay. Each step switches to the view it describes, so the tour shows the real
// page behind the dialog (the dialog is docked at the bottom, see owner.css).
const TOUR_STEPS = [
  {
    view: "companies",
    title: "Companies",
    body: "Every company, its plan, seats and minutes. Click a row to open its page as tiles.",
  },
  {
    view: "providers",
    title: "Providers and keys",
    body: "AGN's own model keys. Write-only: after saving, only the date and the last test are shown.",
  },
  {
    view: "routing",
    title: "Model routing",
    body: "Which vendor and model each stage uses for every company. The next call uses a change; no release needed.",
  },
  {
    view: "signups",
    title: "Sign-up queue",
    body: "Trials from the Zoho Forms sign-up. Approve a company before its calls use AGN's providers.",
  },
  {
    view: "account",
    title: "Account",
    body: "Your password, the Zoho client, the platform mailbox — and the GitHub repo where issue reports land.",
  },
];
let tourStep = 0;
function renderTourStep() {
  const step = TOUR_STEPS[tourStep];
  show(step.view);
  $("#tourTitle").textContent = `Take the tour · ${step.title}`;
  $("#tourBody").textContent = step.body;
  $("#tourDots").replaceChildren(
    ...TOUR_STEPS.map((_, i) => h("span", { class: `tour-dot${i === tourStep ? " on" : ""}` })),
  );
  $("#tourBack").disabled = tourStep === 0;
  $("#tourNext").textContent = tourStep === TOUR_STEPS.length - 1 ? "Done" : "Next";
}
function openTour() {
  tourStep = 0;
  $("#tourNever").checked = false;
  renderTourStep();
  $("#tourDialog").showModal();
}
function closeTour() {
  if ($("#tourNever").checked) localStorage.setItem("sotto.adminTourDone", "1");
  $("#tourDialog").close();
}
$("#tourBtn").addEventListener("click", openTour);
$("#tourSkip").addEventListener("click", closeTour);
$("#tourBack").addEventListener("click", () => {
  if (tourStep > 0) {
    tourStep -= 1;
    renderTourStep();
  }
});
$("#tourNext").addEventListener("click", () => {
  if (tourStep === TOUR_STEPS.length - 1) closeTour();
  else {
    tourStep += 1;
    renderTourStep();
  }
});
$("#tourDialog").addEventListener("close", () => {
  if ($("#tourNever").checked) localStorage.setItem("sotto.adminTourDone", "1");
});

start();
