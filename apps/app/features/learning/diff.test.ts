import { COUNTER_FROM_WORDS, diffInstructions, sourceName } from "./diff";

describe("pending version diff (UX-31)", () => {
  it("marks kept, added and removed instructions", () => {
    const d = diffInstructions(
      ["Name the next step.", "Keep answers short."],
      ["Keep answers  short.", "Ask about budget early."],
    );
    expect(d).toEqual([
      { kind: "same", text: "Keep answers  short." },
      { kind: "added", text: "Ask about budget early." },
      { kind: "removed", text: "Name the next step." },
    ]);
  });

  it("shows the counter only above twenty words", () => {
    expect(COUNTER_FROM_WORDS).toBe(20);
  });
});

describe("call name (UX-06c)", () => {
  const titles: Record<string, string> = { c2: "Omar Saleh" };
  const titleOf = (id: string) => titles[id];
  it("prefers the name sent with the instruction, then this device's call title", () => {
    expect(sourceName({ source_call: "c1", source_label: "Sara" }, titleOf)).toBe("Sara");
    expect(sourceName({ source_call: "c2" }, titleOf)).toBe("Omar Saleh");
    expect(sourceName({ source_call: "c3" }, titleOf)).toBe("");
    expect(sourceName({ source_call: null }, titleOf)).toBeNull();
  });
});
