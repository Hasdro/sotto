/**
 * The D-020 server API the screens already speak (/api/providers, /api/playbook, /api/escalations,
 * /api/company/settings, /api/calls), answered from the management server and this device
 * (D-022). The screens stay unchanged; only lib/server.ts `api()` routes here when signed in.
 */
import {
  type CallBundle,
  checkKeyHost,
  makeLLM,
  PlaybookIndex,
  realClock,
  renderPrompt,
  type StageRoute,
} from "@sotto/engine";
import { cloudApi, cloudState, refreshCloud } from "./cloud";
import { deviceCall, deviceCalls } from "./deviceHistory";

type Init = { method?: string; body?: unknown };
const LIVE_STAGES = new Set(["trigger", "suggest", "suggest_backup"]);
const tests = new Map<string, { ok: boolean; at: number; detail: string }>();
const models = new Map<string, string[]>();
const benchmarks = new Map<
  string,
  {
    ok: boolean;
    p50_ms: number | null;
    worst_ms: number | null;
    samples: number;
    detail: string;
    at: number;
  }
>();

export class CompatError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function bundle(): CallBundle {
  const s = cloudState();
  if (s.status !== "signed_in" || !s.bundle) throw new CompatError(401, "sign in first");
  return s.bundle;
}

function providerOf(b: CallBundle, route: StageRoute | undefined): string | null {
  if (!route) return null;
  if (route.provider === "openai_compatible") {
    return (
      Object.entries(b.providers).find(([, p]) => p.key_env === route.api_key_env)?.[0] ?? null
    );
  }
  return route.provider in b.providers ? route.provider : null;
}

function providersState(result?: { ok: boolean; detail: string }) {
  const b = bundle();
  const status = b.key_status ?? {};
  const providers = Object.entries(b.providers).map(([id, p]) => {
    const updated = status[p.key_env] ?? null;
    const test = tests.get(id);
    return {
      id,
      name: p.name,
      kind: p.kind,
      key_page: p.key_page,
      steps: p.steps,
      free: p.free,
      key_set: updated !== null,
      key_source: updated !== null ? ("panel" as const) : null,
      updated_at: updated,
      test: test ? { ok: test.ok, at: test.at, detail: test.detail } : null,
      models: [...new Set([...p.models, ...(models.get(id) ?? [])])],
    };
  });
  const overrides = new Set(b.overrides ?? []);
  const stages = Object.entries(b.stage_slots).map(([id, slot]) => {
    const route = b.stages[id];
    const provider = providerOf(b, route);
    return {
      id,
      label: slot.label,
      kind: slot.kind,
      provider_id: provider,
      model: route?.model ?? null,
      source: overrides.has(id) ? ("panel" as const) : ("default" as const),
      deadline_ms: route?.first_token_ms ?? null,
      live: LIVE_STAGES.has(id),
      benchmark: (provider && route && benchmarks.get(`${provider}/${route.model}`)) || null,
    };
  });
  return { providers, stages, ...(result ? { result } : {}) };
}

