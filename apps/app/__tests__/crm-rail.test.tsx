/** Zoho in the call's context rail (R10, T-057; owner 14 Nov 2026): the person's upcoming
 * meetings first, search as the fallback, nothing attached without the agent's pick, Skip,
 * connect-first, the structured brief and the reconnect prompt. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { CrmRail, dealLine, leadFromQuery } from "../features/call/components/CrmRail";
import type { Candidate } from "../features/crm/api";
import {
  attachBrief,
  attachedBriefText,
  attachForNextCall,
  bindCall,
  resetCall,
  setPrep,
} from "../features/crm/attached";
import { mockLookup, mockPerform } from "../features/crm/mock";
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

  it("a meeting picked on Home after a call goes to the next call, even when the call screen reopens on the last one (SAFE-001 review)", async () => {
    const { brief } = await mockLookup.meetingBrief(MEETING);
    bindCall("c1"); // call 1 runs
    setPrep("objective", "Old notes");
    attachForNextCall(brief); // call 1 ended; the agent prepares the next meeting on Home
    bindCall("c1"); // /call remounts on call 1's ended view (the session keeps its id)
    expect(attachedBriefText()).toContain("Meeting: Acme renewal call");
    bindCall("c2"); // call 2 starts
    expect(attachedBriefText()).toContain("Meeting: Acme renewal call");
    expect(attachedBriefText()).not.toContain("Old notes");
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

describe("CrmRail stages (UX-01, UX-03r, UX-16, UX-17, UX-19)", () => {
  // Every editable text field on screen (host TextInputs carry `editable`/`onChangeText`).
  const inputs = () => (screen.root?.queryAll((n) => n.type === "TextInput") ?? []) as unknown[];

  it("before the call: the full brief editor, with the timing note as help text (UX-16)", async () => {
    signedIn({ state: "available" });
    await wrap(<CrmRail lookup={mockLookup} stage="prepare" />);
    for (const f of ["tldr", "objective", "attendees", "pains", "competitors", "next_step"]) {
      expect(screen.getByTestId(`prep-${f}`)).toBeOnTheScreen();
    }
    expect(screen.getByTestId("prep-help")).toHaveTextContent(/from the next sentence/);
    expect(inputs().length).toBeGreaterThanOrEqual(7); // search + 6 brief fields
    await fireEvent.changeText(screen.getByTestId("prep-objective"), "Agree the start date");
    expect(attachedBriefText()).toContain("Call objective: Agree the start date");
  });

  it("linked: 'Linked to this call.', no candidate picker (UX-16, UX-03r)", async () => {
    signedIn({ state: "available" });
    attachForNextCall((await mockLookup.meetingBrief(MEETING)).brief);
    await wrap(<CrmRail lookup={mockLookup} stage="prepare" />);
    expect(screen.getByText("Linked to this call.")).toBeOnTheScreen();
    expect(screen.queryByText(/The AI uses it from the next sentence/)).toBeNull();
    expect(screen.queryByTestId("crm-query")).toBeNull();
  });

  it("live: only 4 brief lines + Edit; More from Zoho collapsed; no inputs (UX-01, UX-19)", async () => {
    signedIn({ state: "available" });
    attachForNextCall((await mockLookup.meetingBrief(MEETING)).brief);
    setPrep("objective", "Agree the start date");
    setPrep("next_step", "Send the order form");
    setPrep("pains", "Too many tools");
    await wrap(<CrmRail lookup={mockLookup} stage="live" />);
    expect(screen.getByTestId("brief-line-who")).toHaveTextContent("Who: Jane Doe, CFO");
    expect(screen.getByTestId("brief-line-company")).toHaveTextContent("Company: Acme Corp");
    expect(screen.getByTestId("brief-line-objective")).toHaveTextContent(/Agree the start date/);
    expect(screen.getByTestId("brief-line-next")).toHaveTextContent(/Send the order form/);
    expect(screen.queryByText(/Too many tools/)).toBeNull(); // not one of the 4 lines
    expect(screen.getByText("Linked to this call.")).toBeOnTheScreen();
    expect(screen.queryByTestId("crm-not-linked")).toBeNull();
    // CRM details stay behind the collapsed disclosure.
    expect(screen.getByTestId("crm-more")).toBeOnTheScreen();
    expect(screen.queryByTestId("crm-deal")).toBeNull();
    expect(inputs()).toHaveLength(0);
    expect(screen.queryByTestId("quick-actions")).toBeNull();
    // Edit opens the editor on demand; Done closes it.
    await fireEvent.press(screen.getByTestId("brief-edit"));
    expect(screen.getByTestId("prep-objective")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("prep-done"));
    expect(inputs()).toHaveLength(0);
  });

  it("live, More from Zoho: amounts and dates are formatted (UX-17)", async () => {
    signedIn({ state: "available" });
    attachForNextCall((await mockLookup.brief({ module: "Contacts", id: "x" })).brief);
    await wrap(<CrmRail lookup={mockLookup} stage="live" />);
    await fireEvent.press(screen.getByRole("button", { name: /More from Zoho/ }));
    const deal = screen.getByTestId("crm-deal");
    expect(deal).toHaveTextContent(/AED 12,000/);
    expect(deal).not.toHaveTextContent(/2026-12-01/);
    expect(screen.getAllByTestId("crm-note")[0]).toHaveTextContent(/^4 Nov · Pricing call/);
  });

  it("a deal line in Arabic keeps Western digits", () => {
    const d = {
      id: "1",
      name: "Acme",
      stage: "Won",
      amount: "12000",
      close_date: "2026-12-01",
      owner: "",
      currency: "AED",
    };
    const line = dealLine(d, "ar", (date) => `الإغلاق ${date}`, new Date("2026-11-13T06:00:00Z"));
    expect(line).toMatch(/12[,٬]000/);
    expect(line).not.toMatch(/[٠-٩]/);
  });

  it("live, started unlinked: exactly one 'Not linked to Zoho · Link' line (UX-03r)", async () => {
    signedIn({ state: "available" });
    await wrap(<CrmRail lookup={mockLookup} stage="live" />);
    expect(screen.getAllByTestId("crm-not-linked")).toHaveLength(1);
    expect(screen.getByText("Link")).toBeOnTheScreen();
    expect(screen.queryByTestId("crm-meetings")).toBeNull();
    expect(screen.queryByTestId("crm-query")).toBeNull();
    expect(inputs()).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("crm-link"));
    await waitFor(() => expect(screen.getByTestId(`meeting-${MEETING}`)).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId(`meeting-${MEETING}-toggle`));
    await waitFor(() => expect(screen.getByTestId(`meeting-${MEETING}-use`)).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId(`meeting-${MEETING}-use`));
    await waitFor(() => expect(screen.getByTestId("crm-linked")).toBeOnTheScreen());
    expect(screen.queryByTestId("crm-not-linked")).toBeNull();
  });

  it("unknown caller before the call: dedupe search, then a prefilled Lead, written only on approval", async () => {
    signedIn({ state: "available" });
    const perform = jest.fn(mockPerform);
    const search = jest.fn(async () => ({ candidates: [] }));
    await wrap(<CrmRail lookup={{ ...mockLookup, search }} perform={perform} stage="prepare" />);
    await fireEvent.changeText(screen.getByTestId("crm-query"), "new@caller.test");
    await fireEvent.press(screen.getByTestId("crm-find"));
    await waitFor(() => expect(screen.getByTestId("lead-offer")).toBeOnTheScreen());
    expect(search).toHaveBeenCalledWith("new@caller.test");
    expect(screen.getByTestId("action-lead-email").props.value).toBe("new@caller.test");
    expect(perform).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId("action-lead-last_name"), "Caller");
    await fireEvent.press(screen.getByTestId("action-lead-approve"));
    await waitFor(() => expect(perform).toHaveBeenCalledTimes(1));
    expect(perform.mock.calls[0]?.[0]).toBe("lead");
    expect(perform.mock.calls[0]?.[1]).toEqual({ last_name: "Caller", email: "new@caller.test" });
  });

  it("turns the searched text into Lead fields", () => {
    expect(leadFromQuery("a@b.co")).toEqual({ email: "a@b.co" });
    expect(leadFromQuery("+971 50 123 4567")).toEqual({ phone: "+971 50 123 4567" });
    expect(leadFromQuery("Jane Q Doe")).toEqual({ first_name: "Jane", last_name: "Q Doe" });
    expect(leadFromQuery("Jane")).toEqual({ last_name: "Jane" });
  });

  it("live rail speaks Arabic", async () => {
    signedIn({ state: "available" });
    await wrap(<CrmRail lookup={mockLookup} stage="live" />, "ar");
    expect(screen.getByText("اربط")).toBeOnTheScreen();
    expect(screen.getByText("الملخص")).toBeOnTheScreen();
  });
});

describe("brief prefill from Zoho (UX-006)", () => {
  const value = (f: string) => screen.getByTestId(`prep-${f}`).props.value as string;

  it("a linked meeting fills objective, TLDR and attendees, each marked as from Zoho", async () => {
    signedIn({ state: "available" });
    attachForNextCall((await mockLookup.meetingBrief(MEETING)).brief);
    await wrap(<CrmRail lookup={mockLookup} stage="prepare" />);
    expect(value("objective")).toBe("Acme renewal call");
    expect(value("tldr")).toBe(
      "Go through volume pricing and the start date.\nAcme renewal 2027 · Negotiation",
    );
    expect(value("attendees")).toBe("Jane Doe, Ada Admin");
    expect(value("pains")).toBe("");
    expect(screen.getAllByText("From Zoho · edit freely")).toHaveLength(3);
    // The AI already reads these lines in the Zoho text, so they are not sent twice.
    const text = attachedBriefText();
    expect(text).toContain("Meeting: Acme renewal call");
    expect(text).not.toContain("Call objective:");
    expect(text).not.toContain("TLDR:");
  });

  it("never overwrites what the agent typed; an edited prefill reaches the prompt", async () => {
    signedIn({ state: "available" });
    setPrep("objective", "Agree the start date");
    attachBrief((await mockLookup.meetingBrief(MEETING)).brief);
    await wrap(<CrmRail lookup={mockLookup} stage="prepare" />);
    expect(value("objective")).toBe("Agree the start date");
    await fireEvent.changeText(screen.getByTestId("prep-tldr"), "Renewal, wants volume pricing");
    expect(screen.getAllByText("From Zoho · edit freely")).toHaveLength(1); // attendees only
    expect(attachedBriefText()).toContain("TLDR: Renewal, wants volume pricing");
    expect(attachedBriefText()).toContain("Call objective: Agree the start date");
  });

  it("Change clears the prefills the agent did not edit, so no stale attendee stays", async () => {
    signedIn({ state: "available" });
    attachForNextCall((await mockLookup.meetingBrief(MEETING)).brief);
    setPrep("objective", "Close the renewal");
    await wrap(<CrmRail lookup={mockLookup} stage="prepare" />);
    await fireEvent.press(screen.getByTestId("crm-change"));
    expect(value("attendees")).toBe("");
    expect(value("tldr")).toBe("");
    expect(value("objective")).toBe("Close the renewal");
    expect(screen.queryByText("From Zoho · edit freely")).toBeNull();
    expect(attachedBriefText()).toBe("Call objective: Close the renewal");
  });

  it("a contact without a meeting fills attendees and the open deal", async () => {
    signedIn({ state: "available" });
    attachBrief((await mockLookup.brief({ module: "Contacts", id: "x" })).brief);
    await wrap(<CrmRail lookup={mockLookup} stage="prepare" />);
    expect(value("attendees")).toBe("Jane Doe");
    expect(value("tldr")).toBe("Acme renewal 2027 · Negotiation");
    expect(value("objective")).toBe("");
  });

  it("speaks Arabic", async () => {
    signedIn({ state: "available" });
    attachForNextCall((await mockLookup.meetingBrief(MEETING)).brief);
    await wrap(<CrmRail lookup={mockLookup} stage="prepare" />, "ar");
    expect(screen.getAllByText("من Zoho · يمكنك تعديله")).toHaveLength(3);
  });
});
