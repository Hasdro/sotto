import { type Command, deepCommands, filterCommands } from "../components/CommandPalette";
import { type StringKey, t } from "../lib/i18n";

const c = (id: string, label: string): Command => ({ id, icon: "history", label, href: "/home" });
const en = (key: StringKey) => t(key, "en");
const ar = (key: StringKey) => t(key, "ar");

describe("quick search", () => {
  it("matches every typed word in any order, ignoring case", () => {
    const all = [c("a", "Start listening to a call"), c("b", "Call history"), c("c", "Settings")];
    expect(filterCommands(all, "call").map((x) => x.id)).toEqual(["a", "b"]);
    expect(filterCommands(all, "HISTORY call").map((x) => x.id)).toEqual(["b"]);
    expect(filterCommands(all, "").map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(filterCommands(all, "zoom")).toEqual([]);
  });

  it("also matches where a command lives and the words it answers to (UX-001)", () => {
    const all = [
      { ...c("tone", "Card tone"), hint: "Admin · AI" },
      { ...c("int", "Integrations"), terms: "zoho crm" },
    ];
    expect(filterCommands(all, "zoho").map((x) => x.id)).toEqual(["int"]);
    expect(filterCommands(all, "admin tone").map((x) => x.id)).toEqual(["tone"]);
  });
});

describe("Admin pages and Settings sections in quick search (UX-001)", () => {
  const ids = (
    role: "agent" | "manager" | "admin",
    query: string,
    tr = en,
    locale: "en" | "ar" = "en",
  ) => filterCommands(deepCommands(role, tr, locale), query).map((x) => x.id);

  it("an admin finds the page for tone, billing, zoho and devices", () => {
    expect(ids("admin", "tone")).toEqual(["admin-tone"]);
    expect(ids("admin", "billing")).toEqual(["admin-billing"]);
    expect(ids("admin", "zoho")).toEqual(["admin-integrations", "settings-zoho"]);
    expect(ids("admin", "devices")).toEqual(["admin-company"]);
    const tone = deepCommands("admin", en, "en").find((x) => x.id === "admin-tone");
    expect(tone).toMatchObject({ label: "Card tone", hint: "Admin · AI", href: "/admin/tone" });
  });

  it("indexes every Admin page except the playbook, which is its own section", () => {
    const hrefs = deepCommands("admin", en, "en").map((x) => String(x.href));
    for (const href of [
      "/admin",
      "/admin/integrations",
      "/admin/attachments",
      "/admin/instructions",
      "/admin/memory",
      "/admin/coach",
      "/admin/setup",
      "/admin/settings",
      "/admin/features",
      "/admin/reports",
      "/admin/company",
    ]) {
      expect(hrefs).toContain(href);
    }
    expect(hrefs).not.toContain("/playbook");
    expect(hrefs).toContain("/settings#zoho");
  });

  it("agents and managers never get Admin pages, only their own Settings sections", () => {
    for (const role of ["agent", "manager"] as const) {
      expect(deepCommands(role, en, "en").some((x) => String(x.href).startsWith("/admin"))).toBe(
        false,
      );
      expect(ids(role, "zoho")).toEqual(["settings-zoho"]);
      expect(ids(role, "billing")).toEqual([]);
    }
  });

  it("works in Arabic: Arabic labels and words, and Latin brand names", () => {
    expect(ids("admin", "الأجهزة", ar, "ar")).toEqual(["admin-company"]);
    expect(ids("admin", "zoho", ar, "ar")).toEqual(["admin-integrations", "settings-zoho"]);
    // Bilingual teams type the English name too.
    expect(ids("admin", "audio", ar, "ar")).toEqual(["settings-audio"]);
    expect(ids("admin", "style memory", ar, "ar")).toEqual(["admin-memory"]);
    const tone = deepCommands("admin", ar, "ar").find((x) => x.id === "admin-tone");
    expect(tone?.label).toBe("نبرة البطاقات");
  });
});
