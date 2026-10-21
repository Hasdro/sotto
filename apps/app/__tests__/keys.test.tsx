import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import KeysScreen from "../app/admin/keys";
import { SignIn } from "../components/AccessGate";
import type { ProvidersState } from "../features/keys/api";
import { LocaleProvider } from "../lib/locale";

const KEY = `fake-${"k".repeat(20)}`;

function state(over: Partial<ProvidersState["providers"][number]> = {}): ProvidersState {
  return {
    providers: [
      {
        id: "groq",
        name: "Groq",
        kind: "llm",
        key_page: "https://console.groq.com/keys",
        steps: "Sign up, create a key.",
        free: "Free tier",
        key_set: false,
        key_source: null,
        updated_at: null,
        test: null,
        models: ["model-a"],
        ...over,
      },
      {
        id: "deepgram",
        name: "Deepgram",
        kind: "stt",
        key_page: "https://console.deepgram.com/",
        steps: "Sign up.",
        free: "$200 credit",
        key_set: true,
        key_source: "server",
        updated_at: null,
        test: null,
        models: ["nova-3"],
      },
    ],
    stages: [
      {
        id: "suggest",
        label: "Live suggestion (main)",
        kind: "llm",
        provider_id: "groq",
        model: "model-a",
        source: "default",
      },
    ],
  };
}

type Call = { url: string; method: string; body: unknown };

function mockFetch(responses: ProvidersState[]): Call[] {
  const calls: Call[] = [];
  let i = 0;
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const data = responses[Math.min(i++, responses.length - 1)];
    return { ok: true, status: 200, json: async () => data };
  }) as unknown as typeof fetch;
  return calls;
}

const wrap = async (ui: React.ReactElement) => render(<LocaleProvider>{ui}</LocaleProvider>);

