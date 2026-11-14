/** INT-15: a playbook suggestion is an approval card; approve adds the edited entry, reject
 * records it; nothing changes without a decision. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Suggestions } from "../features/playbook/Suggestions";
import { LocaleProvider } from "../lib/locale";

const mockApi = jest.fn();
jest.mock("../lib/cloud", () => ({ cloudApi: (...a: unknown[]) => mockApi(...a) }));

const CARD = {
  id: "s1",
  source: "ratings",
  question: "Do you offer a warranty?",
  answer: "",
  samples: ["Do you offer a warranty?", "What warranty do you give?"],
  calls: 3,
  reason: "Came up on 3 calls in the last 30 days.",
  status: "open",
  created_at: 0,
  playbook_id: null,
};

const wrap = (onApproved = jest.fn()) =>
  render(
    <LocaleProvider initial="en">
      <UIProvider direction="ltr">
        <Suggestions onApproved={onApproved} />
      </UIProvider>
    </LocaleProvider>,
  );

describe("playbook suggestions", () => {
  beforeEach(() => {
    mockApi.mockReset();
    let open = true;
    mockApi.mockImplementation(async (path: string) => {
      if (path === "/api/v1/playbook/suggestions")
        return { items: open ? [CARD] : [], open: open ? 1 : 0 };
      open = false;
      return { id: "s1", status: path.endsWith("approve") ? "approved" : "rejected" };
    });
  });

  it("needs an answer before approving, then adds the edited entry", async () => {
    const onApproved = jest.fn();
    await wrap(onApproved);
    expect(await screen.findByText("Came up on 3 calls in the last 30 days.")).toBeOnTheScreen();
    expect(screen.getByTestId("suggestion-approve-s1")).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId("suggestion-answer-s1"), "Yes, 25 years.");
    await fireEvent.press(screen.getByTestId("suggestion-approve-s1"));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/api/v1/playbook/suggestions/s1/approve", {
        method: "POST",
        body: { question: "Do you offer a warranty?", answer: "Yes, 25 years." },
      }),
    );
    await waitFor(() => expect(onApproved).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("suggestion-s1")).toBeNull());
  });

  it("reject records the decision and adds nothing", async () => {
    const onApproved = jest.fn();
    await wrap(onApproved);
    await fireEvent.press(await screen.findByTestId("suggestion-reject-s1"));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/api/v1/playbook/suggestions/s1/reject", {
        method: "POST",
        body: {},
      }),
    );
    expect(onApproved).not.toHaveBeenCalled();
  });
});
