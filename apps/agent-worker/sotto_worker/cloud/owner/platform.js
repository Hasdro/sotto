// Owner console, platform views (T-079): providers and keys, model routing, prompt studio,
// health board, Zoho clients and the sign-up queue. Uses $, h, api, toast, table, fmtDate and
// fmtWhen from owner.js (loaded first). Plain JS, strict CSP: no inline code.

const btn = (label, onclick, cls = "ghost", extra = {}) =>
  h("button", { type: "button", class: cls, onclick, ...extra }, label);
const status = (ok, text) => h("span", { class: `status ${ok ? "ok" : "bad"}` }, text);
const run = async (fn, done) => {
  try {
    await fn();
    if (done) toast(done);
  } catch (err) {
    toast(err.message);
  }
};
let ownerCompanies = [];
async function companyOptions(select, withNone = false) {
  ownerCompanies = (await api("/api/owner/companies")).companies;
  select.replaceChildren(
    ...(withNone ? [h("option", { value: "" }, "—")] : []),
    ...ownerCompanies.map((c) => h("option", { value: c.id }, c.name)),
  );
}
function oneTimeSecret(title, body, value) {
  const p = $("#secretDialog p");
  const before = p.textContent;
  p.textContent = body;
  showSecret(title, value);
  $("#secretDialog").addEventListener("close", () => (p.textContent = before), { once: true });
}

// --- providers and keys --------------------------------------------------------------------
async function loadProviders() {
  renderProviders(await api("/api/owner/providers"));
  renderByo((await api("/api/owner/byo")).companies);
}
function renderProviders(data) {
  $("#providers tbody").replaceChildren(
    ...data.providers.map((p) => {
      const input = h("input", {
        type: "password",
        autocomplete: "off",
        spellcheck: "false",
        "aria-label": `New ${p.name} key`,
        placeholder: p.key_set ? "Replace key" : "Paste key",
      });
      const save = async () => {
        if (!input.value.trim()) return toast("Paste the key first");
        await run(async () => {
          renderProviders(
            await api(`/api/owner/keys/${p.key_env}`, {
              method: "PUT",
              body: { value: input.value.trim() },
            }),
          );
        }, `${p.name} key saved`);
      };
      return h(
        "tr",
        {},
        h(
          "th",
          { scope: "row" },
          p.name,
          h("br"),
          h("a", { href: p.key_page, target: "_blank", rel: "noopener noreferrer" }, "Get a key"),
          h("small", { class: "kill-note" }, ` ${p.kind.toUpperCase()} · ${p.free || ""}`),
        ),
        h(
          "td",
          {},
          p.key_set ? status(true, `Saved ${fmtDate(p.updated_at)}`) : h("span", {}, "Not set"),
          p.retiring
            ? h(
                "small",
                { class: "kill-note" },
                h("br"),
                `Rotated ${fmtWhen(p.retiring.rotated_at)}; old key retiring until ${fmtWhen(p.retiring.retire_at)}. Revoke it at the vendor after that.`,
              )
            : null,
        ),
        h(
          "td",
          {},
          p.test ? status(p.test.ok, `${p.test.ok ? "Works" : "Failed"} · ${p.test.detail}`) : "—",
        ),
        h("td", {}, input),
        h(
          "td",
          { class: "act" },
          btn(p.key_set ? "Replace" : "Save", save, p.key_set ? "ghost" : "primary"),
          p.key_set
            ? btn(
                "Rotate",
                () => {
                  if (!input.value.trim()) return toast("Paste the next key first");
                  return run(async () => {
                    renderProviders(
                      await api(`/api/owner/keys/${p.key_env}/rotate`, {
                        method: "POST",
                        body: { value: input.value.trim() },
                      }),
                    );
                  }, `${p.name}: apps switch to the next key within 10 minutes`);
                },
                "primary",
                {
                  title:
                    "Apps switch on their next config refresh; the old key retires after 20 minutes",
                },
              )
            : null,
          p.key_set
            ? btn("Test", () =>
                run(async () => {
                  const r = await api(`/api/owner/keys/${p.key_env}/test`, {
                    method: "POST",
                    body: {},
                  });
                  renderProviders(r);
                  toast(`${p.name}: ${r.result.detail}`);
                }),
              )
            : null,
          p.key_set
            ? btn(
                "Remove",
                async () => {
                  if (
                    !(await confirmAction({
                      title: `Remove ${p.name} key?`,
                      body: `Live calls routed to ${p.name} will fail until a new key is saved or routes are switched.`,
                      blast: "Affects: every non-BYO company using this provider.",
                      confirmLabel: "Remove key",
                    }))
                  )
                    return;
                  await run(async () => {
                    renderProviders(
                      await api(`/api/owner/keys/${p.key_env}`, { method: "DELETE" }),
                    );
                  }, `${p.name} key removed`);
                },
                "danger",
              )
            : null,
        ),
      );
    }),
  );
}
function renderByo(list) {
  $("#byoList").replaceChildren(
    list.length
      ? h(
          "ul",
          { class: "plain" },
          list.map((c) =>
            h(
              "li",
              {},
              h(
                "label",
                {},
                h("input", {
                  type: "checkbox",
                  checked: c.byo,
                  onchange: (e) =>
                    run(
                      async () => {
                        await api(`/api/owner/companies/${c.id}/byo`, {
                          method: "PUT",
                          body: { enabled: e.target.checked },
                        });
                      },
                      `${c.name}: bring your own ${e.target.checked ? "on" : "off"}`,
                    ),
                }),
                ` ${c.name}`,
              ),
            ),
          ),
        )
      : h("p", { class: "empty" }, "No companies yet."),
  );
}

