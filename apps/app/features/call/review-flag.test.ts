/** Call review is a flagged feature (D-028, D-036): when it is off, the transcript never goes to
 * the after-call model, and the call still reports its numbers. */
import type { CallBundle } from "@sotto/engine";

const mockReviewCall = jest.fn(async () => null);
let mockOnEnded: ((s: unknown) => void) | null = null;
let mockSend: ((m: unknown) => void) | null = null;
jest.mock("@sotto/engine", () => ({
  buildRuntime: () => ({ router: {}, company: {}, mode: "live" }),
  reviewCall: (...args: unknown[]) => mockReviewCall(...(args as [])),
  LocalCallBridge: class {
    constructor(opts: { onEnded: (s: unknown) => void; send: (m: unknown) => void }) {
      mockOnEnded = opts.onEnded;
      mockSend = opts.send;
    }
    handle() {}
    close() {}
  },
}));
const mockApi = jest.fn(async () => ({}));
const mockLive: boolean[] = [];
let mockFeatures: Record<string, { state: string }> = {};
jest.mock("../../lib/cloud", () => ({
  CloudError: class extends Error {},
  cloudApi: (...args: unknown[]) => mockApi(...(args as [])),
  cloudState: () => ({ status: "signed_in", me: { features: mockFeatures } }),
  setCallLive: (on: boolean) => mockLive.push(on),
}));
const mockSave = jest.fn();
jest.mock("../../lib/deviceHistory", () => ({
  markReviewing: jest.fn(),
  saveDeviceCall: (...a: unknown[]) => mockSave(...a),
  setDeviceReview: jest.fn(),
}));

import type { Brief } from "../crm/api";
import { attachBrief, resetCall } from "../crm/attached";
import { connectLocal } from "./local";

const SUMMARY = { call_id: "c1", started_at: Date.now(), cards: 1, p50_ms: 1, p95_ms: 1 };
const handlers = { onStatus: jest.fn(), onMessage: jest.fn() };
const bundle = { prompts: { review: {} }, plan: { can_call: true } } as unknown as CallBundle;

function endCall() {
  connectLocal(bundle, handlers as never);
  if (!mockOnEnded) throw new Error("bridge not built");
  mockOnEnded(SUMMARY);
}

describe("call review flag", () => {
  beforeEach(() => {
    mockReviewCall.mockClear();
    mockApi.mockClear();
    mockLive.length = 0;
  });

  it("reviews the call when call review is available", () => {
    mockFeatures = { call_review: { state: "available" } };
    endCall();
    expect(mockReviewCall).toHaveBeenCalledTimes(1);
  });

  it.each(["off_by_platform", "off_by_org", "no_permission"])(
    "never sends the transcript to the review model when it is %s",
    (state) => {
      mockFeatures = { call_review: { state } };
      endCall();
      expect(mockReviewCall).not.toHaveBeenCalled();
      expect(mockApi).toHaveBeenCalledWith("/api/v1/usage", expect.anything());
      expect(mockLive).toEqual([false]); // the call is over: a pending bundle may reload now
    },
  );
});

describe("device history card ids", () => {
  it("keeps the live card id on the saved card entry", () => {
    mockFeatures = { call_review: { state: "off_by_org" } };
    mockSave.mockClear();
    connectLocal(bundle, handlers as never);
    const callId = "11111111-1111-4111-8111-111111111111";
    const cardId = "22222222-2222-4222-8222-222222222222";
    mockSend?.({ type: "call_started", call_id: callId });
    mockSend?.({
      type: "card",
      card: {
        v: 1,
        card_id: cardId,
        call_id: callId,
        seq: 0,
        type: "answer",
        source: "playbook",
        delta: "Hello there",
        done: true,
      },
    });
    mockOnEnded?.({ ...SUMMARY, call_id: callId });
    const saved = mockSave.mock.calls[0]?.[0] as { transcript: { kind: string; id?: string }[] };
    expect(saved.transcript.find((e) => e.kind === "card")?.id).toBe(cardId);
  });
});

/** UX-009: a call is saved under the linked Zoho name, never "Call 11/14/2026, 9:46:45 AM". */
describe("the saved call's name (UX-009)", () => {
  const brief = (over: Partial<Brief> = {}): Brief => ({
    person: { module: "Contacts", id: "p1", name: "Desmond Lee", title: "", email: "", phone: "" },
    account: { name: "Acme Trading", industry: "" },
    deals: [],
    notes: [],
    text: "Desmond Lee, Acme Trading",
    ...over,
  });
  const saved = () => mockSave.mock.calls[0]?.[0] as { title: string; company?: string };
  beforeEach(() => {
    mockFeatures = { call_review: { state: "off_by_org" } };
    mockSave.mockClear();
    resetCall();
  });

  it("is the linked Zoho person, with their company", () => {
    attachBrief(brief());
    endCall();
    expect(saved()).toMatchObject({ title: "Desmond Lee", company: "Acme Trading" });
  });

  it("is the meeting's title when the record names no person", () => {
    attachBrief(
      brief({
        person: null,
        account: null,
        meeting: {
          id: "m1",
          title: "Zoho quote walkthrough",
          start: "",
          end: "",
          agenda: "",
          participants: [],
        },
      }),
    );
    endCall();
    expect(saved()).toMatchObject({ title: "Zoho quote walkthrough" });
    expect(saved()).not.toHaveProperty("company");
  });

  it("is empty without a linked record (History names it), never a timestamp", () => {
    endCall();
    expect(saved().title).toBe("");
  });
});
