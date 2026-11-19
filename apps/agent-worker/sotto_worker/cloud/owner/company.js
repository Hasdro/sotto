// Company profile (round 2, D-078): one page per company, opened in a new tab from Companies.
// Same origin, same owner sign-in. Plain JS, no build step, strict CSP (no inline code).

const $ = (s, el = document) => el.querySelector(s);
const DAY = 86400000;
const id = new URLSearchParams(location.search).get("id");
let c = null;

// Round 3 (D-092): tile state. Each integration/model status is "ok" | "warn" | "bad" | null
// (null = not known yet). renderTiles() rebuilds the tile grid from c + tileState.
const tileState = {
  gallabox: null,
  webhook: null,
  orgSmtp: null,
  agn: null,
  sender: null,
  models: null, // {status, stages, companyRoutes, unavailable}
};
let currentTile = null; // section key open in #tileDialog, or null
let issueShotUrl = null;
let githubReady = null; // {configured, repo} from GET /api/owner/github, or null while unknown

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
  if (res.status === 401) {
    $("#signedOut").hidden = false;
    $("#page").hidden = true;
    throw new Error("signed out");
  }
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
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

// --- tiles (D-092): one tile per section; a tile opens its section in #tileDialog -------------
// The section node is moved into the dialog while open and moved back on close, so every
// existing renderer keeps working on the same node wherever it sits.
const SECTIONS = {
  plan: { title: "Plan", sec: "sec-plan" },
  users: { title: "Users", sec: "sec-users" },
  integrations: { title: "Integrations", sec: "sec-integrations" },
  models: { title: "Models", sec: "sec-models" },
  devices: { title: "Devices", sec: "sec-devices" },
  calls: { title: "Recent calls", sec: "sec-calls" },
  audit: { title: "Audit", sec: "sec-audit" },
  danger: { title: "Danger zone", sec: "sec-danger" },
};
function tileSummary(key) {
  switch (key) {
    case "plan":
      return {
        dot: c.suspended ? "bad" : c.status === "trial" ? "warn" : "ok",
        head: c.plan,
        sub:
          c.days_left !== null ? `${c.days_left} days left` : `${c.seats_used} / ${c.seats} seats`,
      };
    case "users":
      return {
        dot: "neutral",
        head: String(c.users.length),
        sub: c.users.length === 1 ? "user" : "users",
      };
    case "integrations": {
      const parts = [
        tileState.gallabox,
        tileState.webhook,
        tileState.orgSmtp,
        tileState.agn,
        tileState.sender,
      ];
      const known = parts.filter((s) => s !== null);
      const done = parts.filter((s) => s === "ok" || s === "warn").length;
      const bad = known.some((s) => s === "bad");
      return {
        dot: bad ? "bad" : known.length < 5 ? "neutral" : done === 5 ? "ok" : "warn",
        head: `${done} of 5`,
        sub: "integrations set up",
      };
    }
    case "models": {
      const m = tileState.models;
      if (!m) return { dot: "neutral", head: "—", sub: "per-company routes" };
      return {
        dot: m.unavailable ? "bad" : m.companyRoutes ? "ok" : "neutral",
        head: `${m.companyRoutes} of ${m.stages} custom`,
        sub: m.unavailable
          ? `${m.unavailable} model${m.unavailable === 1 ? "" : "s"} unavailable`
          : "stages",
      };
    }
    case "devices":
      return {
        dot: "neutral",
        head: String(c.devices.length),
        sub: c.devices.length === 1 ? "device" : "devices",
      };
    case "calls":
      return {
        dot: "neutral",
        head: String(c.calls.length),
        sub: c.calls.length === 1 ? "recent call" : "recent calls",
      };
    case "audit":
      return { dot: "neutral", head: String(c.audit.length), sub: "audit entries" };
    case "danger":
      return { dot: "neutral", head: "Delete", sub: "company and all its data" };
    default:
      return { dot: "neutral", head: "—", sub: "" };
  }
}
function renderTiles() {
  if (!c) return;
  $("#tiles").replaceChildren(
    ...Object.keys(SECTIONS).map((key) => {
      const s = tileSummary(key);
      return h(
        "li",
        {},
        h(
          "button",
          {
            type: "button",
            class: "tile",
            onclick: () => openTile(key),
            "aria-label": `${SECTIONS[key].title}: ${s.head}, ${s.sub}`,
          },
          h("span", { class: `tile-dot ${s.dot}` }),
          h("span", { class: "tile-title" }, SECTIONS[key].title),
          h("span", { class: "tile-head" }, s.head),
          h("span", { class: "tile-sub" }, s.sub),
        ),
      );
    }),
  );
  renderRollup();
}
function renderRollup() {
  const parts = [
    tileState.gallabox,
    tileState.webhook,
    tileState.orgSmtp,
    tileState.agn,
    tileState.sender,
  ];
  const known = parts.filter((s) => s !== null).length;
  if (!known) {
    $("#intRollup").textContent = "";
    return;
  }
  const done = parts.filter((s) => s === "ok" || s === "warn").length;
  $("#intRollup").textContent =
    `Integrations: ${done} of 5 set up${known < 5 ? ` (${known} checked so far).` : "."}`;
}
function openTile(key) {
  const sec = document.getElementById(SECTIONS[key].sec);
  if (!sec) return;
  currentTile = key;
  openTile.home = $("#sectionHome");
  openTile.next = sec.nextSibling;
  $("#tileTitle").textContent = SECTIONS[key].title;
  $("#tileBody").append(sec);
  $("#tileDialog").showModal();
}
$("#tileClose").addEventListener("click", () => $("#tileDialog").close());
$("#tileDialog").addEventListener("close", () => {
  const sec = currentTile ? document.getElementById(SECTIONS[currentTile].sec) : null;
  if (sec && openTile.home) openTile.home.insertBefore(sec, openTile.next);
  currentTile = null;
});