// --- model routing -------------------------------------------------------------------------
let providerList = [];
async function loadRouting() {
  renderRouting(await api("/api/owner/providers"));
}
function benchText(b) {
  if (!b) return "Never benchmarked — R1 not verified";
  return `${b.ok ? "Meets R1" : "Misses R1"} · p50 ${b.p50_ms ?? "—"} · p95 ${b.p95_ms ?? "—"} ms · ${fmtDate(b.at)}`;
}
function keySourceBadge(ks) {
  if (!ks) return null;
  if (ks.source === "missing")
    return h("span", { class: "status bad" }, ks.label || "No key — will fail");
  const when = ks.updated_at ? ` · saved ${fmtDate(ks.updated_at)}` : "";
  return h("span", { class: "status ok" }, `${ks.label}${when}`);
}
function renderRouting(data) {
  providerList = data.providers;
  const unbenchmarked = data.stages.filter((s) => s.live && !s.benchmark);
  const banner = $("#routingBanner");
  if (banner) {
    banner.replaceChildren(
      ...(unbenchmarked.length
        ? [
            h(
              "div",
              { class: "panel attention-item warn" },
              h(
                "div",
                { class: "attention-copy" },
                h(
                  "span",
                  { class: "status warn" },
                  `${unbenchmarked.length} live stage(s) have never been benchmarked against R1 (1,500 ms)`,
                ),
                h(
                  "span",
                  { class: "meta" },
                  "Enable the weekly Routing job to verify live stages meet R1.",
                ),
              ),
              btn("Open Routing job", () => show("routingjob"), "primary"),
            ),
          ]
        : []),
    );
  }
  $("#routing tbody").replaceChildren(
    ...data.stages.map((s) => {
      const vendors = providerList.filter((p) => p.kind === s.kind && p.client);
      const pick = h(
        "select",
        { "aria-label": `Vendor for ${s.label}` },
        vendors.map((p) => h("option", { value: p.id, selected: p.id === s.provider_id }, p.name)),
      );
      const model = h("input", {
        "aria-label": `Model for ${s.label}`,
        value: s.model || "",
        spellcheck: "false",
        autocomplete: "off",
      });
      const prev = s.history.length > 0;
      const liveLabel = s.live ? (s.benchmark?.ok ? " Live" : " Live (unverified)") : null;
      return h(
        "tr",
        {},
        h(
          "th",
          { scope: "row" },
          s.label,
          liveLabel ? h("small", { class: "kill-note" }, liveLabel) : null,
        ),
        h(
          "td",
          {},
          `${s.provider_id || "—"} · ${s.model || "—"}`,
          h("br"),
          h("small", {}, s.source === "platform" ? "AGN choice" : "Default"),
          s.key_source ? h("br") : null,
          keySourceBadge(s.key_source),
        ),
        h(
          "td",
          {},
          s.benchmark
            ? status(s.benchmark.ok, benchText(s.benchmark))
            : h("span", { class: "status warn" }, benchText(null)),
        ),
        h("td", {}, pick, " ", model),
        h(
          "td",
          { class: "act" },
          btn("Test stage", (e) =>
            run(async () => {
              e.target.disabled = true;
              e.target.textContent = "Testing…";
              try {
                const r = await api(`/api/owner/routes/${s.id}/test`, {
                  method: "POST",
                  body: {},
                });
                toast(`${s.label}: ${r.ok ? "Pass" : "Fail"} (${r.latency_ms} ms) — ${r.detail}`);
              } finally {
                e.target.disabled = false;
                e.target.textContent = "Test stage";
              }
            }),
          ),
          btn(
            "Use",
            () =>
              run(async () => {
                renderRouting(
                  await api(`/api/owner/routes/${s.id}`, {
                    method: "PUT",
                    body: { provider: pick.value, model: model.value.trim() },
                  }),
                );
              }, `${s.label} changed; the next call uses it`),
            "primary",
          ),
          prev
            ? btn("Roll back", () =>
                run(async () => {
                  renderRouting(
                    await api(`/api/owner/routes/${s.id}/rollback`, { method: "POST", body: {} }),
                  );
                }, `${s.label} rolled back`),
              )
            : null,
          s.source === "platform"
            ? btn("Default", () =>
                run(async () => {
                  renderRouting(await api(`/api/owner/routes/${s.id}`, { method: "DELETE" }));
                }, `${s.label} back to the default`),
              )
            : null,
        ),
      );
    }),
  );
}

