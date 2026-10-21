/** Settings survive a restart and start from sensible defaults (owner, 21 Oct). */
type Mod = typeof import("../lib/prefs");

describe("device settings", () => {
  let items: Map<string, string>;
  const load = (): Mod => {
    let mod: Mod | undefined;
    jest.isolateModules(() => {
      mod = require("../lib/prefs");
    });
    return mod as Mod;
  };
  beforeEach(() => {
    items = new Map();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => items.set(k, v),
      removeItem: (k: string) => items.delete(k),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("starts with the system theme, pick-up and recording on, tutorial not yet seen", () => {
    expect(load().prefs()).toMatchObject({
      theme: "system",
      autoPickup: true,
      record: true,
      tutorialDone: false,
    });
  });

  it("keeps a change after the app restarts", () => {
    load().setPrefs({ theme: "dark", tutorialDone: true });
    expect(load().prefs()).toMatchObject({ theme: "dark", tutorialDone: true, sounds: true });
  });

  it("still works when storage is blocked", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const m = load();
    m.setPrefs({ sounds: false });
    expect(m.prefs().sounds).toBe(false);
  });
});
