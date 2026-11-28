/** Home: the connected user's upcoming Zoho meetings with a view-only detail (owner request,
 * 14 Nov 2026); hidden when Zoho is not connected. */
import { UIProvider } from "@sotto/ui";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { MeetingDetail } from "../features/crm/api";
import { attachedBriefText, resetCall } from "../features/crm/attached";
import { HomeMeetings } from "../features/crm/HomeMeetings";
import { mockLookup, mockMeetings } from "../features/crm/mock";
import { whenText } from "../features/crm/UpcomingMeetings";
import { LocaleProvider } from "../lib/locale";

let mockCloud: unknown = { status: "off" };
jest.mock("../lib/useCloud", () => ({ useCloud: () => mockCloud }));
jest.mock("../lib/cloud", () => ({
  CloudError: class extends Error {},
  cloudApi: jest.fn(() => new Promise(() => {})),
  refreshFeatures: jest.fn(),
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (h: string) => mockPush(h) } }));
let mockPhase: "idle" | "live" | "ended" | null = null;
jest.mock("../features/call/CallSessionProvider", () => ({
  useCallPhase: () => mockPhase,
}));

const wrap = (node: React.ReactNode) =>
  render(
    <LocaleProvider initial="en">
      <UIProvider direction="ltr">{node}</UIProvider>
    </LocaleProvider>,
  );
const signedIn = (zoho: Record<string, unknown>) => {
  mockCloud = { status: "signed_in", me: { user: { id: "u", role: "agent" }, features: { zoho } } };
};
const ID = "4150868000000300001";

beforeEach(() => resetCall());