// --- prompt studio -------------------------------------------------------------------------
let promptData = null;
async function loadPrompts() {
  promptData = await api("/api/owner/prompts");
  const sel = $("#promptKey");
  const keep = sel.value;
  sel.replaceChildren(...promptData.prompts.map((p) => h("option", { value: p.key }, p.key)));
  if (keep) sel.value = keep;
  await companyOptions($("#promptCompany"), true);
  renderPrompt(true);
}
$("#promptKey").addEventListener("change", () => renderPrompt(true));
$("#promptScope").addEventListener("change", () => {
  $("#promptCompany").disabled = $("#promptScope").value !== "company";
});
function testText(t) {
  if (!t) return "Not tested";
  if (t.p95_ms === undefined) return `${t.passed ? "Pass" : "Fail"} · ${t.detail}`;
  return `${t.passed ? "Pass" : "Fail"} · quality ${Math.round(t.quality * 100)}% (seed ${Math.round((t.baseline_quality ?? 0) * 100)}%) · p50 ${t.p50_ms} · p95 ${t.p95_ms} ms · synthetic`;
}
function renderPrompt(resetBody) {
  const p =
    promptData.prompts.find((x) => x.key === $("#promptKey").value) || promptData.prompts[0];
  if (!p) return;
  $("#promptVars").textContent = `Variables: ${p.variables.join(", ") || "none"}`;
  $("#promptCompany").disabled = $("#promptScope").value !== "company";
  if (resetBody) $("#promptBody").value = p.seed.body;
  const name = (id) => ownerCompanies.find((c) => c.id === id)?.name || "a company";
  const rows = [
    ...[...p.versions].reverse().map((v) =>
      h(
        "tr",
        {},
        h("th", { scope: "row" }, `v${v.version}`),
        h("td", {}, v.scope === "platform" ? "Platform" : `${v.scope}: ${name(v.company_id)}`),
        h(
          "td",
          {},
          v.status === "published"
            ? status(true, "Live")
            : v.status === "draft"
              ? "Draft"
              : "Earlier",
        ),
        h("td", {}, v.test ? status(v.test.passed, testText(v.test)) : "Not tested"),
        h(
          "td",
          { class: "act" },
          btn("Test", (e) =>
            run(async () => {
              e.target.disabled = true;
              e.target.textContent = "Testing…";
              await api(`/api/owner/prompts/${v.id}/test`, { method: "POST", body: {} });
              await loadPrompts();
            }, `v${v.version} tested`),
          ),
          v.status !== "published" && (v.test?.passed || v.published_at)
            ? btn(
                v.published_at ? "Roll back to this" : "Publish",
                () =>
                  run(async () => {
                    await api(`/api/owner/prompts/${v.id}/publish`, { method: "POST", body: {} });
                    await loadPrompts();
                  }, `v${v.version} is live`),
                "primary",
              )
            : null,
          v.status === "published"
            ? btn("Back to default", () =>
                run(async () => {
                  await api(`/api/owner/prompts/${v.id}/unpublish`, { method: "POST", body: {} });
                  await loadPrompts();
                }, "Default version is live again"),
              )
            : null,
        ),
      ),
    ),
    h(
      "tr",
      {},
      h("th", { scope: "row" }, `v${p.seed.version}`),
      h("td", {}, "Default (seed)"),
      h(
        "td",
        {},
        p.versions.some((v) => v.status === "published" && v.scope === "platform")
          ? "Earlier"
          : status(true, "Live"),
      ),
      h("td", {}, "—"),
      h("td", {}, ""),
    ),
  ];
  $("#promptVersions tbody").replaceChildren(...rows);
}
$("#promptForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const scope = $("#promptScope").value;
  $("#promptMsg").textContent = "";
  run(async () => {
    await api("/api/owner/prompts", {
      method: "POST",
      body: {
        key: $("#promptKey").value,
        body: $("#promptBody").value,
        scope,
        company_id: scope === "company" ? $("#promptCompany").value : undefined,
      },
    });
    await loadPrompts();
  }, "Draft saved; test it before publishing");
});

