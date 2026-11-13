/** Home: the connected user's upcoming Zoho meetings with a view-only detail (owner request,
 * 14 Nov 2026); hidden when Zoho is not connected. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { attachedBriefText, resetCall } from "../features/crm/attached";
import { HomeMeetings } from "../features/crm/HomeMeetings";
import { mockLookup, mockMeetings } from "../features/crm/mock";
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

  it("'Use for my next call' attaches the meeting and opens the call", async () => {
    signedIn({ state: "available" });
    await wrap(<HomeMeetings source={mockMeetings} brief={mockLookup.meetingBrief} />);
    await waitFor(() => screen.getByTestId(`meeting-${ID}-toggle`));
    await fireEvent.press(screen.getByTestId(`meeting-${ID}-toggle`));
    await fireEvent.press(screen.getByTestId(`meeting-${ID}-use`));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/call"));
    expect(attachedBriefText()).toContain("Meeting: Acme renewal call");
  });
});
