// Sample API answers for the owner console's platform views (T-079): providers and keys, model
// routing, prompt studio, health board, Zoho clients and the sign-up queue. Shared by
// scripts/a11y.mjs and scripts/panels-shots.mjs so both check the same filled tables.
export const PLATFORM_VIEWS = ["providers", "routing", "prompts", "health", "zoho", "signups"];

export function platformStubs(NOW, DAY) {
  return {
    "/api/owner/attention": {
      computed_at: NOW,
      items: [
        {
          id: "routing_job_off",
          severity: "amber",
          title: "Weekly R1 benchmarking is off",
          detail: "Set a monthly cap so candidate models are benchmarked.",
          view: "routingjob",
          href: "#v-routingjob",
          cta_label: "Enable routing job",
        },
      ],
    },
    "/api/owner/providers": {
      providers: [
        {
          id: "groq",
          name: "Groq",
          kind: "llm",
          key_env: "GROQ_API_KEY",
          key_page: "https://console.groq.com/keys",
          steps: "Sign up, create a key.",
          free: "Free tier",
          models: ["model-a"],
          client: true,
          key_set: true,
          updated_at: NOW - DAY,
          test: { ok: true, at: NOW - DAY, detail: "12 models available" },
        },
        {
          id: "gemini",
          name: "Google Gemini",
          kind: "llm",
          key_env: "GEMINI_API_KEY",
          key_page: "https://aistudio.google.com/apikey",
          steps: "Create a key.",
          free: "Free tier",
          models: [],
          client: true,
          key_set: false,
          updated_at: null,
          test: null,
        },
      ],
      stages: [
        {
          id: "suggest",
          label: "Live suggestion",
          kind: "llm",
          provider_id: "groq",
          model: "model-a",
          source: "platform",
          live: true,
          deadline_ms: 1150,
          benchmark: { ok: true, p50_ms: 410, p95_ms: 980, samples: 40, source: "replay", at: NOW },
          history: [{ id: 2, provider_id: "groq", model: "model-a", at: NOW }],
        },
      ],
    },
    "/api/owner/byo": { companies: [{ id: "c1", name: "Zylker Trading", byo: false }] },
    "/api/owner/prompts": {
      prompts: [
        {
          key: "suggest",
          stage: "suggest",
          variables: ["playbook.match", "transcript.last_60s"],
          seed: { version: 3, body: "You help a sales agent. {{playbook.match}}" },
          versions: [
            {
              id: "v4",
              key: "suggest",
              scope: "platform",
              scope_id: null,
              company_id: null,
              version: 4,
              body: "x",
              variables: [],
              note: "",
              status: "published",
              created_at: NOW,
              published_at: NOW,
              test: {
                passed: true,
                synthetic: true,
                quality: 0.95,
                baseline_quality: 0.95,
                p50_ms: 560,
                p95_ms: 960,
                detail: "ok",
              },
            },
          ],
        },
      ],
    },
    "/api/owner/health": {
      providers: [
        {
          id: "groq",
          name: "Groq",
          failures_10m: 7,
          counted_10m: 6,
          companies_10m: 2,
          failures_24h: 9,
          demoted: true,
          since: NOW - 60_000,
          until: NOW + 840_000,
          reason: "6 failures from 2 companies in 10 min",
          manual: false,
        },
        {
          id: "gemini",
          name: "Google Gemini",
          failures_10m: 0,
          counted_10m: 0,
          companies_10m: 0,
          failures_24h: 1,
          demoted: false,
          since: null,
          until: null,
          reason: null,
          manual: false,
        },
      ],
      rule: { threshold: 6, min_companies: 2, window_min: 10, demote_min: 15 },
    },
    "/api/owner/zoho/clients": {
      platform: { configured: true, dc: "us", client_id_ends: "0001", updated_at: NOW },
      dc_clients: [{ dc: "eu", client_id_ends: "0001", updated_at: NOW }],
      overrides: [
        {
          company_id: "c1",
          company: "Zylker Trading",
          dc: "in",
          client_id_ends: "0042",
          updated_at: NOW,
        },
      ],
    },
    "/api/owner/signups": {
      secret_set_at: NOW - DAY,
      signups: [
        {
          id: "s1",
          email: "lee@lead.example",
          name: "Lee Lead",
          company: "Lead Co",
          company_id: "c2",
          phone: "",
          created_at: NOW - 3_600_000,
          invited_at: NOW - 3_600_000,
          status: "trial",
          trial_ends_at: NOW + 13 * DAY,
          approved_at: null,
        },
      ],
    },
  };
}