// --- health board (ZC-06) ------------------------------------------------------------------
async function loadHealth() {
  renderHealth(await api("/api/owner/health"));
}
function renderHealth(data) {
  const r = data.rule;
  $("#healthRule").textContent =
    `Auto-demotion: ${r.threshold} failures from at least ${r.min_companies} companies within ${r.window_min} min demote a vendor for ${r.demote_min} min. Manual demotion lasts ${r.manual_demote_min || 30} min.`;
  $("#health tbody").replaceChildren(
    ...data.providers.map((p) =>
      h(
        "tr",
        {},
        h("th", { scope: "row" }, p.name),
        h(
          "td",
          {},
          p.demoted
            ? status(
                false,
                `Demoted until ${new Date(p.until).toLocaleTimeString()}${p.manual ? " (by you)" : ""}`,
              )
            : status(true, "Primary as set"),
          p.reason && p.demoted ? h("small", { class: "kill-note" }, ` ${p.reason}`) : null,
        ),
        h("td", { class: "num" }, String(p.failures_10m)),
        h("td", { class: "num" }, String(p.companies_10m)),
        h("td", { class: "num" }, String(p.failures_24h)),
        h(
          "td",
          { class: "act" },
          p.demoted
            ? btn("Restore", () =>
                run(async () => {
                  renderHealth(await api(`/api/owner/health/${p.id}/demote`, { method: "DELETE" }));
                }, `${p.name} restored`),
              )
            : btn(
                "Demote 30 min",
                async () => {
                  if (
                    !(await confirmAction({
                      title: `Demote ${p.name} for 30 minutes?`,
                      body: `Calls will skip ${p.name} and use backup providers for 30 minutes.`,
                      blast: "Affects: every company · apps follow within 10 minutes.",
                      confirmLabel: "Demote 30 min",
                    }))
                  )
                    return;
                  await run(async () => {
                    renderHealth(
                      await api(`/api/owner/health/${p.id}/demote`, {
                        method: "POST",
                        body: { minutes: 30 },
                      }),
                    );
                  }, `${p.name} demoted; apps follow within 10 minutes`);
                },
                "danger",
              ),
        ),
      ),
    ),
  );
}

