/** Call review is a flagged feature (D-028, D-036): when it is off, the transcript never goes to
 * the after-call model, and the call still reports its numbers. */
import type { CallBundle } from "@sotto/engine";

const mockReviewCall = jest.fn(async () => null);
let mockOnEnded: ((s: unknown) => void) | null = null;
jest.mock("@sotto/engine", () => ({
  buildRuntime: () => ({ router: {}, company: {}, mode: "live" }),
  reviewCall: (...args: unknown[]) => mockReviewCall(...(args as [])),
  LocalCallBridge: class {
    constructor(opts: { onEnded: (s: unknown) => void }) {
      mockOnEnded = opts.onEnded;
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
jest.mock("../../lib/deviceHistory", () => ({
  markReviewing: jest.fn(),
  saveDeviceCall: jest.fn(),
  setDeviceReview: jest.fn(),
}));

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
