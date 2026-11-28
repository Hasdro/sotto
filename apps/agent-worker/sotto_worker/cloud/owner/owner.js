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
function speedTone(p95) {
  if (p95 === null || p95 === undefined) return "";
  if (p95 <= 1500) return "ok";
  if (p95 <= 2500) return "warn";
  return "bad";
}
function renderAttention(data) {
  const el = $("#attention");
  if (!el) return;
  const items = data?.items || [];
  el.replaceChildren(
    items.length
      ? h(
          "ul",
          { class: "attention-list" },
          items.map((item) =>
            h(
              "li",
              { class: `attention-item ${item.severity === "red" ? "bad" : "warn"}` },
              h(
                "div",
                { class: "attention-copy" },
                h(
                  "span",
                  { class: `status ${item.severity === "red" ? "bad" : "warn"}` },
                  item.title,
                ),
                h("span", { class: "meta" }, item.detail),
              ),
              h(
                "button",
                {
                  type: "button",
                  class: item.severity === "red" ? "primary" : "ghost",
                  onclick: () => item.view && show(item.view),
                },
                item.cta_label || "Open",
              ),
            ),
          ),
        )
      : h("p", { class: "empty" }, "Nothing needs attention."),
  );
}
async function loadOverview() {
  const [s, att] = await Promise.all([
    api("/api/owner/stats"),
    api("/api/owner/attention").catch(() => ({ items: [] })),
  ]);
  renderAttention(att);
  const k = $("#kpis");
  const p95Tone = speedTone(s.p95_ms_30d);
  const p95Calls = s.p95_calls_30d ? ` · ${fmtNum(s.p95_calls_30d)} calls` : "";
  const speedTile = kpi(
    "Speed (p95, 30 days)",
    s.p95_ms_30d === null ? "—" : `${fmtNum(s.p95_ms_30d)} ms`,
    `limit 1,500 ms${p95Calls}`,
    p95Tone,
    () => show("routing"),
  );
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
    speedTile,
    kpi("Unanswered questions", s.month.escalations, "this month"),
  );
  const stamp = $("#kpiStamp");
  if (stamp) {
    const at = s.computed_at || s.now;
    stamp.textContent = at
      ? `Snapshot updated ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · 30-day chart total: ${fmtNum(s.calls_30d ?? 0)} calls`
      : "";
  }
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
function kpi(label, value, sub, tone = "", onclick = null) {
  return h(
    "div",
    {
      class: `kpi${tone ? ` ${tone}` : ""}${onclick ? " clickable" : ""}`,
      ...(onclick
        ? {
            role: "button",
            tabindex: 0,
            onclick,
            onkeydown: (e) => (e.key === "Enter" || e.key === " ") && onclick(),
          }
        : {}),
    },
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
            (() => {
              const p95 = c.p95_ms_30d !== undefined ? c.p95_ms_30d : c.p95_avg_ms;
              const tone = speedTone(p95);
              return h(
                "td",
                { class: "num" },
                p95 === null
                  ? "—"
                  : h("span", { class: tone ? `status ${tone}` : "" }, `${fmtNum(p95)} ms`),
              );
            })(),
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
  const rawCap = $("#nCap")?.value?.trim() || "";
  try {
    const r = await api("/api/owner/companies", {
      method: "POST",
      body: {
        name: $("#nName").value,
        admin_name: $("#nAdmin").value,
        admin_email: $("#nEmail").value,
        plan: $("#nPlan").value,
        ...(rawCap ? { monthly_spend_cap_usd: Number(rawCap) } : {}),
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
const FEATURE_META = {
  call_state: {
    name: "Call state",
    group: "Live call",
    desc: "Tracks live call stage and intent.",
  },
  talk_meter: {
    name: "Talk meter",
    group: "Live call",
    desc: "Live agent vs customer talk ratio.",
  },
  card_style_v2: {
    name: "Card tone",
    group: "Live call",
    desc: "Company tone and banned phrases on live cards.",
  },
  card_ratings: {
    name: "Card ratings",
    group: "Live call",
    desc: "Helpful / not helpful feedback on cards.",
  },
  prep: { name: "Call prep", group: "Live call", desc: "Pre-call brief and meeting context." },
  prep_coach: {
    name: "Prep coach",
    group: "Live call",
    desc: "Interactive AI prep before a call.",
  },
  call_review: {
    name: "Call review",
    group: "After-call & Coaching",
    desc: "Post-call rubric scores and summary.",
  },
  postcall_wizard: {
    name: "Post-call wizard",
    group: "After-call & Coaching",
    desc: "Guided after-call wrap-up steps.",
  },
  follow_up: {
    name: "Follow-up drafts",
    group: "After-call & Coaching",
    desc: "AI-drafted follow-up messages.",
  },
  followup_plan: {
    name: "Follow-up plan",
    group: "After-call & Coaching",
    desc: "Scheduled follow-up steps after calls.",
  },
  recordings: {
    name: "Recordings",
    group: "After-call & Coaching",
    desc: "Call audio upload and playback.",
  },
  reports: {
    name: "Reports",
    group: "After-call & Coaching",
    desc: "Team call volume and skill reports.",
  },
  voice_coach: {
    name: "Voice coach",
    group: "After-call & Coaching",
    desc: "Spoken post-call coaching sessions.",
  },
  morning_brief: {
    name: "Morning brief",
    group: "After-call & Coaching",
    desc: "Daily 08:00 summary of today's meetings.",
  },
  style_memory: {
    name: "Style memory",
    group: "After-call & Coaching",
    desc: "Per-agent writing and phrasing rules.",
  },
  learned_instructions: {
    name: "Learned instructions",
    group: "After-call & Coaching",
    desc: "Auto-suggested rules from rated cards.",
  },
  integrations: {
    name: "Integrations",
    group: "CRM & Messaging",
    desc: "Master switch for CRM and messaging.",
  },
  zoho: {
    name: "Zoho CRM",
    group: "CRM & Messaging",
    desc: "Read meetings/contacts and save call notes.",
  },
  zoho_watch: {
    name: "Zoho live sync",
    group: "CRM & Messaging",
    desc: "Real-time Zoho webhook notifications.",
  },
  gallabox: {
    name: "Gallabox",
    group: "CRM & Messaging",
    desc: "WhatsApp Business API integration.",
  },
  whatsapp: {
    name: "WhatsApp",
    group: "CRM & Messaging",
    desc: "Send approved WhatsApp templates.",
  },
  whatsapp_status: {
    name: "WhatsApp status",
    group: "CRM & Messaging",
    desc: "Track sent, delivered, and read receipts.",
  },
  meeting_reminders: {
    name: "Meeting reminders",
    group: "CRM & Messaging",
    desc: "Automated WhatsApp meeting reminders.",
  },
  email_send: {
    name: "Send email",
    group: "CRM & Messaging",
    desc: "Send follow-up emails via SMTP.",
  },
  email_attachments: {
    name: "Email attachments",
    group: "CRM & Messaging",
    desc: "Attach company files to follow-up emails.",
  },
  ai_knowledge: {
    name: "AI knowledge",
    group: "Admin & Platform",
    desc: "Company knowledge fed to AI cards.",
  },
  playbook_bootstrap: {
    name: "Playbook bootstrap",
    group: "Admin & Platform",
    desc: "Generate initial playbook from website/Zoho.",
  },
  setup_guide: {
    name: "Setup guide",
    group: "Admin & Platform",
    desc: "In-app onboarding checklist.",
  },
  call_logs_github: {
    name: "Call logs to GitHub",
    group: "Admin & Platform",
    desc: "Owner-gated telemetry export to GitHub.",
  },
  local_models_text: {
    name: "Local text models",
    group: "Admin & Platform",
    desc: "Owner-gated local LLM endpoint.",
  },
  local_models_voice: {
    name: "Local voice models",
    group: "Admin & Platform",
    desc: "Owner-gated local STT/voice endpoint.",
  },
};
const featureMeta = (id) => FEATURE_META[id] || { name: id, group: "Other", desc: "" };
const featureName = (id) => featureMeta(id).name;
let featuresData = null;

async function loadFeatures() {
  renderFeatures(await api("/api/owner/features"));
}
function renderFeatures(data) {
  featuresData = data;
  const groups = [
    "Live call",
    "After-call & Coaching",
    "CRM & Messaging",
    "Admin & Platform",
    "Other",
  ];
  const killRows = [];
  for (const grp of groups) {
    const items = data.features.filter((f) => featureMeta(f.id).group === grp);
    if (!items.length) continue;
    killRows.push(h("tr", { class: "group-row" }, h("th", { colspan: 3, scope: "colgroup" }, grp)));
    for (const f of items) {
      const meta = featureMeta(f.id);
      killRows.push(
        h(
          "tr",
          {},
          h(
            "th",
            { scope: "row" },
            meta.name,
            meta.desc ? h("span", { class: "meta" }, meta.desc) : null,
          ),
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
      );
    }
  }
  $("#kills tbody").replaceChildren(...killRows);
  const sel = $("#matrixCompany");
  if (sel) {
    const keep = sel.value;
    sel.replaceChildren(...data.companies.map((c) => h("option", { value: c.id }, c.name)));
    if (keep && data.companies.some((c) => c.id === keep)) sel.value = keep;
  }
  renderMatrixForCompany();
}
function renderMatrixForCompany() {
  if (!featuresData) return;
  const data = featuresData;
  const sel = $("#matrixCompany");
  const q = ($("#matrixSearch")?.value || "").trim().toLowerCase();
  const company = data.companies.find((c) => c.id === sel?.value) || data.companies[0];
  $("#matrix thead").replaceChildren(
    h(
      "tr",
      {},
      h("th", { scope: "col" }, "Feature"),
      h("th", { scope: "col" }, "Group"),
      h("th", { scope: "col", class: "center" }, "Entitled"),
    ),
  );
  if (!company) {
    $("#matrix tbody").replaceChildren(
      h("tr", {}, h("td", { colspan: 3, class: "empty" }, "No companies yet.")),
    );
    return;
  }
  const filtered = data.features.filter((f) => {
    if (!q) return true;
    const m = featureMeta(f.id);
    return (
      m.name.toLowerCase().includes(q) ||
      m.group.toLowerCase().includes(q) ||
      f.id.toLowerCase().includes(q)
    );
  });
  $("#matrix tbody").replaceChildren(
    ...(filtered.length
      ? filtered.map((f) => {
          const m = featureMeta(f.id);
          return h(
            "tr",
            {},
            h("th", { scope: "row" }, m.name, m.desc ? h("span", { class: "meta" }, m.desc) : null),
            h("td", {}, m.group),
            h(
              "td",
              { class: "center" },
              h("input", {
                type: "checkbox",
                checked: company.entitled[f.id],
                "aria-label": `${m.name} for ${company.name}`,
                onchange: (e) => setEntitled(company, f.id, e.target),
              }),
            ),
          );
        })
      : [h("tr", {}, h("td", { colspan: 3, class: "empty" }, "No matching features."))]),
  );
}
$("#matrixCompany")?.addEventListener("change", renderMatrixForCompany);
$("#matrixSearch")?.addEventListener("input", renderMatrixForCompany);
function confirmAction({ title, body, blast, confirmLabel = "Confirm", requireText = null }) {
  return new Promise((resolve) => {
    const dlg = $("#confirmDialog");
    $("#confirmTitle").textContent = title;
    $("#confirmBody").textContent = body;
    const blastEl = $("#confirmBlast");
    blastEl.textContent = blast || "";
    blastEl.hidden = !blast;
    const typeWrap = $("#confirmTypeWrap");
    const input = $("#confirmInput");
    const okBtn = $("#confirmOk");
    const cancelBtn = $("#confirmCancel");
    okBtn.textContent = confirmLabel;
    input.value = "";
    if (requireText) {
      typeWrap.hidden = false;
      $("#confirmTypeLabel").textContent = `Type "${requireText}" to confirm`;
      okBtn.disabled = true;
      input.oninput = () => {
        okBtn.disabled = input.value !== requireText;
      };
    } else {
      typeWrap.hidden = true;
      okBtn.disabled = false;
      input.oninput = null;
    }
    const done = (yes) => {
      dlg.close();
      resolve(yes);
    };
    cancelBtn.onclick = () => done(false);
    okBtn.onclick = () => done(true);
    dlg.oncancel = () => resolve(false);
    dlg.showModal();
    cancelBtn.focus();
  });
}
function confirmKill(f) {
  return confirmAction({
    title: `Turn off ${featureName(f.id)} for everyone?`,
    body: `${featureName(f.id)} stops working for every company. You can turn it back on at any time.`,
    blast: "Affects: every company · apps follow within 10 minutes.",
    confirmLabel: "Turn off for everyone",
    requireText: f.id,
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
let auditOffset = 0;
const AUDIT_LIMIT = 50;
function auditDetailCell(detail) {
  const text = String(detail || "").trim();
  if (!text) return h("td", {}, "—");
  if (
    (text.startsWith("{") && text.endsWith("}")) ||
    (text.startsWith("[") && text.endsWith("]"))
  ) {
    try {
      const pretty = JSON.stringify(JSON.parse(text), null, 2);
      return h("td", {}, h("details", {}, h("summary", {}, "JSON details"), h("pre", {}, pretty)));
    } catch {
      /* fall through to plain text */
    }
  }
  return h("td", {}, text);
}
async function loadAudit(resetOffset = true) {
  if (resetOffset) auditOffset = 0;
  const compSel = $("#auditCompany");
  if (compSel && compSel.options.length <= 1) {
    try {
      const list = (await api("/api/owner/companies")).companies;
      compSel.replaceChildren(
        h("option", { value: "" }, "All companies"),
        ...list.map((c) => h("option", { value: c.id }, c.name)),
      );
    } catch {
      /* ignore */
    }
  }
  const params = new URLSearchParams({ limit: String(AUDIT_LIMIT), offset: String(auditOffset) });
  const q = $("#auditSearch")?.value?.trim();
  const cid = compSel?.value;
  const act = $("#auditAction")?.value?.trim();
  if (q) params.set("q", q);
  if (cid) params.set("company_id", cid);
  if (act) params.set("action", act);
  if ($("#auditHideNoise")?.checked) params.set("hide_noise", "1");
  const data = await api(`/api/owner/audit?${params.toString()}`);
  const items = data.items || [];
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
            auditDetailCell(a.detail),
            h("td", {}, a.ip || "—"),
          ),
        )
      : [h("tr", {}, h("td", { colspan: 6, class: "empty" }, "Nothing logged yet."))]),
  );
  const total = data.total ?? items.length;
  const pageEl = $("#auditPage");
  if (pageEl) {
    const start = total ? auditOffset + 1 : 0;
    const end = auditOffset + items.length;
    pageEl.textContent = `Showing ${start}–${end} of ${total}`;
  }
  if ($("#auditPrev")) $("#auditPrev").disabled = auditOffset === 0;
  if ($("#auditNext")) $("#auditNext").disabled = !data.has_more;
}
$("#auditSearch")?.addEventListener("input", () => loadAudit(true));
$("#auditCompany")?.addEventListener("change", () => loadAudit(true));
$("#auditAction")?.addEventListener("input", () => loadAudit(true));
$("#auditHideNoise")?.addEventListener("change", () => loadAudit(true));
$("#auditPrev")?.addEventListener("click", () => {
  auditOffset = Math.max(0, auditOffset - AUDIT_LIMIT);
  loadAudit(false);
});
$("#auditNext")?.addEventListener("click", () => {
  auditOffset += AUDIT_LIMIT;
  loadAudit(false);
});
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
  if (
    !(await confirmAction({
      title: "Remove platform Zoho client?",
      body: "Companies using the platform Zoho client will need to reconnect once a new client is saved.",
      blast: "Affects: every company without its own Zoho override.",
      confirmLabel: "Remove client",
    }))
  )
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
  if (
    !(await confirmAction({
      title: "Remove platform mailbox?",
      body: "Organisations without their own SMTP mailbox will not be able to send email, and welcome/OTP emails will stop.",
      blast: "Affects: platform invites, OTPs, and companies without their own mailbox.",
      confirmLabel: "Remove mailbox",
    }))
  )
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
  if (
    !(await confirmAction({
      title: "Remove GitHub repo and token?",
      body: "Issue reporting from the console and bug-report submission to GitHub will stop working.",
      blast: "Affects: owner console issue reporting and bug-report triage.",
      confirmLabel: "Remove GitHub config",
    }))
  )
    return;
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
function readablePageLabel(url) {
  try {
    const u = new URL(url);
    const label = `${u.pathname}${u.hash}`.replace(/^\//, "");
    return label || u.host;
  } catch {
    return String(url || "page");
  }
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
          h(
            "a",
            { href: r.page_url, target: "_blank", rel: "noopener noreferrer" },
            readablePageLabel(r.page_url),
          ),
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
  const issueNum = r.github_issue_url ? r.github_issue_url.split("/").pop() : null;
  const issueCell = h(
    "td",
    {},
    r.github_issue_url
      ? h(
          "a",
          { href: r.github_issue_url, target: "_blank", rel: "noopener noreferrer" },
          `#${issueNum}`,
        )
      : "—",
  );
  const actions = h("td", { class: "act" });
  const editBtn = h("button", { type: "button", class: "ghost" }, "Edit");
  editBtn.onclick = () => editBugRow(r, titleCell, statusCell, actions);
  const submitAction =
    r.status === "submitted" && r.github_issue_url
      ? h(
          "a",
          {
            href: r.github_issue_url,
            target: "_blank",
            rel: "noopener noreferrer",
            class: "ghost",
          },
          `View on GitHub #${issueNum}`,
        )
      : h(
          "button",
          {
            type: "button",
            class: "primary",
            disabled: r.status === "submitted",
            onclick: async () => {
              try {
                const out = await api(`/api/owner/bug-reports/${r.id}/submit`, {
                  method: "POST",
                  body: {},
                });
                toast(`Issue created: ${out.issue_url}`);
                loadBugReports();
              } catch (err) {
                toast(err.message);
              }
            },
          },
          "Submit to GitHub",
        );
  actions.append(editBtn, " ", submitAction);
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
    ["new", "reviewed", "submitted", "closed"].map((s) =>
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
