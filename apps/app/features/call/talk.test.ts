import { callNotes, setCallNotes } from "../../lib/callNotes";
import { AGENT_TOO_MUCH, talkShare } from "./components/TalkMeter";
import type { TranscriptEntry } from "./session";

const l = (speaker: TranscriptEntry["speaker"], text: string, id = 0): TranscriptEntry => ({
  id,
  speaker,
  text,
  atMs: 0,
});

describe("talk-time and notes", () => {
  it("shares the talking by words, and needs both sides", () => {
    expect(talkShare([l("customer", "one two three"), l("agent", "a")])).toEqual({
      customer: 75,
      agent: 25,
    });
    expect(talkShare([l("customer", "only me")])).toBeNull();
    expect(
      talkShare([l("system", "x y z"), l("customer", "hi"), l("agent", "hello there friend")]),
    ).toEqual({ customer: 25, agent: 75 });
    expect(75).toBeGreaterThan(AGENT_TOO_MUCH);
  });

  it("keeps notes for the call and hands them over once", () => {
    setCallNotes("Budget 50k, call back Monday");
    expect(callNotes()).toBe("Budget 50k, call back Monday");
    expect(callNotes(true)).toBe("Budget 50k, call back Monday");
    expect(callNotes()).toBe("");
  });
});
