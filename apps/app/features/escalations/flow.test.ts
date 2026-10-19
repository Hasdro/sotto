import { INBOX } from "../inbox/mock";
import { PLAYBOOK } from "../playbook/mock";
import { addToPlaybook, MAX_ANSWER_WORDS, saveAnswer, wordCount } from "./flow";

const state = { inbox: INBOX, playbook: PLAYBOOK };
const DAY = "2026-10-19";

describe("escalation → playbook (R2 step 5, mirrors approve_escalation())", () => {
  it("counts words the way the database does", () => {
    expect(wordCount("  two   words ")).toBe(2);
    expect(wordCount("")).toBe(0);
  });

  it("saves an answer on an open question", () => {
    const r = saveAnswer(state, "q-31", "  No, card or bank transfer only. ");
    if (!r.ok) throw new Error(r.error);
    const item = r.state.inbox.find((i) => i.id === "q-31");
    expect(item?.status).toBe("answered");
    expect(item?.answer).toBe("No, card or bank transfer only.");
    expect(r.state.playbook).toBe(state.playbook);
  });

  it("adds an answer to the playbook once, straight from open", () => {
    const r = addToPlaybook(state, "q-31", "No, card or bank transfer only.", DAY);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.inbox.find((i) => i.id === "q-31")?.status).toBe("added");
    expect(r.state.playbook[0]).toEqual({
      id: "pb-q-31",
      question: "Can I pay the deposit in bitcoin?",
      answer: "No, card or bank transfer only.",
      tags: ["from-inbox"],
      updated: DAY,
    });
    expect(r.state.playbook).toHaveLength(state.playbook.length + 1);
    const again = addToPlaybook(r.state, "q-31", "Different answer.", DAY);
    expect(again).toEqual({ ok: false, error: "already_added" });
  });

  it("refuses empty answers and answers too long to say from one card", () => {
    expect(saveAnswer(state, "q-31", "   ")).toEqual({ ok: false, error: "empty" });
    const long = Array.from({ length: MAX_ANSWER_WORDS + 1 }, () => "word").join(" ");
    expect(addToPlaybook(state, "q-31", long, DAY)).toEqual({ ok: false, error: "too_long" });
    const max = Array.from({ length: MAX_ANSWER_WORDS }, () => "word").join(" ");
    expect(addToPlaybook(state, "q-31", max, DAY).ok).toBe(true);
  });

  it("refuses unknown questions and edits after adding", () => {
    expect(saveAnswer(state, "nope", "x")).toEqual({ ok: false, error: "not_found" });
    expect(saveAnswer(state, "q-28", "x")).toEqual({ ok: false, error: "already_added" });
  });
});
