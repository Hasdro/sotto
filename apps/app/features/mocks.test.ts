import { isActive } from "../components/AppShell";
import { STAGE_MODELS, verdict } from "./admin/mock";
import { byStatus, countByStatus, INBOX } from "./inbox/mock";
import { PLAYBOOK, searchPlaybook } from "./playbook/mock";

describe("mock data helpers", () => {
  it("playbook search matches every word, case-insensitively, across question, answer and tags", () => {
    expect(searchPlaybook(PLAYBOOK, "")).toHaveLength(PLAYBOOK.length);
    expect(searchPlaybook(PLAYBOOK, "FREEHOLD").map((e) => e.id)).toEqual(["pb-5"]);
    expect(searchPlaybook(PLAYBOOK, "payment 60%").map((e) => e.id)).toEqual(["pb-3"]);
    expect(searchPlaybook(PLAYBOOK, "objection").map((e) => e.id)).toEqual(["pb-2"]);
    expect(searchPlaybook(PLAYBOOK, "nothing-like-this")).toEqual([]);
  });

  it("inbox counts and filters by status", () => {
    expect(countByStatus(INBOX)).toEqual({ open: 2, answered: 1, added: 1 });
    expect(byStatus(INBOX, "added").every((i) => i.answer)).toBe(true);
  });

  it("a stage meets R1 only when its p95 is within budget; offline stages are not timed", () => {
    expect(
      verdict({ stage: "suggest", provider: "p", model: "m", budgetMs: 700, p95Ms: 700 }),
    ).toBe("meets");
    expect(
      verdict({ stage: "suggest", provider: "p", model: "m", budgetMs: 700, p95Ms: 701 }),
    ).toBe("misses");
    expect(
      verdict({ stage: "summary", provider: "p", model: "m", budgetMs: null, p95Ms: null }),
    ).toBe("offline");
    expect(STAGE_MODELS.map((m) => m.stage)).toEqual(
      expect.arrayContaining([
        "stt",
        "turn",
        "trigger",
        "suggest",
        "suggest_backup",
        "summary",
        "embed",
        "judge",
      ]),
    );
  });

  it("marks the active navigation item, with / and /home both meaning Home", () => {
    expect(isActive("/", "/home")).toBe(true);
    expect(isActive("/", "/call")).toBe(false);
    expect(isActive("/call", "/call")).toBe(true);
    expect(isActive("/history/c-1", "/history")).toBe(true);
    expect(isActive("/historyx", "/history")).toBe(false);
    expect(isActive("/admin/models", "/admin")).toBe(true);
  });
});
