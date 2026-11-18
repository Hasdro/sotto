/** Rich-text Markdown helpers (D-080): wrap/toggle and the bullet-list toggle. */
import { applyBold, applyItalic, applyLink, applyList, wrap } from "./richText";

describe("wrap", () => {
  test("wraps the selection", () => {
    expect(wrap("hello world", { start: 6, end: 11 }, "**", "**")).toEqual({
      text: "hello **world**",
      selection: { start: 8, end: 13 },
    });
  });
  test("an empty selection inserts the markers with the cursor between them", () => {
    expect(wrap("hello", { start: 5, end: 5 }, "**", "**")).toEqual({
      text: "hello****",
      selection: { start: 7, end: 7 },
    });
  });
  test("wrapping what is already wrapped unwraps it", () => {
    expect(wrap("hello **world**", { start: 6, end: 15 }, "**", "**")).toEqual({
      text: "hello world",
      selection: { start: 6, end: 11 },
    });
  });
});

describe("applyBold / applyItalic / applyLink", () => {
  test("bold, italic and link markers", () => {
    expect(applyBold("call me", { start: 0, end: 4 }).text).toBe("**call** me");
    expect(applyItalic("call me", { start: 0, end: 4 }).text).toBe("*call* me");
    expect(applyLink("our site", { start: 0, end: 8 }).text).toBe("[our site](https://)");
  });
});

describe("applyList", () => {
  test("prefixes each touched line and toggles back", () => {
    const first = applyList("one\ntwo", { start: 0, end: 7 });
    expect(first.text).toBe("- one\n- two");
    expect(applyList(first.text, { start: 0, end: first.text.length }).text).toBe("one\ntwo");
  });
  test("blank lines stay blank", () => {
    expect(applyList("one\n\ntwo", { start: 0, end: 8 }).text).toBe("- one\n\n- two");
  });
});
