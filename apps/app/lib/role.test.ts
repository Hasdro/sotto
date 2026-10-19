import { areaOf, canOpen, personaFor, ROLE_AREAS, VIEW_ROLES } from "./role";

describe("role areas (R3)", () => {
  it("maps paths to areas, with / as the call screen and /gallery ungated", () => {
    expect(areaOf("/")).toBe("/call");
    expect(areaOf("/history/c-1041")).toBe("/history");
    expect(areaOf("/admin/models")).toBe("/admin");
    expect(areaOf("/administrator")).toBeNull();
    expect(areaOf("/gallery")).toBeNull();
  });

  it("agents take calls and read history and the playbook only", () => {
    expect(ROLE_AREAS.agent).toEqual(["/call", "/history", "/playbook"]);
    expect(canOpen("agent", "/inbox")).toBe(false);
    expect(canOpen("agent", "/admin/prompts")).toBe(false);
    expect(canOpen("agent", "/gallery")).toBe(true);
  });

  it("managers add the inbox but not admin", () => {
    expect(canOpen("manager", "/inbox")).toBe(true);
    expect(canOpen("manager", "/admin")).toBe(false);
  });

  it("admins open everything", () => {
    for (const path of ["/call", "/history", "/playbook", "/inbox", "/admin/settings"]) {
      expect(canOpen("admin", path)).toBe(true);
    }
  });

  it("every role has a mock persona with that role", () => {
    for (const role of VIEW_ROLES) expect(personaFor(role).role).toBe(role);
  });
});