// --- Zoho clients (ZC-01) ------------------------------------------------------------------
async function loadZohoClients() {
  renderZohoClients(await api("/api/owner/zoho/clients"));
  await companyOptions($("#ovrCompany"));
}
function renderZohoClients(z) {
  $("#zohoMain").textContent = z.platform.configured
    ? `Client ID ends ${z.platform.client_id_ends ?? "…"} · home ${z.platform.dc ?? "—"} · saved ${fmtDate(z.platform.updated_at)}`
    : "No main client yet (Account › Zoho OAuth client).";
  $("#dcList").replaceChildren(
    z.dc_clients.length
      ? table(
          ["Data centre", "Client ID", "Saved", ""],
          z.dc_clients.map((c) => [
            c.dc,
            `ends ${c.client_id_ends}`,
            fmtDate(c.updated_at),
            btn(
              "Remove",
              async () => {
                if (
                  !(await confirmAction({
                    title: `Remove Zoho ${c.dc} client secret?`,
                    body: `Companies in the ${c.dc} data centre will lose Zoho refresh until a secret is saved again.`,
                    blast: `Affects: all companies on Zoho ${c.dc}.`,
                    confirmLabel: "Remove secret",
                  }))
                )
                  return;
                await run(async () => {
                  renderZohoClients(
                    await api(`/api/owner/zoho/clients/${c.dc}`, { method: "DELETE" }),
                  );
                }, `${c.dc} removed`);
              },
              "danger",
            ),
          ]),
        )
      : h(
          "p",
          { class: "empty" },
          "No per-data-centre secrets saved yet — the main Zoho client is used.",
        ),
  );
  $("#ovrList").replaceChildren(
    z.overrides.length
      ? table(
          ["Company", "Data centre", "Client ID", "Saved", ""],
          z.overrides.map((o) => [
            o.company,
            o.dc,
            `ends ${o.client_id_ends}`,
            fmtDate(o.updated_at),
            btn(
              "Remove",
              async () => {
                if (
                  !(await confirmAction({
                    title: `Remove Zoho override for ${o.company}?`,
                    body: `${o.company} will revert to the platform Zoho client and users may need to reconnect.`,
                    blast: `Affects: ${o.company}.`,
                    confirmLabel: "Remove override",
                  }))
                )
                  return;
                await run(async () => {
                  renderZohoClients(
                    await api(`/api/owner/companies/${o.company_id}/zoho-client`, {
                      method: "DELETE",
                    }),
                  );
                }, `${o.company} uses the AGN client again`);
              },
              "danger",
            ),
          ]),
        )
      : h("p", { class: "empty" }, "No company overrides yet — every company uses the AGN client."),
  );
}
$("#dcForm").addEventListener("submit", (e) => {
  e.preventDefault();
  run(async () => {
    renderZohoClients(
      await api(`/api/owner/zoho/clients/${$("#dcDc").value}`, {
        method: "PUT",
        body: { client_id: $("#dcId").value, client_secret: $("#dcSecret").value },
      }),
    );
    $("#dcSecret").value = "";
    $("#dcId").value = "";
  }, "Saved");
});
$("#ovrForm").addEventListener("submit", (e) => {
  e.preventDefault();
  run(async () => {
    renderZohoClients(
      await api(`/api/owner/companies/${$("#ovrCompany").value}/zoho-client`, {
        method: "PUT",
        body: {
          client_id: $("#ovrId").value,
          client_secret: $("#ovrSecret").value,
          dc: $("#ovrDc").value,
        },
      }),
    );
    $("#ovrSecret").value = "";
    $("#ovrId").value = "";
  }, "Override saved");
});

