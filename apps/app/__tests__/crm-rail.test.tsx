/** Zoho in the call's context rail (R10, T-057; owner 14 Nov 2026): the person's upcoming
 * meetings first, search as the fallback, nothing attached without the agent's pick, Skip,
 * connect-first, the structured brief and the reconnect prompt. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { CrmRail } from "../features/call/components/CrmRail";
import type { Candidate } from "../features/crm/api";
import {
  attachedBriefText,
  attachForNextCall,
  bindCall,
  resetCall,
  setPrep,
} from "../features/crm/attached";
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
  return {
    CloudError,
    cloudApi: jest.fn(() => new Promise(() => {})),
    refreshFeatures: jest.fn(),
  };
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
const MEETING = "4150868000000300001";

beforeEach(() => resetCall());

describe("CrmRail", () => {
  it("lists the person's meetings first; opening one shows details and attaches nothing", async () => {
    signedIn({ state: "available" });
    const meetingBrief = jest.fn(mockLookup.meetingBrief);
    await wrap(<CrmRail lookup={{ ...mockLookup, meetingBrief }} />);
    await waitFor(() => expect(screen.getByTestId(`meeting-${MEETING}`)).toBeOnTheScreen());
    // The search fallback sits under the list.
    expect(
      screen.getByText("Not in your meetings? Search by name, email or phone."),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId(`meeting-${MEETING}-toggle`));
    await waitFor(() => expect(screen.getByTestId(`meeting-${MEETING}-detail`)).toBeOnTheScreen());
    expect(meetingBrief).not.toHaveBeenCalled();
    expect(attachedBriefText()).toBe("");
    await fireEvent.press(screen.getByTestId(`meeting-${MEETING}-use`));
    await waitFor(() => expect(screen.getByTestId("crm-brief-meeting")).toBeOnTheScreen());
    expect(meetingBrief).toHaveBeenCalledWith(MEETING);
    expect(attachedBriefText()).toContain("Meeting: Acme renewal call");
  });

  it("search never attaches by itself, even when exactly one record matches", async () => {
    signedIn({ state: "available" });
    const brief = jest.fn(mockLookup.brief);
    await wrap(
      <CrmRail lookup={{ ...mockLookup, search: async () => ({ candidates: [ONE] }), brief }} />,
    );
    await fireEvent.changeText(screen.getByTestId("crm-query"), "+1 555 010 2030");
    await fireEvent.press(screen.getByTestId("crm-find"));
    await waitFor(() => expect(screen.getByTestId(`crm-candidate-${ONE.id}`)).toBeOnTheScreen());
    expect(screen.getByText("Matched on phone: +1 555")).toBeOnTheScreen();
    expect(brief).not.toHaveBeenCalled();
    expect(attachedBriefText()).toBe("");
    await fireEvent.press(screen.getByTestId(`crm-pick-${ONE.id}`));
    await waitFor(() => expect(screen.getByTestId("crm-brief")).toBeOnTheScreen());
    expect(brief).toHaveBeenCalledTimes(1);
  });

  it("shows at most three search candidates", async () => {
    signedIn({ state: "available" });
    const many = [1, 2, 3, 4, 5].map((i) => ({ ...ONE, id: `41508680000002240${i}0` }));
    await wrap(<CrmRail lookup={{ ...mockLookup, search: async () => ({ candidates: many }) }} />);
    await fireEvent.changeText(screen.getByTestId("crm-query"), "Jane");
    await fireEvent.press(screen.getByTestId("crm-find"));
    await waitFor(() => expect(screen.getAllByText("Jane Doe")).toHaveLength(3));
  });

  it("shows the empty and error states of the meetings list", async () => {
    signedIn({ state: "available" });
    const { CloudError } = jest.requireMock("../lib/cloud") as {
      CloudError: new (s: number, c: string, m: string) => Error;
    };
    await wrap(
      <CrmRail
        lookup={{
          ...mockLookup,
          meetings: {
            ...mockLookup.meetings,
            meetings: async () => ({ meetings: [], page: 1, more: false }),
          },
        }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("crm-meetings-empty")).toBeOnTheScreen());
    await wrap(
      <CrmRail
        lookup={{
          ...mockLookup,
          meetings: {
            ...mockLookup.meetings,
            meetings: () => Promise.reject(new CloudError(409, "zoho_reconnect", "x")),
          },
        }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Reconnect Zoho to see your meetings.")).toBeOnTheScreen(),
    );
  });

  it("skips; a new call starts clean, but a meeting picked on Home carries into the next call", async () => {
    signedIn({ state: "available" });
    bindCall("c1");
    await wrap(<CrmRail lookup={mockLookup} />);
    await fireEvent.press(screen.getByTestId("crm-skip"));
    expect(screen.getByText("No CRM record for this call.")).toBeOnTheScreen();
    setPrep("objective", "Close it");
    bindCall("c2");
    expect(attachedBriefText()).toBe("");
    const { brief } = await mockLookup.meetingBrief(MEETING);
    attachForNextCall(brief);
    bindCall("c3");
    expect(attachedBriefText()).toContain("Meeting: Acme renewal call");
    bindCall("c4");
    expect(attachedBriefText()).toBe("");
  });

  it("asks to connect first while the person has not connected Zoho", async () => {
    signedIn({ state: "needs_connection", cause: "zoho" });
    await wrap(<CrmRail lookup={mockLookup} />);
    expect(screen.queryByTestId("crm-query")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("zoho-connect")).toBeOnTheScreen());
  });

  it("is greyed with a reason when the organisation turned Zoho off", async () => {
    signedIn({ state: "off_by_org" });
    await wrap(<CrmRail lookup={mockLookup} />);
    expect(screen.getByTestId("feature-off-zoho")).toBeOnTheScreen();
  });

  it("speaks Arabic", async () => {
    signedIn({ state: "available" });
    await wrap(<CrmRail lookup={mockLookup} />, "ar");
    expect(screen.getByText("اجتماعاتك القادمة")).toBeOnTheScreen();
    expect(screen.getByText("ابحث في Zoho")).toBeOnTheScreen();
  });

  it("the structured brief reaches the prompt text without Zoho", async () => {
    signedIn({ state: "needs_connection", cause: "zoho" });
    await wrap(<CrmRail lookup={mockLookup} />);
    await fireEvent.changeText(screen.getByTestId("prep-objective"), "Book the start date");
    setPrep("competitors", "Globex");
    expect(attachedBriefText()).toContain("Call objective: Book the start date");
    expect(attachedBriefText()).toContain("Competitors: Globex");
  });

  it("shows the reconnect prompt when the connection lacks new scopes", async () => {
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
    await wrap(<CrmRail lookup={mockLookup} />);
    await waitFor(() => expect(screen.getByTestId("crm-reconnect")).toBeOnTheScreen());
    cloudApi.mockImplementation(() => new Promise(() => {}));
  });
});
