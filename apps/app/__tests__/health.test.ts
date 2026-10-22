/** Health check rules (owner, 22 Oct): what is ready, what needs attention, what is not set. */
import type { Provider, ProvidersState, StageChoice } from "../features/keys/api";
import { assessHealth } from "../features/settings/Health";

const provider = (over: Partial<Provider>): Provider => ({
  id: "groq",
  name: "Groq",
  kind: "llm",
  key_page: "",
  steps: "",
  free: "",
  key_set: true,
  key_source: "panel",
  updated_at: 1,
  test: { ok: true, at: 1, detail: null },
  models: ["m"],
  ...over,
});

const stage = (over: Partial<StageChoice>): StageChoice => ({
  id: "suggest",
  label: "Suggest",
  kind: "llm",
  provider_id: "groq",
  model: "m",
  source: "panel",
  ...over,
});

const state = (over: Partial<ProvidersState> = {}): ProvidersState => ({
  providers: [provider({}), provider({ id: "assemblyai", name: "AssemblyAI", kind: "stt" })],
  stages: [
    stage({}),
    stage({ id: "stt", label: "Speech", kind: "stt", provider_id: "assemblyai" }),
  ],
  ...over,
});

const healthy = { server: true, providers: state(), mic: true, computer: true };

describe("health check", () => {
  it("says ready when the server, both keys, the microphone and the speed are fine", () => {
    const rows = assessHealth(healthy);
    expect(rows.map((r) => r.tone)).toEqual(["ok", "ok", "ok", "ok", "off"]);
    expect(rows.find((r) => r.id === "ai")?.text).toBe("Groq");
    expect(rows.find((r) => r.id === "stt")?.text).toBe("AssemblyAI");
  });

  it("flags a missing key, a failed test and a vendor the app cannot run", () => {
    const rows = assessHealth({
      ...healthy,
      providers: state({
        providers: [
          provider({ key_set: false }),
          provider({ id: "deepgram", name: "Deepgram", kind: "stt", client: false }),
        ],
        stages: [
          stage({}),
          stage({ id: "stt", label: "Speech", kind: "stt", provider_id: "deepgram" }),
        ],
      }),
    });
    expect(rows.find((r) => r.id === "ai")).toMatchObject({
      tone: "warn",
      detail: { key: "settings.health.noKey" },
    });
    expect(rows.find((r) => r.id === "stt")).toMatchObject({
      tone: "warn",
      detail: { key: "settings.health.notInApp" },
    });
    const failed = assessHealth({
      ...healthy,
      providers: state({
        providers: [provider({ test: { ok: false, at: 1, detail: "401" } })],
      }),
    });
    expect(failed.find((r) => r.id === "ai")?.detail.key).toBe("settings.health.testFailed");
  });

  it("uses the measured speed and warns above the 1.5 s target", () => {
    const fast = assessHealth({
      ...healthy,
      providers: state({
        stages: [
          stage({
            benchmark: { ok: true, p50_ms: 900, worst_ms: 1200, samples: 3, detail: "", at: 1 },
          }),
        ],
      }),
    });
    expect(fast.find((r) => r.id === "speed")).toMatchObject({
      tone: "ok",
      detail: { key: "settings.health.speedDetail", params: { ms: 900 } },
    });
    const slow = assessHealth({
      ...healthy,
      providers: state({
        stages: [
          stage({
            benchmark: { ok: true, p50_ms: 1800, worst_ms: 2200, samples: 3, detail: "", at: 1 },
          }),
        ],
      }),
    });
    expect(slow.find((r) => r.id === "speed")?.tone).toBe("warn");
  });

  it("flags an unreachable server, no microphone and no chosen stage", () => {
    const rows = assessHealth({
      server: false,
      providers: state({ stages: [] }),
      mic: false,
      computer: false,
    });
    expect(rows.find((r) => r.id === "server")?.tone).toBe("warn");
    expect(rows.find((r) => r.id === "mic")?.detail.key).toBe("settings.health.noMic");
    expect(rows.find((r) => r.id === "ai")?.tone).toBe("off");
    expect(rows.find((r) => r.id === "stt")?.tone).toBe("off");
  });

  it("survives a provider list it could not load", () => {
    const rows = assessHealth({ ...healthy, providers: null });
    expect(rows.find((r) => r.id === "ai")?.tone).toBe("off");
    expect(rows.find((r) => r.id === "speed")?.tone).toBe("off");
  });
});
