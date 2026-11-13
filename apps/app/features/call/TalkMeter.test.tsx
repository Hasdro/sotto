/** UX-18: the talk bar shows during the call only while the agent talks too much. */
import { render, screen } from "@testing-library/react-native";
import { TalkMeter } from "./components/TalkMeter";
import type { TranscriptEntry } from "./session";

const line = (speaker: "customer" | "agent", words: number, id: number): TranscriptEntry =>
  ({ id: String(id), speaker, text: Array(words).fill("w").join(" "), atMs: id }) as TranscriptEntry;

const balanced = [line("customer", 50, 1), line("agent", 50, 2)];
const tooMuch = [line("customer", 20, 1), line("agent", 80, 2)];

describe("TalkMeter (UX-18)", () => {
  it("is hidden during the call at a balanced ratio", async () => {
    await render(<TalkMeter lines={balanced} />);
    expect(screen.queryByTestId("talk-meter")).toBeNull();
  });

  it("shows the bar and the warning once the agent talks a lot", async () => {
    await render(<TalkMeter lines={tooMuch} />);
    expect(screen.getByTestId("talk-meter")).toBeOnTheScreen();
    expect(screen.getByTestId("talk-too-much")).toBeOnTheScreen();
  });

  it("the full variant (after-call review) always shows the bar", async () => {
    await render(<TalkMeter lines={balanced} variant="full" />);
    expect(screen.getByTestId("talk-meter")).toBeOnTheScreen();
    expect(screen.queryByTestId("talk-too-much")).toBeNull();
  });
});
