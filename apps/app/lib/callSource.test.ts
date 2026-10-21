import { callSource, isCallSource, SOURCE_META, setCallSource, sourceOf } from "./callSource";

describe("call source", () => {
  it("names the call app from its macOS bundle id", () => {
    expect(sourceOf("us.zoom.xos")).toBe("zoom");
    expect(sourceOf("com.microsoft.teams2")).toBe("teams");
    expect(sourceOf("com.google.Chrome.helper")).toBe("browser");
    expect(sourceOf("com.yeastar.linkus")).toBe("yeastar");
    expect(sourceOf("com.3cx.phone")).toBe("3cx");
    expect(sourceOf("com.unknown.app")).toBe("computer");
  });

  it("keeps the current call's source and knows every name", () => {
    setCallSource("zoom");
    expect(callSource()).toBe("zoom");
    setCallSource(null);
    expect(callSource()).toBeNull();
    expect(isCallSource("mic")).toBe(true);
    expect(isCallSource("nope")).toBe(false);
    for (const meta of Object.values(SOURCE_META)) expect(meta.icon.length).toBeGreaterThan(0);
  });
});
