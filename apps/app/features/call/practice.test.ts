/** Practice call in a real account (D-073): the script plays on the engine, the hello list never
 * offers it, and once it ends nothing is written to device history, the server, review,
 * learning or the manager's inbox. A real call right after works as before. */
import type { CallBundle } from "@sotto/engine";
import practiceSeed from "../../../../seed/practice/practice.json";

const mockReviewCall = jest.fn(async () => null);
let mockOnEnded: ((s: unknown) => void) | null = null;
let mockOnEscalation: ((e: unknown) => void) | null = null;
let mockSend: ((m: unknown) => void) | null = null;
const mockHandled: unknown[] = [];
const mockRuntimeBundles: { scenarios: { id: string }[] }[] = [];
jest.mock("@sotto/engine", () => ({
  buildRuntime: (b: { scenarios: { id: string }[] }) => {
    mockRuntimeBundles.push(b);
    return { router: {}, company: {}, mode: "live" };
  },
  reviewCall: (...args: unknown[]) => mockReviewCall(...(args as [])),
  LocalCallBridge: class {
    constructor(opts: {
      onEnded: (s: unknown) => void;
      onEscalation: (e: unknown) => void;
      send: (m: unknown) => void;
    }) {
      mockOnEnded = opts.onEnded;
      mockOnEscalation = opts.onEscalation;
      mockSend = opts.send;
    }
    handle(msg: unknown) {
      mockHandled.push(msg);
    }
    close() {}
  },
}));
const mockApi = jest.fn(async () => ({}));
jest.mock("../../lib/cloud", () => ({
  CloudError: class extends Error {},
  cloudApi: (...args: unknown[]) => mockApi(...(args as [])),
  cloudState: () => ({
    status: "signed_in",
    me: { features: { call_review: { state: "available" } } },
  }),
  setCallLive: jest.fn(),
}));
const mockSave = jest.fn();
jest.mock("../../lib/deviceHistory", () => ({
  markReviewing: jest.fn(),
  saveDeviceCall: (...a: unknown[]) => mockSave(...a),
  setDeviceReview: jest.fn(),
}));
const mockLearn = jest.fn(async () => {});
jest.mock("../learning/learn", () => ({
  learnAfterCall: (...a: unknown[]) => mockLearn(...(a as [])),
}));
const mockBrief = jest.fn(async () => {});
jest.mock("../crm/attached", () => ({
  attachedBriefText: () => "",
  attachedCallName: () => null,
  attachedContact: () => null,
  saveBriefFor: (...a: unknown[]) => mockBrief(...(a as [])),
}));

import { connectLocal } from "./local";
import { practiceRun, practiceScenario, setPracticeRun } from "./practice";

const CALL = "11111111-1111-4111-8111-111111111111";
const SUMMARY = { call_id: CALL, started_at: Date.now(), cards: 2, p50_ms: 1, p95_ms: 1 };
const handlers = { onStatus: jest.fn(), onMessage: jest.fn() };
const bundle = {
  prompts: { review: {} },
  plan: { can_call: true },
  scenarios: [],
  practice: practiceSeed,
} as unknown as CallBundle;

function hello(scenarios: { id: string; title: string }[]) {
  return { type: "hello", v: 1, company_name: "Acme", mode: "live", scenarios, stt_vendor: null };
}

beforeEach(() => {
  for (const m of [mockReviewCall, mockApi, mockSave, mockLearn, mockBrief, handlers.onMessage])
    m.mockClear();
  mockHandled.length = 0;
  mockRuntimeBundles.length = 0;
  setPracticeRun(false);
});

describe("practice seed", () => {
  it("is one neutral script with no company data", () => {
    const s = practiceScenario(bundle);
    expect(s?.id).toBe("practice:practice");
    expect(s?.lines.some((l) => l.speaker === "customer")).toBe(true);
    const text = JSON.stringify(practiceSeed).toLowerCase();
    for (const word of ["palm grove", "realty", "aed", "dubai", "apartment"])
      expect(text).not.toContain(word);
  });

  it("is absent from an older bundle", () => {
    expect(practiceScenario({ scenarios: [] } as unknown as CallBundle)).toBeNull();
  });
});

describe("a practice call", () => {
  it("plays on the engine but is never offered in the hello list", () => {
    connectLocal(bundle, handlers as never);
    expect(mockRuntimeBundles[0]?.scenarios.map((s) => s.id)).toEqual(["practice:practice"]);
    mockSend?.(hello([{ id: "practice:practice", title: "Practice call" }]));
    expect(handlers.onMessage).toHaveBeenLastCalledWith(expect.objectContaining({ scenarios: [] }));
  });

  it("leaves nothing behind after it ends", () => {
    const b = connectLocal(bundle, handlers as never);
    expect(b.send({ type: "start", scenario_id: "practice:practice" })).toBe(true);
    expect(practiceRun()).toBe(true);
    mockSend?.({ type: "call_started", call_id: CALL });
    mockSend?.({ type: "escalation", question: "How much?", call_id: CALL });
    mockOnEscalation?.({ question: "How much?", transcriptExcerpt: "", callId: CALL });
    mockOnEnded?.(SUMMARY);
    expect(mockSave).not.toHaveBeenCalled(); // device history
    expect(mockApi).not.toHaveBeenCalled(); // calls/start, escalations, usage, review numbers
    expect(mockReviewCall).not.toHaveBeenCalled();
    expect(mockLearn).not.toHaveBeenCalled();
    expect(mockBrief).not.toHaveBeenCalled();
    // No "sent to your manager" toast either.
    expect(handlers.onMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "escalation" }),
    );
    expect(practiceRun()).toBe(true); // the after-call view still knows it was practice
  });

  it("does not change the next real call", () => {
    const b = connectLocal(bundle, handlers as never);
    b.send({ type: "start", scenario_id: "practice:practice" });
    b.send({ type: "start", scenario_id: null });
    expect(practiceRun()).toBe(false);
    mockSend?.({ type: "call_started", call_id: CALL });
    mockOnEnded?.(SUMMARY);
    expect(mockApi).toHaveBeenCalledWith("/api/v1/calls/start", expect.anything());
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockApi).toHaveBeenCalledWith("/api/v1/usage", expect.anything());
  });
});