describe("HomeMeetings", () => {
  it("is not shown until Zoho is connected, nor without a server", async () => {
    signedIn({ state: "needs_connection", cause: "zoho" });
    await wrap(<HomeMeetings source={mockMeetings} />);
    expect(screen.queryByTestId("home-meetings")).toBeNull();
    mockCloud = { status: "off" };
    await wrap(<HomeMeetings source={mockMeetings} />);
    expect(screen.queryByTestId("home-meetings")).toBeNull();
  });

  it("lists upcoming meetings soonest first and opens a view-only detail", async () => {
    signedIn({ state: "available" });
    await wrap(<HomeMeetings source={mockMeetings} brief={mockLookup.meetingBrief} />);
    await waitFor(() => expect(screen.getByTestId(`meeting-${ID}`)).toBeOnTheScreen());
    const titles = screen.getAllByText(/call|intro|follow-up/i).map((n) => n.props.children);
    expect(titles[0]).toBe("Acme renewal call");
    await fireEvent.press(screen.getByTestId(`meeting-${ID}-toggle`));
    await waitFor(() => expect(screen.getByTestId(`meeting-${ID}-detail`)).toBeOnTheScreen());
    expect(screen.getByText("jane@acme.test")).toBeOnTheScreen();
    expect(screen.getByText("Zoho Meeting")).toBeOnTheScreen();
    expect(screen.getByTestId(`meeting-${ID}-link`)).toBeOnTheScreen();
    expect(attachedBriefText()).toBe(""); // viewing attaches nothing
  });

  it("Prepare binds the meeting and opens the call on the brief editor (UX-03h)", async () => {
    signedIn({ state: "available" });
    await wrap(<HomeMeetings source={mockMeetings} brief={mockLookup.meetingBrief} />);
    await waitFor(() => screen.getByTestId(`meeting-${ID}-prepare`));
    await fireEvent.press(screen.getByTestId(`meeting-${ID}-prepare`));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/call?prepare=1"));
    expect(attachedBriefText()).toContain("Meeting: Acme renewal call");
  });

  it("during a live call nothing can be prepared for the next one (review: it took over the live call)", async () => {
    signedIn({ state: "available" });
    mockPhase = "live";
    try {
      await wrap(<HomeMeetings source={mockMeetings} />);
      await waitFor(() => expect(screen.getByTestId("meetings-during-call")).toBeTruthy());
      expect(screen.getByTestId("meetings-during-call")).toHaveTextContent(
        "Finish the current call to prepare the next one.",
      );
      for (const b of screen.getAllByRole("button", { name: "Prepare" })) expect(b).toBeDisabled();
      expect(attachedBriefText()).toBe("");
    } finally {
      mockPhase = null;
    }
  });

  it("'Start call with this meeting' binds it and opens the call", async () => {
    signedIn({ state: "available" });
    mockPush.mockReset();
    await wrap(<HomeMeetings source={mockMeetings} brief={mockLookup.meetingBrief} />);
    await waitFor(() => screen.getByTestId(`meeting-${ID}-start`));
    await fireEvent.press(screen.getByTestId(`meeting-${ID}-start`));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/call"));
    expect(attachedBriefText()).toContain("Meeting: Acme renewal call");
  });

  it("an opened meeting says it is loading its details and never repeats the header's time and deal (UX-004)", async () => {
    signedIn({ state: "available" });
    let finish: (r: { meeting: MeetingDetail }) => void = () => {};
    const slow = {
      meetings: mockMeetings.meetings,
      detail: () => new Promise<{ meeting: MeetingDetail }>((r) => (finish = r)),
    };
    await wrap(<HomeMeetings source={slow} brief={mockLookup.meetingBrief} />);
    await waitFor(() => screen.getByTestId(`meeting-${ID}-toggle`));
    await fireEvent.press(screen.getByTestId(`meeting-${ID}-toggle`));
    expect(screen.getByText("Loading meeting details…")).toBeOnTheScreen();
    expect(screen.queryByText("Loading your meetings…")).toBeNull();
    const detail = await mockMeetings.detail(ID);
    await act(async () => finish(detail));
    await waitFor(() => expect(screen.getByTestId(`meeting-${ID}-detail`)).toBeOnTheScreen());
    const m = detail.meeting;
    expect(screen.getAllByText(whenText(m.start, m.end, "en"))).toHaveLength(1);
    expect(screen.queryByText("When")).toBeNull();
    expect(screen.queryByText("Deal")).toBeNull();
    expect(screen.getByText("Contact")).toBeOnTheScreen(); // the contact still shows
    expect(screen.getByText("jane@acme.test")).toBeOnTheScreen(); // and the participants
  });

  it("Prepare says Opening… on the pressed button only and holds the others until it is done (UX-004)", async () => {
    signedIn({ state: "available" });
    mockPush.mockReset();
    let finish: () => void = () => {};
    const slowBrief = (id: string) =>
      new Promise<Awaited<ReturnType<typeof mockLookup.meetingBrief>>>((resolve) => {
        finish = () => void mockLookup.meetingBrief(id).then(resolve);
      });
    await wrap(<HomeMeetings source={mockMeetings} brief={slowBrief} />);
    await waitFor(() => screen.getByTestId(`meeting-${ID}-prepare`));
    await fireEvent.press(screen.getByTestId(`meeting-${ID}-prepare`));
    const prepare = screen.getByTestId(`meeting-${ID}-prepare`);
    expect(prepare).toBeBusy();
    expect(prepare).toHaveTextContent("Opening…");
    const start = screen.getByTestId(`meeting-${ID}-start`);
    expect(start).toBeDisabled();
    expect(start).not.toBeBusy();
    expect(start).toHaveTextContent("Start call with this meeting");
    await act(async () => finish());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/call?prepare=1"));
    await waitFor(() => expect(screen.getByTestId(`meeting-${ID}-prepare`)).not.toBeBusy());
  });

  it("lists three before Show more and reports the first page (Next: … at …)", async () => {
    signedIn({ state: "available" });
    const loaded = jest.fn();
    await wrap(<HomeMeetings source={mockMeetings} onLoaded={loaded} />);
    await waitFor(() => expect(loaded).toHaveBeenCalled());
    expect(loaded.mock.calls[0][0][0].title).toBe("Acme renewal call");
    expect(screen.getAllByTestId(/^meeting-\d+$/).length).toBeLessThanOrEqual(3);
  });
});
