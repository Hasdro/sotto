/** Zoho in the call's context rail (R10, T-057): candidates with evidence, nothing attached
 * without the agent's pick, Skip, connect-first, and the brief the live prompt reads. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { CrmRail } from "../features/call/components/CrmRail";
import type { Candidate } from "../features/crm/api";
import { attachedBriefText, resetCall, setPrep } from "../features/crm/attached";
import { mockLookup } from "../features/crm/mock";
import type { Locale } from "../lib/i18n";
import { LocaleProvider } from "../lib/locale";

let mockCloud: unknown = { status: "off" };
jest.mock("../lib/useCloud", () => ({ useCloud: () => mockCloud }));
jest.mock("../lib/cloud", () => {
  class CloudError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return { CloudError, cloudApi: jest.fn(() => new Promise(() => {})), refreshFeatures: jest.fn() };
});
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const wrap = (node: React.ReactNode, locale: Locale = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>{node}</UIProvider>
    </LocaleProvider>,
  );

function signedIn(zoho: Record<string, unknown>) {
  mockCloud = { status: "signed_in", me: { user: { id: "u", role: "agent" }, features: { zoho } } };
}

const ONE: Candidate = {
  module: "Contacts",
  id: "4150868000000224005",
  name: "Jane Doe",
  title: "CFO",
  company: "Acme Corp",
  email: "jane@acme.test",
  phone: "+1 555",
  evidence: { field: "phone", value: "+1 555" },
};

describe("CrmRail", () => {
  beforeEach(() => resetCall());

  it("never attaches by itself, even when exactly one record matches", async () => {
    signedIn({ state: "available" });
    const brief = jest.fn(mockLookup.brief);
    await wrap(
      <CrmRail callId="c1" lookup={{ search: async () => ({ candidates: [ONE] }), brief }} />,
    );
    await fireEvent.press(screen.getByTestId("crm-mode-search"));
    await fireEvent.changeText(screen.getByTestId("crm-query"), "+1 555 010 2030");
    await fireEvent.press(screen.getByTestId("crm-find"));
    await waitFor(() => expect(screen.getByTestId(`crm-candidate-${ONE.id}`)).toBeOnTheScreen());
    expect(screen.getByText("Matched on phone: +1 555")).toBeOnTheScreen();
    expect(brief).not.toHaveBeenCalled();
    expect(attachedBriefText()).toBe("");
    expect(screen.queryByTestId("crm-brief")).toBeNull();

    await fireEvent.press(screen.getByTestId(`crm-pick-${ONE.id}`));
    await waitFor(() => expect(screen.getByTestId("crm-brief")).toBeOnTheScreen());
    expect(brief).toHaveBeenCalledTimes(1);
    expect(attachedBriefText()).toContain("Contact: Jane Doe, CFO");
  });

  it("shows at most three candidates", async () => {
    signedIn({ state: "available" });
    const many = [1, 2, 3, 4, 5].map((i) => ({ ...ONE, id: `41508680000002240${i}0` }));
    await wrap(
      <CrmRail
        callId="c1"
        lookup={{ search: async () => ({ candidates: many }), brief: mockLookup.brief }}
      />,
    );
    await fireEvent.press(screen.getByTestId("crm-mode-search"));
    await fireEvent.changeText(screen.getByTestId("crm-query"), "Jane");
    await fireEvent.press(screen.getByTestId("crm-find"));
    await waitFor(() => expect(screen.getAllByText("Jane Doe")).toHaveLength(3));
  });

  it("skips, and a new call starts with nothing attached", async () => {
    signedIn({ state: "available" });
    const view = await wrap(<CrmRail callId="c1" lookup={mockLookup} />);
    await fireEvent.press(screen.getByTestId("crm-skip"));
    expect(screen.getByText("No CRM record for this call.")).toBeOnTheScreen();
    expect(attachedBriefText()).toBe("");
    // Attach on call 1, then call 2 begins: cleared.
    await fireEvent.press(screen.getByTestId("crm-change"));
    await fireEvent.press(screen.getByTestId("crm-mode-search"));
    await fireEvent.changeText(screen.getByTestId("crm-query"), "Jane");
    await fireEvent.press(screen.getByTestId("crm-find"));
    await waitFor(() => screen.getByTestId(`crm-pick-${ONE.id}`));
    await fireEvent.press(screen.getByTestId(`crm-pick-${ONE.id}`));
    await waitFor(() => expect(attachedBriefText()).not.toBe(""));
    await view.rerender(
      <LocaleProvider initial="en">
        <UIProvider direction="ltr">
          <CrmRail callId="c2" lookup={mockLookup} />
        </UIProvider>
      </LocaleProvider>,
    );
    await waitFor(() => expect(attachedBriefText()).toBe(""));
  });

  it("asks to connect first while the person has not connected Zoho", async () => {
    signedIn({ state: "needs_connection", cause: "zoho" });
    await wrap(<CrmRail callId="c1" lookup={mockLookup} />);
    expect(screen.queryByTestId("crm-query")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("zoho-connect")).toBeOnTheScreen());
  });

  it("is greyed with a reason when the organisation turned Zoho off", async () => {
    signedIn({ state: "off_by_org" });
    await wrap(<CrmRail callId="c1" lookup={mockLookup} />);
    expect(screen.getByTestId("feature-off-zoho")).toBeOnTheScreen();
  });

  it("speaks Arabic", async () => {
    signedIn({ state: "available" });
    await wrap(<CrmRail callId="c1" lookup={mockLookup} />, "ar");
    await fireEvent.press(screen.getByTestId("crm-mode-search"));
    expect(screen.getByText("ابحث في Zoho")).toBeOnTheScreen();
  });
});

describe("meetings, brief and reconnect (zoho-actions)", () => {
  beforeEach(() => resetCall());

  it("lists the nearest meetings without attaching one, and attaches the picked meeting", async () => {
    signedIn({ state: "available" });
    const meetingBrief = jest.fn(mockLookup.meetingBrief);
    await wrap(<CrmRail callId="c1" lookup={{ ...mockLookup, meetingBrief }} />);
    await waitFor(() =>
      expect(screen.getByTestId("crm-meeting-4150868000000300001")).toBeOnTheScreen(),
    );
    expect(meetingBrief).not.toHaveBeenCalled();
    expect(attachedBriefText()).toBe("");
    await fireEvent.press(screen.getByTestId("crm-pick-meeting-4150868000000300001"));
    await waitFor(() => expect(screen.getByTestId("crm-brief-meeting")).toBeOnTheScreen());
    expect(attachedBriefText()).toContain("Meeting: Acme renewal call");
  });

  it("the structured brief reaches the prompt text without Zoho, starting from the attendees", async () => {
    signedIn({ state: "needs_connection", cause: "zoho", prep: undefined } as never);
    await wrap(<CrmRail callId="c1" lookup={mockLookup} />);
    await fireEvent.changeText(screen.getByTestId("prep-objective"), "Book the start date");
    setPrep("competitors", "Globex");
    const text = attachedBriefText();
    expect(text).toContain("Call objective: Book the start date");
    expect(text).toContain("Competitors: Globex");
  });

  it("shows the reconnect prompt when the connection predates Zoho writes", async () => {
    signedIn({ state: "available" });
    const { cloudApi } = jest.requireMock("../lib/cloud") as { cloudApi: jest.Mock };
    cloudApi.mockImplementation((path: string) =>
      path.startsWith("/api/v1/zoho/status")
        ? Promise.resolve({
            connected: true,
            needs_reconnect: true,
            feature: { state: "available" },
            client: "org",
          })
        : new Promise(() => {}),
    );
    await wrap(<CrmRail callId="c1" lookup={mockLookup} />);
    await waitFor(() => expect(screen.getByTestId("crm-reconnect")).toBeOnTheScreen());
    cloudApi.mockImplementation(() => new Promise(() => {}));
  });
});