async function testProvider(id: string) {
  await refreshCloud();
  const b = bundle();
  const p = b.providers[id];
  if (!p) throw new CompatError(404, "unknown provider");
  const at = Date.now();
  let detail = "";
  let ok = false;
  try {
    if (p.kind === "stt") {
      await cloudApi(`/api/v1/stt-token/${encodeURIComponent(id)}`, { method: "POST" });
      ok = true;
      detail = "The key works: the vendor issued a streaming token.";
    } else {
      const key = b.keys?.[p.key_env];
      if (!key) throw new Error("no key saved, or calls are blocked for this company");
      const base = p.base_url ?? "";
      const url = base.endsWith("/models") ? base : `${base.replace(/\/+$/, "")}/models`;
      checkKeyHost(p.key_env, url);
      const headers: Record<string, string> =
        id === "anthropic"
          ? {
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
              "anthropic-dangerous-direct-browser-access": "true",
            }
          : { authorization: `Bearer ${key}` };
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`${p.name} answered ${r.status}`);
      const data = (await r.json()) as { data?: { id: string }[] };
      const ids = (data.data ?? []).map((m) => m.id.replace(/^models\//, "")).slice(0, 60);
      models.set(id, ids);
      ok = true;
      detail = `The key works: ${ids.length} models available.`;
    }
  } catch (err) {
    detail = err instanceof Error ? err.message : "test failed";
  }
  tests.set(id, { ok, at, detail });
  return providersState({ ok, detail });
}

/** First-token time of the stage's model on three sample questions, from this device. */
async function measure(stage: string) {
  await refreshCloud();
  const b = bundle();
  const route = b.stages[stage];
  const prompt = b.prompts.suggest;
  if (!route || !prompt) throw new CompatError(400, "nothing to measure for this stage");
  const index = new PlaybookIndex(b.playbook);
  const questions = b.scenarios
    .flatMap((s) => s.lines)
    .filter((l) => l.speaker === "customer" && index.lookup(l.text) === null)
    .map((l) => l.text)
    .slice(0, 3);
  const llm = makeLLM(route, b.keys ?? {}, realClock);
  const times: number[] = [];
  for (const q of questions) {
    const text = renderPrompt(prompt.body, {
      "company.name": b.company.name,
      "company.tone": b.company.tone,
      "company.call_goal": b.company.call_goal,
      "playbook.match": "",
      "transcript.last_60s": `Customer: ${q}`,
      "turn.kind": "question",
      "turn.text": q,
      "card.language": "English",
    });
    const [system, user] = text.includes("---turn---") ? text.split("---turn---") : ["", text];
    const started = realClock.now();
    const ctrl = new AbortController();
    try {
      for await (const _chunk of llm.stream(
        {
          system: (system ?? "").trim(),
          messages: [{ role: "user", content: (user ?? "").trim() }],
          max_tokens: Number(route.settings?.max_tokens ?? 120),
          temperature: 0.2,
          settings: route.settings ?? {},
        },
        ctrl.signal,
      )) {
        times.push(realClock.now() - started);
        break;
      }
    } catch {
      /* a failed sample just does not count */
    } finally {
      ctrl.abort();
    }
  }
  const provider = providerOf(b, route) ?? route.provider;
  times.sort((a, z) => a - z);
  const result = times.length
    ? {
        ok: true,
        p50_ms: Math.round(times[Math.floor(times.length / 2)] ?? 0),
        worst_ms: Math.round(times.at(-1) ?? 0),
        samples: times.length,
        detail: "",
        at: Date.now(),
      }
    : {
        ok: false,
        p50_ms: null,
        worst_ms: null,
        samples: 0,
        detail: "the model did not answer",
        at: Date.now(),
      };
  benchmarks.set(`${provider}/${route.model}`, result);
  return providersState({
    ok: result.ok,
    detail: result.ok ? `First word in about ${result.p50_ms} ms` : result.detail,
  });
}

function playbookPayload() {
  const b = bundle();
  return {
    entries: b.playbook.map((e) => ({
      id: e.id,
      question: e.question,
      answer: e.short_answer,
      tags: e.tags,
      source: e.sample ? ("file" as const) : ("custom" as const),
      updated_at: null,
    })),
  };
}

type Escalation = {
  id: string;
  question: string;
  asked_at: number;
  status: string;
  answer: string | null;
};

/** Routes an old-server path to the management server. Unknown paths answer 404. */
export async function cloudCompat(path: string, init: Init = {}): Promise<unknown> {
  const method = (init.method ?? "GET").toUpperCase();
  const body = (init.body ?? {}) as Record<string, unknown>;
  const [p, query] = path.split("?");
  const parts = (p ?? "").split("/").filter(Boolean).map(decodeURIComponent); // ["api", …]
  const [, area, id, action] = parts;
  const enc = encodeURIComponent;

  if (area === "me") return { auth_required: false, signed_in: true };

  if (area === "providers") {
    if (!id && method === "GET") {
      await refreshCloud();
      return providersState();
    }
    const env = id ? bundle().providers[id]?.key_env : undefined;
    if (!id || !env) throw new CompatError(404, "unknown provider");
    if (action === "key" && method === "PUT") {
      await cloudApi(`/api/v1/company/keys/${enc(env)}`, {
        method: "PUT",
        body: { value: String(body.key ?? "") },
      });
      tests.delete(id);
      await refreshCloud();
      return providersState({ ok: true, detail: "saved" });
    }
    if (action === "key" && method === "DELETE") {
      await cloudApi(`/api/v1/company/keys/${enc(env)}`, { method: "DELETE" });
      tests.delete(id);
      await refreshCloud();
      return providersState({ ok: true, detail: "removed" });
    }
    if (action === "test") return testProvider(id);
  }

  if (area === "stages" && id) {
    if (action === "benchmark") return measure(id);
    if (method === "PUT") {
      await cloudApi(`/api/v1/company/routes/${enc(id)}`, {
        method: "PUT",
        body: { provider: body.provider_id, model: body.model },
      });
      await refreshCloud();
      return providersState({ ok: true, detail: "saved" });
    }
    if (method === "DELETE") {
      await cloudApi(`/api/v1/company/routes/${enc(id)}`, { method: "DELETE" });
      await refreshCloud();
      return providersState({ ok: true, detail: "reset" });
    }
  }

  if (area === "endpoints") {
    throw new CompatError(
      400,
      "Your own endpoints (Ollama, vLLM) are not on the hosted server yet. Use the Mac demo for them.",
    );
  }

  if (area === "company" && id === "settings") {
    if (method === "PUT") {
      const r = await cloudApi<{ settings: Record<string, unknown> }>("/api/v1/company/settings", {
        method: "PUT",
        body,
      });
      await refreshCloud();
      return { settings: { ...settingsFromBundle(), ...r.settings } };
    }
    return { settings: settingsFromBundle() };
  }

  if (area === "escalations") {
    if (!id) {
      const r = await cloudApi<{ items: Escalation[] }>("/api/v1/escalations");
      return { escalations: r.items };
    }
    const answer = String(body.answer ?? "");
    await cloudApi(`/api/v1/escalations/${enc(id)}/answer`, {
      method: "POST",
      body: { answer, add_to_playbook: action === "playbook" },
    });
    if (action === "playbook") await refreshCloud();
    return { ok: true };
  }

  if (area === "playbook") {
    if (id === "added") {
      const r = await cloudApi<{ items: Escalation[] }>("/api/v1/escalations");
      return {
        entries: r.items
          .filter((e) => e.status === "added" && e.answer)
          .map((e) => ({ id: e.id, question: e.question, answer: e.answer, added_at: e.asked_at })),
      };
    }
    if (method === "POST") await cloudApi("/api/v1/playbook", { method: "POST", body });
    if (method === "PUT" && id) {
      if (bundle().playbook.find((e) => e.id === id)?.sample) {
        throw new CompatError(400, "Sample entries cannot be edited. Add your own answer instead.");
      }
      await cloudApi(`/api/v1/playbook/${enc(id)}`, { method: "PUT", body });
    }
    if (method === "DELETE" && id)
      await cloudApi(`/api/v1/playbook/${enc(id)}`, { method: "DELETE" });
    await refreshCloud();
    return playbookPayload();
  }

  if (area === "calls") {
    if (id) {
      const call = deviceCall(id);
      if (!call)
        throw new CompatError(404, "this call's transcript is kept on the device that made it");
      return call;
    }
    return { calls: deviceCalls() };
  }

  void query;
  throw new CompatError(404, `not available on the hosted server: ${path}`);
}

function settingsFromBundle() {
  const c = bundle().company;
  return {
    ai_answers_allowed: c.ai_answers_allowed,
    backup_allowed: !c.backup_disabled.includes("suggest_backup"),
    agent_context: c.agent_context,
    card_language: c.card_language as "auto" | "en" | "ar",
  };
}