// --- GitHub issue reporting (D-085) ----------------------------------------------------------
// One icon button in the page head (JS-added so every page head gets one). The dialog
// auto-fills the exact page address: location.href plus the open tile's section fragment.
function pageAddress() {
  const base = location.href.split("#")[0];
  return currentTile ? `${base}#${SECTIONS[currentTile].sec}` : base;
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
function addIssueButton() {
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
    : "GitHub is not set up yet — add the repo and token in the owner console › Account › GitHub issues.";
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
addIssueButton();

async function load() {
  if (!id) {
    $("#cName").textContent = "No company";
    $("#page").hidden = false;
    return;
  }
  c = await api(`/api/owner/companies/${id}`);
  document.title = `${c.name} · AGN Sales Shield · Owner`;
  $("#cName").textContent = c.name;
  $("#cMeta").textContent =
    `${c.plan} · ${c.seats_used} / ${c.seats} seats · ` +
    `${fmtNum(c.minutes_used)} / ${fmtNum(c.minutes_month)} minutes this month`;
  $("#page").hidden = false;
  renderStats();
  renderPlan();
  renderUsers();
  renderDevices();
  renderCalls();
  renderAudit();
  renderDanger();
  renderOrgSmtp();
  renderUserSmtp();
  renderAgn();
  renderGallabox();
  renderWebhook();
  renderModels();
  loadSender();
  renderTiles();
}
load().catch((err) => {
  if (err.message !== "signed out") toast(err.message);
});

// --- platform sender (D-089): the DB platform SMTP scope, read-only here ---------------------
async function loadSender() {
  let s = null;
  try {
    s = await api("/api/owner/sender");
  } catch {
    s = null;
  }
  const box = $("#sender");
  if (!s) {
    tileState.sender = null;
    box.replaceChildren(h("p", { class: "note" }, "Platform sender status unavailable."));
    return;
  }
  tileState.sender = s.configured ? "ok" : "bad";
  box.replaceChildren(
    h(
      "p",
      {},
      s.configured
        ? h("span", { class: "status ok" }, `Configured · ${s.from_address}`)
        : h("span", { class: "status bad" }, "Not configured"),
    ),
    h(
      "p",
      { class: "note" },
      s.configured
        ? `Host ${s.host} · last test ${s.tested_at ? fmtWhen(s.tested_at) : "never"}${s.test_ok === false ? " · last test failed" : ""}. Change it in the owner console › Account › Email (SMTP).`
        : "Set the platform mailbox in the owner console › Account › Email (SMTP). Welcome emails and OTPs go out from it.",
    ),
  );
  renderTiles();
}

// --- the company itself ----------------------------------------------------------------------
function renderStats() {
  $("#stats").replaceChildren(
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
  );
}

function renderPlan() {
  const plan = h(
    "select",
    { id: "fPlan" },
    ["trial", "starter", "growth", "scale", "team", "custom"].map((p) =>
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
      c = await api(`/api/owner/companies/${c.id}`, { method: "PATCH", body });
      load();
      toast("Saved");
    } catch (err) {
      toast(err.message);
    }
  };
  const suspend = async () => {
    c = await api(`/api/owner/companies/${c.id}`, {
      method: "PATCH",
      body: { suspended: !c.suspended },
    });
    load();
    toast(c.suspended ? "Suspended: calls blocked, sign-in still works" : "Re-activated");
  };
  $("#planForm").replaceChildren(
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
  );
}

function renderUsers() {
  $("#usersTitle").textContent = `Users (${c.users.length})`;
  $("#users").replaceChildren(
    table(
      ["Name", "Role", "Last seen", ""],
      c.users.map((u) => [
        [u.name, h("span", { class: "meta" }, u.email)],
        u.active ? u.role : `${u.role} (disabled)`,
        fmtWhen(u.last_seen_at),
        [
          h(
            "button",
            {
              type: "button",
              class: "ghost",
              onclick: async () => {
                const r = await api(`/api/owner/users/${u.id}/reset`, {
                  method: "POST",
                  body: {},
                });
                showSecret(`New password for ${u.email}`, r.temporary_password);
              },
            },
            "Reset password",
          ),
          h(
            "button",
            {
              type: "button",
              class: "ghost",
              onclick: async () => {
                await api(`/api/owner/users/${u.id}/active`, {
                  method: "POST",
                  body: { active: !u.active },
                });
                load();
                toast(u.active ? "User disabled and signed out" : "User enabled");
              },
            },
            u.active ? "Disable" : "Enable",
          ),
        ],
      ]),
    ),
  );
}

function renderDevices() {
  $("#devicesTitle").textContent = `Devices (${c.devices.length})`;
  $("#devices").replaceChildren(
    table(
      ["Device", "User", "Version", "Last seen", ""],
      c.devices.map((d) => [
        [d.label, h("span", { class: "meta" }, d.platform)],
        d.user.email,
        d.app_version,
        fmtWhen(d.last_seen),
        d.revoked
          ? "signed out"
          : h(
              "button",
              {
                type: "button",
                class: "ghost",
                onclick: async () => {
                  await api(`/api/owner/devices/${d.id}`, { method: "DELETE" });
                  load();
                  toast("Device signed out");
                },
              },
              "Sign out",
            ),
      ]),
    ),
  );
}

function renderCalls() {
  $("#callsTitle").textContent = `Recent calls (${c.calls.length})`;
  $("#calls").replaceChildren(
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
  );
}

function renderAudit() {
  $("#auditTitle").textContent = `Audit (${c.audit.length})`;
  $("#audit").replaceChildren(
    table(
      ["When", "Who", "Action", "Detail"],
      c.audit.map((a) => [fmtWhen(a.at), a.actor || "—", a.action, a.detail]),
    ),
  );
}

function renderDanger() {
  $("#danger").replaceChildren(
    h(
      "button",
      {
        type: "button",
        class: "danger",
        onclick: async () => {
          const typed = window.prompt
            ? window.prompt(`Type "${c.name}" to delete this company and all its data.`)
            : null;
          if (typed !== c.name) return toast("Not deleted");
          await api(`/api/owner/companies/${c.id}?confirm=${encodeURIComponent(typed)}`, {
            method: "DELETE",
          });
          window.close();
          toast("Company deleted");
        },
      },
      "Delete company and all its data",
    ),
  );
}

// --- email: one mailbox form, used for the org and for one user --------------------------------
// prefix ("org" / "user") keeps the two forms' field ids unique on the page (D-093: every
// label is associated with its field via for/id).
function smtpForm(actions, prefix) {
  const host = h("input", {
    id: `${prefix}-smtp-host`,
    autocomplete: "off",
    spellcheck: false,
    placeholder: "smtp.hostinger.com",
  });
  const port = h(
    "select",
    { id: `${prefix}-smtp-port` },
    h("option", { value: "465", selected: true }, "465 · SSL"),
    h("option", { value: "587" }, "587 · STARTTLS"),
  );
  const user = h("input", { id: `${prefix}-smtp-user`, autocomplete: "off", spellcheck: false });
  const pass = h("input", {
    id: `${prefix}-smtp-pass`,
    type: "password",
    autocomplete: "new-password",
  });
  const fromName = h("input", { id: `${prefix}-smtp-from-name`, autocomplete: "off" });
  const from = h("input", { id: `${prefix}-smtp-from`, type: "email", autocomplete: "off" });
  const statusLine = h("p", {});
  const msg = h("p", { class: "note", role: "status" });
  const read = () => ({
    host: host.value,
    port: Number(port.value),
    username: user.value,
    password: pass.value,
    from_name: fromName.value,
    from_address: from.value,
  });
  const fill = (s) => {
    host.value = s.host || "";
    port.value = String(s.port || 465);
    user.value = "";
    pass.value = "";
    fromName.value = s.from_name || "";
    from.value = s.from_address || "";
    statusLine.replaceChildren(
      s.configured
        ? h("span", { class: "status ok" }, "Mailbox saved")
        : h("span", { class: "status warn" }, "No mailbox saved yet"),
    );
    msg.textContent = "";
  };
  const save = h(
    "button",
    {
      type: "button",
      class: "primary",
      onclick: async () => {
        try {
          await actions.save(read());
          msg.textContent = "Saved";
        } catch (err) {
          msg.textContent = err.message;
        }
      },
    },
    "Save mailbox",
  );
  const test = h(
    "button",
    {
      type: "button",
      class: "ghost",
      onclick: async () => {
        try {
          await actions.test();
          msg.textContent = "Test email sent to your inbox.";
        } catch (err) {
          msg.textContent = err.message;
        }
      },
    },
    "Send test email",
  );
  const remove = h(
    "button",
    {
      type: "button",
      class: "ghost",
      onclick: async () => {
        try {
          await actions.remove();
          fill({ configured: false });
          msg.textContent = "Removed";
        } catch (err) {
          msg.textContent = err.message;
        }
      },
    },
    "Remove",
  );
  return {
    el: h(
      "div",
      {},
      statusLine,
      h(
        "div",
        { class: "formgrid" },
        h("div", {}, h("label", { for: `${prefix}-smtp-host` }, "SMTP server"), host),
        h("div", {}, h("label", { for: `${prefix}-smtp-port` }, "Port"), port),
        h("div", {}, h("label", { for: `${prefix}-smtp-user` }, "Username"), user),
        h(
          "div",
          {},
          h("label", { for: `${prefix}-smtp-pass` }, "Password (empty keeps the saved one)"),
          pass,
        ),
        h("div", {}, h("label", { for: `${prefix}-smtp-from-name` }, "From name"), fromName),
        h("div", {}, h("label", { for: `${prefix}-smtp-from` }, "From address"), from),
      ),
      h("div", { class: "row" }, save, test, remove),
      msg,
    ),
    fill,
  };
}

async function renderOrgSmtp() {
  const box = $("#orgSmtp");
  let status;
  try {
    status = await api(`/api/owner/companies/${id}/smtp`);
  } catch (err) {
    box.replaceChildren(h("p", { class: "note" }, err.message));
    return;
  }
  const form = smtpForm(
    {
      save: (d) => api(`/api/owner/companies/${id}/smtp`, { method: "PUT", body: d }),
      test: () => api(`/api/owner/companies/${id}/smtp/test`, { method: "POST", body: {} }),
      remove: () => api(`/api/owner/companies/${id}/smtp`, { method: "DELETE" }),
    },
    "org",
  );
  tileState.orgSmtp =
    status.active === "org" ? "ok" : status.active === "platform" ? "warn" : "bad";
  box.replaceChildren(
    h(
      "p",
      {},
      status.active === "org"
        ? h("span", { class: "status ok" }, "This mailbox sends the company's email.")
        : status.active === "platform"
          ? h(
              "span",
              { class: "status warn" },
              "No company mailbox: the platform mailbox sends the company's email.",
            )
          : h(
              "span",
              { class: "status bad" },
              "No mailbox anywhere: email cannot be sent for this company yet.",
            ),
    ),
    form.el,
  );
  form.fill(status.org);
  renderTiles();
}

async function renderUserSmtp() {
  const box = $("#userSmtp");
  const pick = h(
    "select",
    { id: "userPick" },
    c.users.map((u) => h("option", { value: u.id }, `${u.name} (${u.email})`)),
  );
  const form = smtpForm(
    {
      save: (d) =>
        api(`/api/owner/companies/${id}/users/${pick.value}/smtp`, { method: "PUT", body: d }),
      test: () =>
        api(`/api/owner/companies/${id}/users/${pick.value}/smtp/test`, {
          method: "POST",
          body: {},
        }),
      remove: () =>
        api(`/api/owner/companies/${id}/users/${pick.value}/smtp`, { method: "DELETE" }),
    },
    "user",
  );
  const loadOne = async () => {
    try {
      form.fill(await api(`/api/owner/companies/${id}/users/${pick.value}/smtp`));
    } catch (err) {
      form.fill({ configured: false });
      toast(err.message);
    }
  };
  pick.addEventListener("change", loadOne);
  box.replaceChildren(
    h("div", { class: "formgrid" }, h("div", {}, h("label", { for: "userPick" }, "User"), pick)),
    form.el,
  );
  if (c.users.length) await loadOne();
  else form.fill({ configured: false });
}

// --- Zoho: the four AGN fields on Deals ---------------------------------------------------------
async function renderAgn() {
  const box = $("#agn");
  let data;
  try {
    data = await api(`/api/owner/companies/${id}/zoho/agn-fields`);
  } catch (err) {
    box.replaceChildren(
      h(
        "p",
        { class: "note" },
        "Zoho is not connected for this company yet. Ask an admin of the company to connect " +
          "Zoho in the app first; the fields are then created through that admin's connection.",
      ),
      h("p", { class: "note" }, err.message),
    );
    return;
  }
  const missing = data.fields.filter((f) => !f.exists);
  const msg = h("p", { class: "note", role: "status" });
  tileState.agn = missing.length ? "warn" : "ok";
  box.replaceChildren(
    h(
      "p",
      {},
      missing.length
        ? h("span", { class: "status warn" }, `${missing.length} of 4 fields missing on Deals`)
        : h("span", { class: "status ok" }, "All four fields exist on Deals"),
    ),
    h("p", { class: "note" }, `Checked through ${data.connected_as}'s Zoho connection.`),
    table(
      ["Field", "Type", "Exists", ""],
      data.fields.map((f) => [
        [f.label, h("span", { class: "meta" }, f.api_name)],
        f.type,
        f.exists ? "Yes" : "No",
        f.exists ? "" : f.writable ? "will be created" : "same label, other name — left alone",
      ]),
    ),
    missing.length
      ? h(
          "button",
          {
            type: "button",
            class: "primary",
            onclick: async () => {
              try {
                data = await api(`/api/owner/companies/${id}/zoho/agn-fields`, {
                  method: "POST",
                  body: { confirm: true },
                });
                renderAgn();
                toast(`Created ${data.created.length || "no"} field(s)`);
              } catch (err) {
                msg.textContent = err.message;
              }
            },
          },
          `Create ${missing.length} missing field(s) on Deals`,
        )
      : h(
          "p",
          { class: "note" },
          "All four fields exist on Deals. Stage and amount are never written.",
        ),
    msg,
  );
  renderTiles();
}

// --- Gallabox: keys, number, templates, webhook --------------------------------------------------
const SOURCES = [
  "customer.name",
  "customer.first_name",
  "customer.phone",
  "agent.name",
  "agent.first_name",
  "company.name",
  "meeting.date",
  "meeting.time",
  "meeting.place",
  "deal.name",
];

async function renderGallabox() {
  const box = $("#gallabox");
  let status;
  try {
    status = await api(`/api/owner/companies/${id}/gallabox`);
  } catch (err) {
    box.replaceChildren(h("p", { class: "note" }, err.message));
    return;
  }
  const key = h("input", {
    id: "gb-key",
    autocomplete: "off",
    spellcheck: false,
    placeholder: "Gallabox API key",
  });
  const secret = h("input", {
    id: "gb-secret",
    type: "password",
    autocomplete: "off",
    placeholder: "Gallabox API secret",
  });
  const account = h("input", {
    id: "gb-account",
    autocomplete: "off",
    spellcheck: false,
    placeholder: "Account ID",
  });
  const msg = h("p", { class: "note", role: "status" });
  const pickers = h("div", {});
  const saveKeys = async () => {
    try {
      status = await api(`/api/owner/companies/${id}/gallabox`, {
        method: "PUT",
        body: { api_key: key.value, api_secret: secret.value, account_id: account.value },
      });
      renderGallabox();
      toast("Saved");
    } catch (err) {
      msg.textContent = err.message;
    }
  };
  const remove = async () => {
    try {
      status = await api(`/api/owner/companies/${id}/gallabox`, { method: "DELETE" });
      renderGallabox();
      toast("Removed");
    } catch (err) {
      msg.textContent = err.message;
    }
  };
  tileState.gallabox = status.configured ? (status.channel.set ? "ok" : "warn") : "bad";
  box.replaceChildren(
    h(
      "p",
      {},
      status.configured
        ? status.channel.set
          ? h(
              "span",
              { class: "status ok" },
              `Connected · ${status.channel.label} · ${status.templates.length} template(s) allowed`,
            )
          : h("span", { class: "status warn" }, "Keys saved · no WhatsApp number picked yet")
        : h(
            "span",
            { class: "status bad" },
            "Not connected. Save the keys, then pick a number and the templates.",
          ),
    ),
    h(
      "div",
      { class: "formgrid" },
      h("div", {}, h("label", { for: "gb-key" }, "API key (empty keeps the saved one)"), key),
      h(
        "div",
        {},
        h("label", { for: "gb-secret" }, "API secret (empty keeps the saved one)"),
        secret,
      ),
      h("div", {}, h("label", { for: "gb-account" }, "Account ID"), account),
    ),
    h(
      "div",
      { class: "row" },
      h("button", { type: "button", class: "primary", onclick: saveKeys }, "Save keys"),
      h("button", { type: "button", class: "ghost", onclick: remove }, "Remove"),
      h(
        "button",
        {
          type: "button",
          class: "ghost",
          onclick: () => loadDiscover(pickers, status),
          disabled: !status.configured,
        },
        "Refresh from Gallabox",
      ),
    ),
    msg,
    pickers,
  );
  if (status.configured) loadDiscover(pickers, status).catch((err) => toast(err.message));
  renderTiles();
}

async function loadDiscover(pickers, status) {
  const found = await api(`/api/owner/companies/${id}/gallabox/discover`, {
    method: "POST",
    body: {},
  });
  const current = new Map(status.templates.map((t) => [`${t.name}/${t.language}`, t]));
  const chan = h(
    "select",
    { id: "gb-channel" },
    found.channels.map((ch) => h("option", { value: ch.ref, selected: ch.selected }, ch.label)),
  );
  const chanMsg = h("p", { class: "note", role: "status" });
  const saveChannel = h(
    "button",
    {
      type: "button",
      class: "primary",
      onclick: async () => {
        try {
          await api(`/api/owner/companies/${id}/gallabox/channel`, {
            method: "PUT",
            body: { ref: chan.value },
          });
          chanMsg.textContent = "Number saved";
        } catch (err) {
          chanMsg.textContent = err.message;
        }
      },
    },
    "Save number",
  );
  // Templates (D-093): a contained, searchable list — not a <details> that pushes the
  // whole page down. Each template is a checkbox row; each parameter gets a visible,
  // associated label (for/id) instead of a bare span.
  const items = found.templates.map((t) => {
    const k = `${t.name}/${t.language}`;
    const cur = current.get(k);
    const cb = h("input", { type: "checkbox", checked: !!cur });
    const mapping = {};
    const paramRows = t.params.map((p) => {
      const pid = `tpl-${k.replace(/[^a-zA-Z0-9_-]/g, "-")}-${p.name.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
      const sel = h("select", { id: pid, "aria-label": `Source for ${p.name} in ${t.name}` }, [
        h("option", { value: "" }, "agent types it"),
        ...SOURCES.map((s) =>
          h(
            "option",
            {
              value: s,
              selected:
                s === (cur?.params.find((x) => x.name === p.name)?.source || p.source || ""),
            },
            s,
          ),
        ),
      ]);
      mapping[p.name] = sel;
      return h("div", { class: "tpl-param" }, h("label", { for: pid }, p.name), sel);
    });
    return {
      k,
      cb,
      mapping,
      el: h(
        "div",
        { class: "tpl-item" },
        h("label", { class: "tpl-name" }, cb, ` ${t.name} (${t.language})`),
        ...paramRows,
      ),
    };
  });
  const summary = h("p", { class: "note" });
  const updateSummary = () => {
    const n = items.filter((i) => i.cb.checked).length;
    summary.textContent = `${n} of ${items.length} templates selected`;
  };
  for (const i of items) i.cb.addEventListener("change", updateSummary);
  updateSummary();
  const search = h("input", {
    type: "search",
    placeholder: "Search templates…",
    "aria-label": "Search templates",
  });
  const list = h("div", { class: "tpl-list" }, ...items.map((i) => i.el));
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    for (const i of items) i.el.style.display = !q || i.k.toLowerCase().includes(q) ? "" : "none";
  });
  const tplMsg = h("p", { class: "note", role: "status" });
  const saveTemplates = h(
    "button",
    {
      type: "button",
      class: "primary",
      onclick: async () => {
        try {
          await api(`/api/owner/companies/${id}/gallabox/templates`, {
            method: "PUT",
            body: {
              selected: items
                .filter((i) => i.cb.checked)
                .map((i) => ({
                  name: i.k.split("/")[0],
                  language: i.k.split("/")[1],
                  mapping: Object.fromEntries(
                    Object.entries(i.mapping).map(([n, sel]) => [n, sel.value]),
                  ),
                })),
            },
          });
          tplMsg.textContent = "Templates saved";
        } catch (err) {
          tplMsg.textContent = err.message;
        }
      },
    },
    "Save templates",
  );
  pickers.replaceChildren(
    h("h3", {}, "WhatsApp number"),
    h(
      "div",
      { class: "formgrid" },
      h("div", {}, h("label", { for: "gb-channel" }, "Number"), chan),
    ),
    h("div", { class: "row" }, saveChannel),
    chanMsg,
    h("h3", {}, "Templates"),
    found.unmapped && Object.keys(found.unmapped).length
      ? h(
          "p",
          { class: "note" },
          "These still need a source: " +
            Object.entries(found.unmapped)
              .map(([t, ps]) => `${t} (${ps.join(", ")})`)
              .join("; "),
        )
      : null,
    summary,
    search,
    list,
    h("div", { class: "row" }, saveTemplates),
    tplMsg,
  );
}

async function renderWebhook() {
  const box = $("#webhook");
  let st;
  try {
    st = await api(`/api/owner/companies/${id}/gallabox/webhook`);
  } catch (err) {
    box.replaceChildren(h("p", { class: "note" }, err.message));
    return;
  }
  const msg = h("p", { class: "note", role: "status" });
  tileState.webhook = st.configured ? (st.enabled ? "ok" : "warn") : "bad";
  box.replaceChildren(
    h(
      "p",
      {},
      st.configured
        ? h("span", { class: "status ok" }, `Configured · ${st.url}`)
        : h("span", { class: "status bad" }, "Not configured"),
    ),
    h(
      "p",
      { class: "note" },
      st.enabled
        ? "Delivery status is on for this company."
        : "Delivery status is off for this company — turn the WhatsApp status feature on in Features first.",
    ),
    h(
      "button",
      {
        type: "button",
        class: "primary",
        disabled: !st.enabled,
        onclick: async () => {
          try {
            const r = await api(`/api/owner/companies/${id}/gallabox/webhook`, {
              method: "POST",
              body: {},
            });
            showSecret("Webhook secret — paste it into Gallabox › Settings › Webhooks", r.secret);
            renderWebhook();
          } catch (err) {
            msg.textContent = err.message;
          }
        },
      },
      st.configured ? "Rotate URL and secret" : "Create webhook",
    ),
    msg,
  );
  renderTiles();
}

// --- Models: per-company routes + custom providers (D-081, D-084) ------------------------------
async function renderModels() {
  const box = $("#models");
  let routes;
  let provs;
  try {
    [routes, provs] = await Promise.all([
      api(`/api/owner/companies/${id}/routes`),
      // Company context: the server includes this company's custom providers when
      // company_id is given (contract §A). Built-ins work without it.
      api(`/api/owner/providers?company_id=${encodeURIComponent(id)}`),
    ]);
  } catch (err) {
    box.replaceChildren(h("p", { class: "note" }, err.message));
    return;
  }
  const providers = provs.providers;
  // Normalise models: the new shape is [{id, display_name, enabled}]; the current server
  // returns plain strings. Accept both; only enabled models are offered (D-081).
  const modelsOf = (p) =>
    (p.models || []).map((m) =>
      typeof m === "string"
        ? { id: m, name: m, enabled: true }
        : { id: m.id, name: m.display_name || m.id, enabled: m.enabled !== false },
    );
  const enabledModels = (p) => modelsOf(p).filter((m) => m.enabled);
  const customProviders = providers.filter((p) => p.custom);

  // --- custom providers: add / models + enable toggles / test / remove -------------------------
  const customBox = h("div", {});
  const customProviderBlock = (cp) => {
    const models = modelsOf(cp);
    const msg = h("p", { class: "note", role: "status" });
    const slug = String(cp.id).replace(/[^a-zA-Z0-9_-]/g, "-");
    const addId = h("input", {
      id: `cp-${slug}-model-id`,
      placeholder: "Model id, e.g. my-model-1",
      autocomplete: "off",
      spellcheck: false,
    });
    const addName = h("input", {
      id: `cp-${slug}-model-name`,
      placeholder: "Display name (optional)",
      autocomplete: "off",
    });
    return h(
      "div",
      { class: "custom-provider" },
      h(
        "h4",
        {},
        cp.name,
        " ",
        h(
          "span",
          { class: "meta" },
          `${cp.base_url || ""} · ${cp.format || "chat-completions"} · ${cp.auth_mode || "bearer"}`,
        ),
      ),
      models.length
        ? h(
            "ul",
            { class: "plain" },
            models.map((m) =>
              h(
                "li",
                {},
                h(
                  "label",
                  {},
                  h("input", {
                    type: "checkbox",
                    checked: m.enabled,
                    onchange: async (e) => {
                      try {
                        await api(
                          `/api/owner/companies/${id}/providers/${cp.id}/models/${encodeURIComponent(m.id)}`,
                          { method: "PATCH", body: { enabled: e.target.checked } },
                        );
                        renderModels();
                      } catch (err) {
                        e.target.checked = !e.target.checked;
                        msg.textContent = err.message;
                      }
                    },
                  }),
                  ` ${m.name} `,
                  h("span", { class: "meta" }, m.id),
                ),
              ),
            ),
          )
        : h("p", { class: "note" }, "No models yet — add one below."),
      h(
        "div",
        { class: "formgrid" },
        h("div", {}, h("label", { for: `cp-${slug}-model-id` }, "Model id"), addId),
        h("div", {}, h("label", { for: `cp-${slug}-model-name` }, "Display name"), addName),
      ),
      h(
        "div",
        { class: "row" },
        h(
          "button",
          {
            type: "button",
            class: "ghost",
            onclick: async () => {
              if (!addId.value.trim()) {
                msg.textContent = "Type a model id first.";
                return;
              }
              try {
                await api(`/api/owner/companies/${id}/providers/${cp.id}/models`, {
                  method: "POST",
                  body: {
                    id: addId.value.trim(),
                    display_name: addName.value.trim() || undefined,
                  },
                });
                renderModels();
              } catch (err) {
                msg.textContent = err.message;
              }
            },
          },
          "Add model",
        ),
        h(
          "button",
          {
            type: "button",
            class: "ghost",
            onclick: async () => {
              try {
                const r = await api(`/api/owner/companies/${id}/providers/${cp.id}/test`, {
                  method: "POST",
                  body: {},
                });
                msg.textContent = r.ok ? `Works: ${r.detail}` : `Failed: ${r.detail}`;
                if (r.ok) renderModels();
              } catch (err) {
                msg.textContent = err.message;
              }
            },
          },
          "Test connection",
        ),
        h(
          "button",
          {
            type: "button",
            class: "danger",
            onclick: async () => {
              if (
                !confirm(
                  `Remove the custom provider ${cp.name}? Any stage using it must be re-picked.`,
                )
              )
                return;
              try {
                await api(`/api/owner/companies/${id}/providers/${cp.id}`, { method: "DELETE" });
                renderModels();
              } catch (err) {
                msg.textContent = err.message;
              }
            },
          },
          "Remove provider",
        ),
      ),
      msg,
    );
  };
  const customForm = () => {
    const name = h("input", {
      id: "cp-name",
      placeholder: "e.g. Local Ollama",
      autocomplete: "off",
    });
    const base = h("input", {
      id: "cp-base",
      placeholder: "https://…/v1",
      autocomplete: "off",
      spellcheck: false,
    });
    const format = h(
      "select",
      { id: "cp-format" },
      ["chat-completions", "anthropic-compatible", "responses-api", "google-generative-ai"].map(
        (f) => h("option", { value: f }, f),
      ),
    );
    const auth = h(
      "select",
      { id: "cp-auth" },
      ["bearer", "api-key-header", "custom-header"].map((a) => h("option", { value: a }, a)),
    );
    const headerName = h("input", {
      id: "cp-header",
      placeholder: "Header name, e.g. X-Api-Key",
      autocomplete: "off",
      disabled: true,
    });
    const cred = h("input", {
      id: "cp-cred",
      type: "password",
      placeholder: "API key",
      autocomplete: "new-password",
    });
    const msg = h("p", { class: "note", role: "status" });
    auth.addEventListener("change", () => {
      headerName.disabled = auth.value !== "custom-header";
    });
    return h(
      "div",
      { class: "custom-provider" },
      h("h4", {}, "Add a custom provider"),
      h(
        "p",
        { class: "note" },
        "Name, endpoint and key. The endpoint is stored in the database and resolved by the server — the app never supplies one (D-082). Only chat-completions over Bearer is wired to calls this round; other formats are stored for later.",
      ),
      h(
        "div",
        { class: "formgrid" },
        h("div", {}, h("label", { for: "cp-name" }, "Name"), name),
        h("div", {}, h("label", { for: "cp-base" }, "Base URL"), base),
        h("div", {}, h("label", { for: "cp-format" }, "Format"), format),
        h("div", {}, h("label", { for: "cp-auth" }, "Auth mode"), auth),
        h("div", {}, h("label", { for: "cp-header" }, "Custom header name"), headerName),
        h("div", {}, h("label", { for: "cp-cred" }, "API key"), cred),
      ),
      h(
        "div",
        { class: "row" },
        h(
          "button",
          {
            type: "button",
            class: "primary",
            onclick: async () => {
              if (!name.value.trim() || !base.value.trim()) {
                msg.textContent = "Name and base URL are required.";
                return;
              }
              try {
                await api(`/api/owner/companies/${id}/providers`, {
                  method: "POST",
                  body: {
                    name: name.value.trim(),
                    base_url: base.value.trim(),
                    format: format.value,
                    auth_mode: auth.value,
                    ...(auth.value === "custom-header"
                      ? { auth_header: headerName.value.trim() }
                      : {}),
                    credential: cred.value || undefined,
                  },
                });
                renderModels();
                toast("Custom provider added");
              } catch (err) {
                msg.textContent = err.message;
              }
            },
          },
          "Add provider",
        ),
      ),
      msg,
    );
  };
  customBox.replaceChildren(
    h("h3", {}, "Custom providers"),
    h(
      "p",
      { class: "note" },
      "Providers you add here belong to this company only. Switch a model off and any stage using it must be re-picked — it never falls back silently.",
    ),
    ...customProviders.map(customProviderBlock),
    customForm(),
  );

  // --- built-in models: enable toggles (D-081) -------------------------------------------------
  // Seed models are platform-wide; toggling one calls the platform override endpoint
  // (PATCH /api/owner/providers/{pid}/models/{mid}). A switched-off model stops being
  // offered in the stage rows below; stages already using it keep working until re-picked.
  const builtinBox = h("div", {});
  builtinBox.replaceChildren(
    h("h3", {}, "Built-in models"),
    h(
      "p",
      { class: "note" },
      "Switch a model off and it stops being offered for new picks. Stages already using it keep working until re-picked — they never fall back silently.",
    ),
    ...providers
      .filter((p) => !p.custom)
      .map((p) => {
        const models = modelsOf(p);
        const msg = h("p", { class: "note", role: "status" });
        return h(
          "div",
          { class: "custom-provider" },
          h("h4", {}, p.name),
          models.length
            ? h(
                "ul",
                { class: "plain" },
                models.map((m) =>
                  h(
                    "li",
                    {},
                    h(
                      "label",
                      {},
                      h("input", {
                        type: "checkbox",
                        checked: m.enabled,
                        onchange: async (e) => {
                          try {
                            await api(
                              `/api/owner/providers/${encodeURIComponent(p.id)}/models/${encodeURIComponent(m.id)}`,
                              { method: "PATCH", body: { enabled: e.target.checked } },
                            );
                            renderModels();
                          } catch (err) {
                            e.target.checked = !e.target.checked;
                            msg.textContent = err.message;
                          }
                        },
                      }),
                      ` ${m.name} `,
                      h("span", { class: "meta" }, m.id),
                    ),
                  ),
                ),
              )
            : h(
                "p",
                { class: "note" },
                "No fixed model list — any model id can be typed in the stage rows below.",
              ),
          msg,
        );
      }),
  );

  // --- per-stage routes ------------------------------------------------------------------------
  let unavailable = 0;
  const rows = routes.stages.map((stage) => {
    const mine = providers.filter((p) => p.kind === stage.kind);
    const prov = h(
      "select",
      { id: `prov-${stage.id}`, "aria-label": `Provider for ${stage.label}` },
      mine.map((p) => h("option", { value: p.id, selected: p.id === stage.provider_id }, p.name)),
    );
    const modelCell = h("div", {});
    const msg = h("span", { class: "note" });
    let modelCtl = null;
    const syncSave = () => {
      save.disabled = !modelCtl || modelCtl.value.trim() === "";
    };
    const fillModels = () => {
      const p = providers.find((x) => x.id === prov.value);
      const enabled = p ? enabledModels(p) : [];
      const current = stage.model;
      const inList = current && enabled.some((m) => m.id === current);
      modelCell.replaceChildren();
      msg.textContent = "";
      if (!enabled.length) {
        // No models listed for this provider (e.g. OpenRouter/OpenAI/Anthropic today):
        // free-text input, same as the platform routing view (D-093).
        modelCtl = h("input", {
          id: `model-${stage.id}`,
          placeholder: "Type a model id",
          value: current || "",
          autocomplete: "off",
          spellcheck: false,
        });
        modelCell.append(
          modelCtl,
          h("p", { class: "note" }, "No models listed for this provider — type one."),
        );
      } else {
        modelCtl = h("select", {
          id: `model-${stage.id}`,
          "aria-label": `Model for ${stage.label}`,
        });
        if (current && !inList) {
          if (stage.model_available === false) {
            // Server-flagged as disabled/removed: force a re-pick, never silently fall back.
            modelCtl.append(
              h(
                "option",
                { value: "", selected: true, disabled: true },
                `${current} (unavailable)`,
              ),
            );
            msg.textContent = "This model is disabled or removed — pick a new one.";
          } else {
            // Not in the seed list (e.g. set as free text on the platform view): keep it
            // selectable so saving does not silently change the route.
            modelCtl.append(h("option", { value: current, selected: true }, `${current} (custom)`));
          }
        }
        for (const m of enabled)
          modelCtl.append(h("option", { value: m.id, selected: m.id === current }, m.name));
        if (enabled.length > 6) {
          const f = h("input", {
            type: "search",
            placeholder: "Filter models…",
            "aria-label": `Filter models for ${stage.label}`,
          });
          f.addEventListener("input", () => {
            const q = f.value.trim().toLowerCase();
            for (const opt of modelCtl.options) {
              if (opt.value === "") continue;
              const hit =
                opt.textContent.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q);
              opt.hidden = !!q && !hit;
            }
          });
          modelCell.append(f);
        }
        modelCell.append(modelCtl);
      }
      modelCtl.addEventListener("change", syncSave);
      modelCtl.addEventListener("input", syncSave);
      syncSave();
    };
    const save = h(
      "button",
      {
        type: "button",
        class: "primary",
        onclick: async () => {
          try {
            await api(`/api/owner/companies/${id}/routes/${stage.id}`, {
              method: "PUT",
              body: { provider: prov.value, model: modelCtl.value.trim() },
            });
            msg.textContent = "Saved — the next call uses it";
            renderModels();
          } catch (err) {
            msg.textContent = err.message;
          }
        },
      },
      "Save",
    );
    // fillModels() calls syncSave(), which touches `save` — so it runs only after save exists.
    prov.addEventListener("change", fillModels);
    fillModels();
    const reset = h(
      "button",
      {
        type: "button",
        class: "ghost",
        disabled: stage.source !== "company",
        onclick: async () => {
          try {
            await api(`/api/owner/companies/${id}/routes/${stage.id}`, { method: "DELETE" });
            renderModels();
          } catch (err) {
            msg.textContent = err.message;
          }
        },
      },
      "Back to platform",
    );
    // The server's model_available flag is the authority (D-081): the seed list is only
    // suggestions, so a model merely absent from it is not "unavailable".
    const isUnavailable = !!stage.model && stage.model_available === false;
    if (isUnavailable) unavailable += 1;
    return h(
      "tr",
      {},
      h("td", {}, stage.label),
      h(
        "td",
        {},
        stage.provider_id && stage.model ? `${stage.provider_id} / ${stage.model}` : "—",
        isUnavailable ? h("span", { class: "status bad" }, " unavailable") : null,
        h("span", { class: "meta" }, ` ${stage.source}`),
        stage.benchmark
          ? h("span", { class: "meta" }, ` · p95 ${stage.benchmark.p95_ms} ms`)
          : null,
      ),
      h(
        "td",
        {},
        h("div", { class: "pick" }, h("label", { for: `prov-${stage.id}` }, "Provider"), prov),
        h("div", { class: "pick" }, h("label", { for: `model-${stage.id}` }, "Model"), modelCell),
      ),
      h("td", {}, save, " ", reset, " ", msg),
    );
  });
  const companyRoutes = routes.stages.filter((s) => s.source === "company").length;
  tileState.models = {
    status: unavailable ? "bad" : companyRoutes ? "ok" : "neutral",
    stages: routes.stages.length,
    companyRoutes,
    unavailable,
  };
  $("#modelsTitle").textContent =
    `Models (${routes.stages.length} stages` +
    (unavailable ? ` · ${unavailable} unavailable` : "") +
    ")";
  box.replaceChildren(
    h(
      "p",
      { class: "note" },
      routes.byo
        ? "This company uses its own keys for its own model choices."
        : "Setting a model turns BYO on for this company — its own keys pay for its own choices.",
    ),
    customBox,
    builtinBox,
    h(
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
            h("th", {}, "Stage"),
            h("th", {}, "Now"),
            h("th", {}, "Change to"),
            h("th", {}, ""),
          ),
        ),
        h("tbody", {}, ...rows),
      ),
    ),
  );
  renderTiles();
}
