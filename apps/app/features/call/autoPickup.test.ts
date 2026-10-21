import { type Pickup, pickupStep } from "./autoPickup";

const idle: Pickup = { waiting: false, auto: false };
const s = (o: Partial<{ onCall: boolean; enabled: boolean; ready: boolean; live: boolean }>) => ({
  onCall: false,
  enabled: true,
  ready: true,
  live: false,
  ...o,
});

describe("auto pick-up", () => {
  it("opens the call screen, then listens once the session is ready, then ends with the call", () => {
    let [p, a] = pickupStep(idle, s({ onCall: true, ready: false }));
    expect(a).toBe("open");
    [p, a] = pickupStep(p, s({ onCall: true, ready: false }));
    expect(a).toBeNull();
    [p, a] = pickupStep(p, s({ onCall: true, ready: true }));
    expect(a).toBe("listen");
    [p, a] = pickupStep(p, s({ onCall: true, live: true }));
    expect(a).toBeNull();
    [p, a] = pickupStep(p, s({ onCall: false, live: true }));
    expect(a).toBe("end");
    expect(p).toEqual(idle);
  });

  it("does nothing when switched off in Settings", () => {
    expect(pickupStep(idle, s({ onCall: true, enabled: false }))[1]).toBeNull();
  });

  it("never ends a call the agent started by hand", () => {
    const [, a] = pickupStep(idle, s({ onCall: false, live: true }));
    expect(a).toBeNull();
    // A call app starting during a manual call does not take it over either.
    expect(pickupStep(idle, s({ onCall: true, live: true }))[1]).toBeNull();
  });

  it("does not reopen after the agent ends an auto call while the app still has the mic", () => {
    let [p] = pickupStep(idle, s({ onCall: true, ready: false }));
    [p] = pickupStep(p, s({ onCall: true }));
    [p] = pickupStep(p, s({ onCall: true, live: true }));
    // agent pressed End: no longer live, call app still on
    const [, a] = pickupStep(p, s({ onCall: true, live: false }));
    expect(a).toBeNull();
  });

  it("a call app that stops before the session is ready leaves nothing behind", () => {
    const [p] = pickupStep(idle, s({ onCall: true, ready: false }));
    const [q, a] = pickupStep(p, s({ onCall: false, ready: false }));
    expect(a).toBeNull();
    expect(q).toEqual(idle);
  });
});
