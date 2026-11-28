/** R3 (review): a linked Zoho record or call brief never outlives the account that made it; the
 * next account to sign in on this computer starts clean. */
import { render } from "@testing-library/react-native";
import { Text } from "react-native";
import { CallSessionProvider } from "../features/call/CallSessionProvider";
import { attachedBriefText, attachForNextCall, resetCall } from "../features/crm/attached";
import { mockLookup } from "../features/crm/mock";
import { LocaleProvider } from "../lib/locale";

let mockCloud: unknown = { status: "signed_in", me: { user: { id: "u-a", role: "agent" } } };
jest.mock("../lib/useCloud", () => ({ useCloud: () => mockCloud }));

const app = () => (
  <LocaleProvider initial="en">
    <CallSessionProvider>
      <Text>app</Text>
    </CallSessionProvider>
  </LocaleProvider>
);

beforeEach(() => {
  resetCall();
  mockCloud = { status: "signed_in", me: { user: { id: "u-a", role: "agent" } } };
});

describe("attached record per account (R3)", () => {
  it("signing out clears the record and the brief", async () => {
    const view = await render(app());
    attachForNextCall((await mockLookup.meetingBrief("m")).brief);
    expect(attachedBriefText()).toContain("Meeting:");
    mockCloud = { status: "signed_out" };
    await view.rerender(app());
    expect(attachedBriefText()).toBe("");
  });

  it("the app closing for the account (the gate shows sign-in) clears them too", async () => {
    const view = await render(app());
    attachForNextCall((await mockLookup.meetingBrief("m")).brief);
    await view.unmount();
    expect(attachedBriefText()).toBe("");
  });

  it("a signed-in account keeps what it prepared", async () => {
    const view = await render(app());
    attachForNextCall((await mockLookup.meetingBrief("m")).brief);
    await view.rerender(app());
    expect(attachedBriefText()).toContain("Meeting:");
  });
});