describe("Keys & providers (P6.7)", () => {
  it("lists vendors by kind with their status and key page", async () => {
    mockFetch([state()]);
    await wrap(<KeysScreen />);
    expect(await screen.findByTestId("provider-groq")).toBeOnTheScreen();
    expect(screen.getByText("AI that writes the cards")).toBeOnTheScreen();
    expect(screen.getByText("Speech-to-text")).toBeOnTheScreen();
    expect(screen.getByText("No key")).toBeOnTheScreen();
    expect(screen.getByText("Key set on the server")).toBeOnTheScreen();
    expect(screen.getByTestId("get-key-groq")).toBeOnTheScreen();
  });

  it("saves a key once, clears the field and never shows it again", async () => {
    const calls = mockFetch([state(), state({ key_set: true, key_source: "panel" })]);
    await wrap(<KeysScreen />);
    await fireEvent.changeText(await screen.findByTestId("key-input-groq"), `  ${KEY} `);
    await fireEvent.press(screen.getByTestId("key-save-groq"));
    expect(calls[1]).toEqual({
      url: "http://127.0.0.1:8787/api/providers/groq/key",
      method: "PUT",
      body: { key: KEY },
    });
    expect(await screen.findByText("Key saved. It will not be shown again.")).toBeOnTheScreen();
    expect(screen.getByTestId("key-input-groq").props.value).toBe("");
    expect(screen.getByTestId("key-input-groq").props.secureTextEntry).toBe(true);
    expect(screen.queryByText(KEY)).toBeNull();
  });

  it("changes the vendor for a stage", async () => {
    const calls = mockFetch([state()]);
    await wrap(<KeysScreen />);
    await fireEvent.changeText(await screen.findByTestId("stage-suggest-model"), "model-b");
    await fireEvent.press(screen.getByTestId("stage-suggest-save"));
    expect(calls[1]).toEqual({
      url: "http://127.0.0.1:8787/api/stages/suggest",
      method: "PUT",
      body: { provider_id: "groq", model: "model-b" },
    });
  });

  it("does not let a speech stage pick a vendor the app cannot run", async () => {
    const data = state();
    const deepgram = data.providers[1];
    if (!deepgram) throw new Error("fixture has Deepgram");
    data.providers = [
      ...data.providers.slice(0, 1),
      { ...deepgram, client: false },
      { ...deepgram, id: "assemblyai", name: "AssemblyAI", client: true },
    ];
    data.stages = [
      {
        id: "stt",
        label: "Speech-to-text (main)",
        kind: "stt",
        provider_id: "assemblyai",
        model: "nova-3",
        source: "default",
      },
    ];
    const calls = mockFetch([data]);
    await wrap(<KeysScreen />);
    const off = await screen.findByTestId("stage-stt-vendor-deepgram");
    expect(off.props.accessibilityState?.disabled ?? off.props["aria-disabled"]).toBe(true);
    await fireEvent.press(off);
    expect(screen.getByTestId("stage-stt-save").props.accessibilityState?.disabled).toBe(true);
    expect(calls).toHaveLength(1);
    expect(screen.getAllByText(/not available in the app yet/).length).toBeGreaterThan(0);
  });

  function freshCompany(): ProvidersState {
    const fresh = state();
    const assembly = fresh.providers[1] as ProvidersState["providers"][number];
    fresh.providers = [
      fresh.providers[0] as ProvidersState["providers"][number],
      { ...assembly, id: "assemblyai", name: "AssemblyAI", key_set: false, key_source: null },
    ];
    fresh.stages = [
      ...fresh.stages,
      {
        id: "stt",
        label: "Speech-to-text (main)",
        kind: "stt",
        provider_id: "assemblyai",
        model: "nova-3",
        source: "default",
      },
    ];
    return fresh;
  }

  it("guides a new company through three setup steps (T-037)", async () => {
    mockFetch([freshCompany()]);
    await wrap(<KeysScreen />);
    expect(await screen.findByTestId("setup-checklist")).toBeOnTheScreen();
    expect(screen.getByTestId("setup-suggest")).toHaveTextContent(/Groq/);
    expect(screen.getByTestId("setup-stt")).toHaveTextContent(/AssemblyAI/);
    expect(screen.getByTestId("setup-playbook")).toHaveTextContent(/Add one playbook answer/);
  });

  it("drops the setup steps once both keys are set (T-037)", async () => {
    const done = freshCompany();
    for (const p of done.providers) p.key_set = true;
    mockFetch([done]);
    await wrap(<KeysScreen />);
    await screen.findByTestId("admin-keys");
    expect(screen.queryByTestId("setup-checklist")).toBeNull();
  });

  it("shows a stage's measured speed and measures it again on request (P6.4)", async () => {
    const measured = state();
    const stage = measured.stages[0];
    if (!stage) throw new Error("fixture has a stage");
    measured.stages = [
      {
        ...stage,
        deadline_ms: 700,
        live: true,
        benchmark: { ok: true, p50_ms: 520, worst_ms: 910, samples: 3, detail: "", at: 1 },
      },
    ];
    const calls = mockFetch([state(), measured]);
    await wrap(<KeysScreen />);
    expect(await screen.findByText("Speed not measured yet.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("measure-suggest"));
    expect(
      await screen.findByText(
        /First word: 520 ms typical, 910 ms slowest \(3 tries\)\. Slower than this job's 700 ms deadline/,
      ),
    ).toBeOnTheScreen();
    expect(calls[1]).toEqual({
      url: "http://127.0.0.1:8787/api/stages/suggest/benchmark",
      method: "POST",
      body: {},
    });
  });

  it("adds an endpoint of the owner's own and shows its address (P6.4)", async () => {
    const added = state();
    added.providers = [
      ...added.providers,
      {
        id: "custom-ollama",
        name: "Ollama",
        kind: "llm",
        key_page: "",
        steps: "",
        free: "",
        key_set: false,
        key_source: null,
        updated_at: null,
        test: null,
        models: [],
        custom: true,
        base_url: "http://localhost:11434/v1",
      },
    ];
    const calls = mockFetch([state(), added]);
    await wrap(<KeysScreen />);
    await fireEvent.changeText(await screen.findByTestId("endpoint-name"), "Ollama");
    await fireEvent.changeText(screen.getByTestId("endpoint-url"), "http://localhost:11434/v1");
    await fireEvent.press(screen.getByTestId("endpoint-add"));
    expect(await screen.findByText("http://localhost:11434/v1")).toBeOnTheScreen();
    expect(screen.getByTestId("endpoint-remove-custom-ollama")).toBeOnTheScreen();
    expect(screen.queryByTestId("get-key-custom-ollama")).toBeNull();
    expect(calls[1]).toEqual({
      url: "http://127.0.0.1:8787/api/endpoints",
      method: "POST",
      body: { name: "Ollama", base_url: "http://localhost:11434/v1", key: "" },
    });
  });

  it("explains how to start the server when it is not running", async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    await wrap(<KeysScreen />);
    expect(await screen.findByText("The keys panel needs the Sotto server")).toBeOnTheScreen();
  });
});

describe("access gate (D-020)", () => {
  it("signs in with the code and reports a wrong one", async () => {
    let status = 401;
    globalThis.fetch = jest.fn(async () => ({
      ok: status === 200,
      status,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const onSignedIn = jest.fn();
    await wrap(<SignIn onSignedIn={onSignedIn} />);
    await fireEvent.changeText(screen.getByTestId("gate-code"), "guess");
    await fireEvent.press(screen.getByTestId("gate-submit"));
    expect(await screen.findByText("That code is not right.")).toBeOnTheScreen();
    status = 200;
    await fireEvent.press(screen.getByTestId("gate-submit"));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
  });
});
