// Company profile (round 2, D-078): one page per company, opened in a new tab from Companies.
// Same origin, same owner sign-in. Plain JS, no build step, strict CSP (no inline code).

const $ = (s, el = document) => el.querySelector(s);
const DAY = 86400000;
const id = new URLSearchParams(location.search).get("id");
let c = null;

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
}
load().catch((err) => {
  if (err.message !== "signed out") toast(err.message);
});

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
function smtpForm(actions) {
  const host = h("input", {
    autocomplete: "off",
    spellcheck: false,
    placeholder: "smtp.hostinger.com",
  });
  const port = h(
    "select",
    {},
    h("option", { value: "465", selected: true }, "465 · SSL"),
    h("option", { value: "587" }, "587 · STARTTLS"),
  );
  const user = h("input", { autocomplete: "off", spellcheck: false });
  const pass = h("input", { type: "password", autocomplete: "new-password" });
  const fromName = h("input", { autocomplete: "off" });
  const from = h("input", { type: "email", autocomplete: "off" });
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
    msg.textContent = s.configured ? "" : "No mailbox saved yet.";
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
      h(
        "div",
        { class: "formgrid" },
        h("div", {}, h("label", {}, "SMTP server"), host),
        h("div", {}, h("label", {}, "Port"), port),
        h("div", {}, h("label", {}, "Username"), user),
        h("div", {}, h("label", {}, "Password (empty keeps the saved one)"), pass),
        h("div", {}, h("label", {}, "From name"), fromName),
        h("div", {}, h("label", {}, "From address"), from),
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
  const form = smtpForm({
    save: (d) => api(`/api/owner/companies/${id}/smtp`, { method: "PUT", body: d }),
    test: () => api(`/api/owner/companies/${id}/smtp/test`, { method: "POST", body: {} }),
    remove: () => api(`/api/owner/companies/${id}/smtp`, { method: "DELETE" }),
  });
  box.replaceChildren(
    h(
      "p",
      { class: "note" },
      status.active === "org"
        ? "This mailbox sends the company's email."
        : status.active === "platform"
          ? "No company mailbox: the platform mailbox sends the company's email."
          : "No mailbox anywhere: email cannot be sent for this company yet.",
    ),
    form.el,
  );
  form.fill(status.org);
}

async function renderUserSmtp() {
  const box = $("#userSmtp");
  const pick = h(
    "select",
    {},
    c.users.map((u) => h("option", { value: u.id }, `${u.name} (${u.email})`)),
  );
  const form = smtpForm({
    save: (d) =>
      api(`/api/owner/companies/${id}/users/${pick.value}/smtp`, { method: "PUT", body: d }),
    test: () =>
      api(`/api/owner/companies/${id}/users/${pick.value}/smtp/test`, {
        method: "POST",
        body: {},
      }),
    remove: () =>
      api(`/api/owner/companies/${id}/users/${pick.value}/smtp`, { method: "DELETE" }),
  });
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
    h("div", { class: "formgrid" }, h("div", {}, h("label", {}, "User"), pick)),
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
  box.replaceChildren(
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
      : h("p", { class: "note" }, "All four fields exist on Deals. Stage and amount are never written."),
    msg,
  );
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
  const key = h("input", { autocomplete: "off", spellcheck: false, placeholder: "Gallabox API key" });
  const secret = h("input", {
    type: "password",
    autocomplete: "off",
    placeholder: "Gallabox API secret",
  });
  const account = h("input", { autocomplete: "off", spellcheck: false, placeholder: "Account ID" });
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
  box.replaceChildren(
    h(
      "p",
      { class: "note" },
      status.configured
        ? status.channel.set
          ? `Connected · ${status.channel.label} · ${status.templates.length} template(s) allowed`
          : "Keys saved · no WhatsApp number picked yet"
        : "Not connected. Save the keys, then pick a number and the templates.",
    ),
    h(
      "div",
      { class: "formgrid" },
      h("div", {}, h("label", {}, "API key (empty keeps the saved one)"), key),
      h("div", {}, h("label", {}, "API secret (empty keeps the saved one)"), secret),
      h("div", {}, h("label", {}, "Account ID"), account),
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
}

async function loadDiscover(pickers, status) {
  const found = await api(`/api/owner/companies/${id}/gallabox/discover`, {
    method: "POST",
    body: {},
  });
  const current = new Map(
    status.templates.map((t) => [`${t.name}/${t.language}`, t]),
  );
  const chan = h(
    "select",
    {},
    found.channels.map((ch) =>
      h("option", { value: ch.ref, selected: ch.selected }, ch.label),
    ),
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
  // Templates: a multi-select dropdown with checkboxes (was a full-screen list in the client).
  const items = found.templates.map((t) => {
    const k = `${t.name}/${t.language}`;
    const cur = current.get(k);
    const cb = h("input", { type: "checkbox", checked: !!cur });
    const mapping = {};
    const paramRows = t.params.map((p) => {
      const sel = h(
        "select",
        { "aria-label": `Source for ${p.name} in ${t.name}` },
        [
          h("option", { value: "" }, "agent types it"),
          ...SOURCES.map((s) =>
            h(
              "option",
              { value: s, selected: s === ((cur && cur.params.find((x) => x.name === p.name)?.source) || p.source || "") },
              s,
            ),
          ),
        ],
      );
      mapping[p.name] = sel;
      return h("div", {}, h("span", {}, `${p.name} `), sel);
    });
    return {
      k,
      cb,
      mapping,
      el: h("div", {}, h("label", {}, cb, ` ${t.name} (${t.language})`), ...paramRows),
    };
  });
  const summary = h("summary", {});
  const updateSummary = () => {
    const n = items.filter((i) => i.cb.checked).length;
    summary.textContent = `${n} of ${items.length} templates selected`;
  };
  for (const i of items) i.cb.addEventListener("change", updateSummary);
  updateSummary();
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
    h("div", { class: "formgrid" }, h("div", {}, h("label", {}, "Number"), chan)),
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
    h("details", {}, summary, ...items.map((i) => i.el)),
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
  box.replaceChildren(
    h("p", {}, st.configured ? `Configured · ${st.url}` : "Not configured"),
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
}

// --- Models: per-company routes ------------------------------------------------------------------
async function renderModels() {
  const box = $("#models");
  let routes;
  let provs;
  try {
    [routes, provs] = await Promise.all([
      api(`/api/owner/companies/${id}/routes`),
      api("/api/owner/providers"),
    ]);
  } catch (err) {
    box.replaceChildren(h("p", { class: "note" }, err.message));
    return;
  }
  const providers = provs.providers;
  const rows = routes.stages.map((stage) => {
    const mine = providers.filter((p) => p.kind === stage.kind);
    const prov = h(
      "select",
      { "aria-label": `Provider for ${stage.label}` },
      mine.map((p) =>
        h("option", { value: p.id, selected: p.id === stage.provider_id }, p.name),
      ),
    );
    const model = h("select", { "aria-label": `Model for ${stage.label}` });
    const fillModels = () => {
      const p = providers.find((x) => x.id === prov.value);
      model.replaceChildren(
        ...(p ? p.models : []).map((m) =>
          h("option", { value: m, selected: m === stage.model }, m),
        ),
      );
    };
    prov.addEventListener("change", fillModels);
    fillModels();
    const msg = h("span", { class: "note" });
    const save = h(
      "button",
      {
        type: "button",
        class: "primary",
        onclick: async () => {
          try {
            await api(`/api/owner/companies/${id}/routes/${stage.id}`, {
              method: "PUT",
              body: { provider: prov.value, model: model.value },
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
    return h(
      "tr",
      {},
      h("td", {}, stage.label),
      h(
        "td",
        {},
        stage.provider_id && stage.model
          ? `${stage.provider_id} / ${stage.model}`
          : "—",
        h("span", { class: "meta" }, ` ${stage.source}`),
        stage.benchmark
          ? h("span", { class: "meta" }, ` · p95 ${stage.benchmark.p95_ms} ms`)
          : null,
      ),
      h("td", {}, prov, " ", model),
      h("td", {}, save, " ", reset, " ", msg),
    );
  });
  box.replaceChildren(
    h(
      "p",
      { class: "note" },
      routes.byo
        ? "This company uses its own keys for its own model choices."
        : "Setting a model turns BYO on for this company — its own keys pay for its own choices.",
    ),
    h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        {},
        h(
          "thead",
          {},
          h("tr", {}, h("th", {}, "Stage"), h("th", {}, "Now"), h("th", {}, "Change to"), h("th", {}, "")),
        ),
        h("tbody", {}, ...rows),
      ),
    ),
  );
}