// --- sign-up queue (ZC-10) -----------------------------------------------------------------
async function loadSignups() {
  const data = await api("/api/owner/signups");
  $("#hookUrl").textContent = `${location.origin}/hooks/zoho-forms/signup`;
  $("#hookState").textContent = data.secret_set_at
    ? `Secret set ${fmtDate(data.secret_set_at)}. It is shown only once; make a new one if it is lost.`
    : "No secret yet: the webhook refuses every sign-up until you make one.";
  const refEl = $("#hookRefused");
  if (refEl) {
    if (data.refused_count > 0) {
      refEl.hidden = false;
      refEl.textContent = `Refused sign-up attempts (missing or wrong secret): ${data.refused_count}${data.refused_last_at ? ` · last ${fmtWhen(data.refused_last_at)}` : ""}.`;
    } else {
      refEl.hidden = true;
    }
  }
  $("#signups tbody").replaceChildren(
    ...(data.signups.length
      ? data.signups.map((s) =>
          h(
            "tr",
            {},
            h("td", {}, fmtWhen(s.created_at)),
            h("th", { scope: "row" }, s.company),
            h("td", {}, s.name, h("br"), h("small", {}, s.email)),
            h(
              "td",
              {},
              s.status === "trial" || s.status === "active"
                ? status(
                    true,
                    s.status === "trial" ? `Trial to ${fmtDate(s.trial_ends_at)}` : "Active",
                  )
                : status(false, s.status === "deleted" ? "Deleted" : "Suspended"),
            ),
            h(
              "td",
              {},
              s.invited_at ? `Sent ${fmtWhen(s.invited_at)}` : "Not sent",
              h("br"),
              s.approved_at
                ? h("small", {}, `Approved ${fmtWhen(s.approved_at)}`)
                : h("small", {}, "Waiting: no AGN keys until approved"),
            ),
            h(
              "td",
              { class: "act" },
              s.company_id && !s.approved_at
                ? btn(
                    "Approve",
                    () =>
                      run(async () => {
                        await api(`/api/owner/signups/${s.id}/approve`, {
                          method: "POST",
                          body: {},
                        });
                        await loadSignups();
                      }, `${s.company} approved: calls use AGN's providers now`),
                    "primary",
                  )
                : null,
              s.company_id
                ? btn(s.status === "suspended" ? "Restore" : "Suspend", async () => {
                    const suspending = s.status !== "suspended";
                    if (
                      suspending &&
                      !(await confirmAction({
                        title: `Suspend ${s.company}?`,
                        body: "Live calls are blocked immediately; sign-in and history stay available.",
                        blast: `Affects: all users at ${s.company}.`,
                        confirmLabel: "Suspend company",
                      }))
                    )
                      return;
                    await run(
                      async () => {
                        await api(`/api/owner/companies/${s.company_id}`, {
                          method: "PATCH",
                          body: { suspended: suspending },
                        });
                        await loadSignups();
                      },
                      suspending ? "Suspended: calls are blocked" : "Restored",
                    );
                  })
                : null,
              s.company_id
                ? btn(
                    "Delete",
                    async () => {
                      if (
                        !(await confirmAction({
                          title: `Delete ${s.company}?`,
                          body: "Permanently deletes this company, its users, devices, calls, and settings. This cannot be undone.",
                          blast: `Affects: ${s.company} · irreversible.`,
                          confirmLabel: "Delete company",
                          requireText: s.company,
                        }))
                      )
                        return;
                      await run(async () => {
                        await api(
                          `/api/owner/companies/${s.company_id}?confirm=${encodeURIComponent(s.company)}`,
                          { method: "DELETE" },
                        );
                        await loadSignups();
                      }, "Deleted");
                    },
                    "danger",
                  )
                : null,
            ),
          ),
        )
      : [h("tr", {}, h("td", { colspan: 6, class: "empty" }, "No sign-ups yet."))]),
  );
}
$("#hookRotate").addEventListener("click", () =>
  run(async () => {
    const r = await api("/api/owner/signups/secret", { method: "POST", body: {} });
    oneTimeSecret(
      "Webhook secret",
      `Put this in Zoho Forms as the value of the custom header ${r.header}. The old secret stops working now. It is not shown again.`,
      r.secret,
    );
    await loadSignups();
  }),
);
$("#hookTest")?.addEventListener("click", () =>
  run(async () => {
    await api("/api/owner/signups/test", { method: "POST", body: {} });
    await loadSignups();
  }, "Test sign-up added to the queue"),
);

// --- routing job (ZC-05) ---------------------------------------------------------------------
const JOB_STATE = {
  cap_unset: ["bad", "Off · Set a monthly cap to enable"],
  waiting_golden: ["bad", "Waiting for golden calls"],
  ready: ["ok", "Ready · runs weekly"],
};
async function loadRoutingJob() {
  await companyOptions($("#routingDemo"), true);
  renderRoutingJob(await api("/api/owner/routing-job"));
}
function renderRoutingJob(s) {
  const [tone, text] = JOB_STATE[s.status] || ["bad", s.status];
  const lines = [
    h("h2", {}, "State"),
    h("p", {}, h("span", { class: `status ${tone}` }, text)),
    h(
      "p",
      { class: "note" },
      s.monthly_cap_usd === null
        ? "Monthly cap: not set. Nothing runs and nothing is spent."
        : `Monthly cap: ${s.monthly_cap_usd.toFixed(2)} USD · spent this month: ${s.spent_usd.toFixed(2)} USD`,
    ),
  ];
  if (s.status === "waiting_golden")
    lines.push(
      h(
        "p",
        { class: "note" },
        "The job is built and tested on the synthetic calls; it benchmarks real models only on recorded golden calls (P0.5), which do not exist yet.",
      ),
    );
  for (const c of s.canaries)
    lines.push(
      h(
        "p",
        {},
        `Canary on ${c.stage}: ${c.provider_id}/${c.model} since ${fmtWhen(c.since)} (benchmark p95 ${c.bench_p95} ms)`,
      ),
    );
  $("#routingJobState").replaceChildren(...lines);
  $("#routingCap").value = s.monthly_cap_usd ?? "";
  $("#routingDemo").value = s.demo_company_id ?? "";
  $("#routingRuns tbody").replaceChildren(
    ...(s.runs.length
      ? s.runs.map((r) =>
          h(
            "tr",
            {},
            h("td", {}, fmtWhen(r.at)),
            h("td", {}, r.status),
            h("td", {}, r.source),
            h(
              "td",
              {},
              r.detail
                .map((d) => `${d.stage}: ${d.staged || d.canary || d.result || ""}`)
                .join("; ") || "—",
            ),
          ),
        )
      : [h("tr", {}, h("td", { colspan: "4" }, "No runs yet."))]),
  );
}
const saveRoutingJob = (body) =>
  run(async () => {
    renderRoutingJob(await api("/api/owner/routing-job", { method: "PUT", body }));
  }, "Routing job saved");
