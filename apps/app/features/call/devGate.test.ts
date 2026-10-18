import { demoEnabled } from "./devGate";

describe("demoEnabled", () => {
  const original = process.env.EXPO_PUBLIC_SOTTO_DEMO;
  const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
  afterEach(() => {
    process.env.EXPO_PUBLIC_SOTTO_DEMO = original;
    (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
  });

  it("is on in development", () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    expect(demoEnabled()).toBe(true);
  });

  it("is off in a production build without the demo flag", () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_SOTTO_DEMO;
    expect(demoEnabled()).toBe(false);
  });

  it("is on in the production web build that pnpm demo makes", () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    process.env.EXPO_PUBLIC_SOTTO_DEMO = "1";
    expect(demoEnabled()).toBe(true);
  });
});
