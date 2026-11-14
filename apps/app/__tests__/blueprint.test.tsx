/** INT-04 (D-056): the Blueprint checklist is read only and can add a note; never a transition. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { type Blueprint, zohoBlueprint } from "../features/crm/api";
import { resetCall, useAttachedState } from "../features/crm/attached";
import { BlueprintChecklist } from "../features/crm/BlueprintChecklist";
import { LocaleProvider } from "../lib/locale";

function PrepProbe() {
  const next = useAttachedState().prep.next_step;
  return <Text testID="prep-next">{next}</Text>;
}

jest.mock("../lib/cloud", () => ({ cloudApi: jest.fn(() => new Promise(() => {})) }));

const BP: Blueprint = {
  deal_id: "4150868000000400001",
  process: "Sales process",
  current: "Qualification",
  transitions: [
    {
      name: "Qualify",
      to: "Proposal",
      ready: false,
      missing: [{ api_name: "Budget_Confirmed", label: "Budget" }],
      done: [{ api_name: "Decision_Maker", label: "Decider" }],
    },
    { name: "Drop", to: "Closed Lost", ready: true, missing: [], done: [] },
  ],
  note: "To move to Proposal: still need Budget.",
};

const wrap = (node: React.ReactNode, locale: "en" | "ar" = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>{node}</UIProvider>
    </LocaleProvider>,
  );

beforeEach(() => resetCall());

describe("Blueprint checklist", () => {
  it("shows what is still missing for the next transition", async () => {
    await wrap(<BlueprintChecklist dealId={BP.deal_id} read={async () => BP} />);
    await waitFor(() => expect(screen.getByTestId("bp-checklist")).toBeOnTheScreen());
    expect(screen.getByText(/To move to .*Proposal.* you still need:/)).toBeOnTheScreen();
    expect(screen.getByText("Budget")).toBeOnTheScreen();
    expect(screen.queryByText("Decider")).toBeNull();
    expect(screen.getByText(/Ready to move to .*Closed Lost/)).toBeOnTheScreen();
    expect(screen.getByText("Read only. Move the deal in Zoho yourself.")).toBeOnTheScreen();
  });

  it("suggests a Note through the prep notes, and offers nothing that moves the deal", async () => {
    await wrap(
      <>
        <BlueprintChecklist dealId={BP.deal_id} read={async () => BP} />
        <PrepProbe />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId("bp-suggest")).toBeOnTheScreen());
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1); // only "Add to my prep notes"
    await fireEvent.press(screen.getByTestId("bp-suggest"));
    expect(screen.getByTestId("prep-next").props.children).toBe(BP.note);
    expect(screen.getByTestId("bp-added")).toBeOnTheScreen();
  });

  it("no Blueprint or a failed read says so quietly", async () => {
    await wrap(
      <BlueprintChecklist dealId="1" read={async () => ({ ...BP, transitions: [], note: "" })} />,
    );
    await waitFor(() => expect(screen.getByTestId("bp-none")).toBeOnTheScreen());
    await wrap(<BlueprintChecklist dealId="2" read={() => Promise.reject(new Error("x"))} />);
    await waitFor(() => expect(screen.getByTestId("bp-failed")).toBeOnTheScreen());
  });

  it("Arabic", async () => {
    await wrap(<BlueprintChecklist dealId={BP.deal_id} read={async () => BP} />, "ar");
    await waitFor(() => expect(screen.getByText("خطوات Blueprint")).toBeOnTheScreen());
  });

  it("the client only ever reads the Blueprint (GET, no body)", async () => {
    const cloud = jest.requireMock("../lib/cloud") as { cloudApi: jest.Mock };
    void zohoBlueprint("4150868000000400001");
    expect(cloud.cloudApi).toHaveBeenLastCalledWith(
      "/api/v1/zoho/deals/4150868000000400001/blueprint",
    );
    expect(cloud.cloudApi.mock.lastCall).toHaveLength(1); // no method, no body
  });
});
