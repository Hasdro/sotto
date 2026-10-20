// Sotto owner console (D-022). Plain JS, no build step, served with a strict CSP (no inline code).

const $ = (s, el = document) => el.querySelector(s);
const DAY = 86400000;
let companies = [];
let current = null;

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
  $("#drawer").hidden = true;
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
    } else show("overview");
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
  ({ overview: loadOverview, companies: loadCompanies, audit: loadAudit, account: () => {} })[
    view
  ]();
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

async function openCompany(id) {
  current = await api(`/api/owner/companies/${id}`);
  renderDrawer();
  $("#drawer").hidden = false;
  $("#dClose").focus();
}
$("#dClose").addEventListener("click", () => ($("#drawer").hidden = true));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $("#drawer").hidden = true;
});

function renderDrawer() {
  const c = current;
  $("#dName").textContent = c.name;
  const plan = h(
    "select",
    { id: "fPlan" },
    ["trial", "starter", "team", "custom"].map((p) =>
      h("option", { value: p, selected: p === c.plan }, p),
    ),
  );
  const seats = h("input", { id: "fSeats", type: "number", min: 1, value: c.seats });
  const mins = h("input", { id: "fMins", type: "number", min: 1, value: c.minutes_month });
  const extend = h("input", { id: "fExtend", type: "number", min: 0, max: 366, value: 0 });
  const notes = h("textarea", { id: "fNotes", rows: 2 }, c.notes || "");
  const save = async () => {
    const body = {};
    if (plan.value !== c.plan) body.plan = plan.value;
    if (Number(seats.value) !== c.seats) body.seats = Number(seats.value);
    if (Number(mins.value) !== c.minutes_month) body.minutes_month = Number(mins.value);
    if (Number(extend.value) > 0) body.extend_days = Number(extend.value);
    if (notes.value !== (c.notes || "")) body.notes = notes.value;
    if (!Object.keys(body).length) return toast("Nothing changed");
    try {
      current = await api(`/api/owner/companies/${c.id}`, { method: "PATCH", body });
      renderDrawer();
      loadCompanies();
      toast("Saved");
    } catch (err) {
      toast(err.message);
    }
  };
  const suspend = async () => {
    current = await api(`/api/owner/companies/${c.id}`, {
      method: "PATCH",
      body: { suspended: !c.suspended },
    });
    renderDrawer();
    loadCompanies();
    toast(current.suspended ? "Suspended: calls blocked, sign-in still works" : "Re-activated");
  };
  const del = async () => {
    const typed = window.prompt
      ? window.prompt(`Type "${c.name}" to delete this company and all its data.`)
      : null;
    if (typed !== c.name) return toast("Not deleted");
    await api(`/api/owner/companies/${c.id}?confirm=${encodeURIComponent(typed)}`, {
      method: "DELETE",
    });
    $("#drawer").hidden = true;
    loadCompanies();
    toast("Company deleted");
  };
  $("#dBody").replaceChildren(
    h(
      "div",
      { class: "stat3" },
      h(
        "div",
        {},
        h("b", {}, h("span", { class: `pill ${c.status}` }, c.status)),
        h(
          "span",
          {},
          c.days_left !== null ? `${c.days_left} days left (${fmtDate(c.ends_at)})` : c.plan,
        ),
      ),
      h(
        "div",
        {},
        h("b", {}, `${fmtNum(c.minutes_used)} / ${fmtNum(c.minutes_month)}`),
        h("span", {}, "minutes this month"),
      ),
      h("div", {}, h("b", {}, `${c.seats_used} / ${c.seats}`), h("span", {}, "seats used")),
    ),
    h(
      "section",
      {},
      h("h3", {}, "Plan"),
      h(
        "div",
        { class: "formgrid" },
        h("div", {}, h("label", { for: "fPlan" }, "Plan"), plan),
        h(
          "div",
          {},
          h(
            "label",
            { for: "fExtend" },
            c.plan === "trial" ? "Extend trial by (days)" : "Mark paid for (days)",
          ),
          extend,
        ),
        h("div", {}, h("label", { for: "fSeats" }, "Seats"), seats),
        h("div", {}, h("label", { for: "fMins" }, "Minutes per month"), mins),
        h("div", { class: "full" }, h("label", { for: "fNotes" }, "Private notes"), notes),
      ),
      h(
        "div",
        { class: "row" },
        h(
          "button",
          { type: "button", class: c.suspended ? "" : "danger", onclick: suspend },
          c.suspended ? "Re-activate" : "Suspend",
        ),
        h("button", { type: "button", class: "primary", onclick: save }, "Save plan"),
      ),
    ),
    h(
      "section",
      {},
      h("h3", {}, `Users (${c.users.length})`),
      table(
        ["Name", "Role", "Last seen", ""],
        c.users.map((u) => [
          [u.name, h("span", { class: "meta" }, u.email)],
          u.active ? u.role : `${u.role} (disabled)`,
          fmtWhen(u.last_seen_at),
          [
            h(
              "button",
              { type: "button", class: "ghost", onclick: () => resetPw(u) },
              "Reset password",
            ),
            h(
              "button",
              { type: "button", class: "ghost", onclick: () => setActive(u, !u.active) },
              u.active ? "Disable" : "Enable",
            ),
          ],
        ]),
      ),
    ),
    h(
      "section",
      {},
      h("h3", {}, `Devices (${c.devices.length})`),
      table(
        ["Device", "User", "Version", "Last seen", ""],
        c.devices.map((d) => [
          [d.label, h("span", { class: "meta" }, d.platform)],
          d.user.email,
          d.app_version,
          fmtWhen(d.last_seen),
          d.revoked
            ? "signed out"
            : h("button", { type: "button", class: "ghost", onclick: () => revoke(d) }, "Sign out"),
        ]),
      ),
    ),
    h(
      "section",
      {},
      h("h3", {}, "Recent calls"),
      table(
        ["When", "Agent", "Length", "Cards", "Holding", "p95"],
        c.calls.map((k) => [
          fmtWhen(k.started_at),
          k.email,
          `${Math.round(k.duration_s / 60)} min`,
          k.cards,
          k.holding_lines,
          k.p95_ms === null ? "—" : `${k.p95_ms} ms`,
        ]),
      ),
    ),
    h(
      "section",
      {},
      h("h3", {}, "Audit"),
      table(
        ["When", "Who", "Action", "Detail"],
        c.audit.map((a) => [fmtWhen(a.at), a.actor || "—", a.action, a.detail]),
      ),
    ),
    h(
      "section",
      {},
      h("h3", {}, "Danger zone"),
      h(
        "button",
        { type: "button", class: "danger", onclick: del },
        "Delete company and all its data",
      ),
    ),
  );
}
function table(head, rows) {
  if (!rows.length) return h("p", { class: "empty" }, "None yet.");
  return h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      {},
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          head.map((t) => h("th", {}, t)),
        ),
      ),
      h(
        "tbody",
        {},
        rows.map((r) =>
          h(
            "tr",
            {},
            r.map((cell) => h("td", {}, cell)),
          ),
        ),
      ),
    ),
  );
}
async function resetPw(u) {
  const r = await api(`/api/owner/users/${u.id}/reset`, { method: "POST", body: {} });
  showSecret(`New password for ${u.email}`, r.temporary_password);
}
async function setActive(u, active) {
  await api(`/api/owner/users/${u.id}/active`, { method: "POST", body: { active } });
  openCompany(current.id);
  toast(active ? "User enabled" : "User disabled and signed out");
}
async function revoke(d) {
  await api(`/api/owner/devices/${d.id}`, { method: "DELETE" });
  openCompany(current.id);
  toast("Device signed out");
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

start();