$("#routingJobSave").addEventListener("click", () => {
  const raw = $("#routingCap").value.trim();
  const body = { demo_company_id: $("#routingDemo").value || null };
  if (raw) body.monthly_cap_usd = Number(raw);
  return saveRoutingJob(body);
});
$("#routingCapClear").addEventListener("click", () => saveRoutingJob({ monthly_cap_usd: null }));
$("#routingToSpend")?.addEventListener("click", () => show("spend"));

// --- spend (ZC-12) -------------------------------------------------------------------------
const SPEND_STATE = {
  cap_not_set: ["warn", "No guardrail — set a cap"],
  ok: ["ok", "Under 80 %"],
  alert: ["warn", "Over 80 % · owner alerted"],
  capped: ["bad", "Cap reached · AGN keys withheld"],
};
async function loadSpend() {
  const data = await api("/api/owner/spend");
  const policyEl = $("#spendPolicy p");
  if (policyEl && data.at_cap_behaviour) policyEl.textContent = data.at_cap_behaviour;
  $("#spendNote").textContent =
    `Estimates from seed/models/prices.yaml (checked ${data.checked}); not a vendor bill. Stages a company runs on its own keys (BYO) are not counted.`;
  $("#spend tbody").replaceChildren(
    ...data.companies.map((c) => {
      const input = h("input", {
        type: "number",
        min: "1",
        step: "1",
        inputmode: "decimal",
        "aria-label": `New monthly cap for ${c.name}`,
        placeholder: c.cap_usd === null ? "Not set" : String(c.cap_usd),
      });
      const [tone, text] = SPEND_STATE[c.status];
      const pctNum = c.ratio === null ? null : Math.min(100, Math.round(c.ratio * 100));
      const pct = c.ratio === null ? "" : ` · ${Math.round(c.ratio * 100)} %`;
      const bar = (() => {
        if (pctNum === null) return null;
        const fill = h("div", { class: `fill ${tone === "ok" ? "" : tone}` });
        fill.style.width = `${pctNum}%`;
        return h("div", { class: "minibar" }, h("div", { class: "track" }, fill));
      })();
      const put = (cap) =>
        run(
          async () => {
            await api(`/api/owner/companies/${c.id}/spend-cap`, {
              method: "PUT",
              body: { cap_usd: cap },
            });
            await loadSpend();
          },
          cap === null ? `${c.name}: cap removed` : `${c.name}: cap saved`,
        );
      return h(
        "tr",
        {},
        h("th", { scope: "row" }, c.name),
        h("td", { class: "num" }, `${c.spend_usd.toFixed(2)} USD`),
        h("td", { class: "num" }, c.cap_usd === null ? "—" : `${c.cap_usd.toFixed(2)} USD`),
        h("td", {}, h("span", { class: `status ${tone}` }, text + pct), bar),
        h("td", {}, input),
        h(
          "td",
          { class: "act" },
          btn(
            "Set cap",
            () =>
              input.value.trim() ? put(Number(input.value)) : toast("Enter a cap in US dollars"),
            "primary",
          ),
          c.cap_usd === null ? null : btn("Remove cap", () => put(null)),
        ),
      );
    }),
  );
}

window.platformViews = {
  providers: loadProviders,
  routingjob: loadRoutingJob,
  spend: loadSpend,
  routing: loadRouting,
  prompts: loadPrompts,
  health: loadHealth,
  zoho: loadZohoClients,
  signups: loadSignups,
};
