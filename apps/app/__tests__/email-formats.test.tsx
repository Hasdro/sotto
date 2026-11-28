/** Admin › Integrations › Email formats (UI-016): one formatting toolbar for the opening, body and
 * signature (it edits the field the admin was last in), and Save formats only after a change. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { FormatsEditor } from "../features/email/FormatsEditor";
import { LocaleProvider } from "../lib/locale";

const mockApi = jest.fn();
jest.mock("../lib/cloud", () => ({
  ...jest.requireActual("../lib/cloud"),
  cloudApi: (...a: unknown[]) => mockApi(...a),
}));

const FORMATS = [
  {
    id: "f1",
    name: "Follow-up",
    kind: "follow_up",
    subject: "Thanks for today",
    opening: "Hi there,",
    body: "Here is the quote.",
    signature: "Hana",
  },
];

const wrap = () =>
  render(
    <LocaleProvider initial="en">
      <UIProvider direction="ltr">
        <FormatsEditor />
      </UIProvider>
    </LocaleProvider>,
  );

beforeEach(() => {
  mockApi.mockReset();
  mockApi.mockImplementation(async (_path: string, init?: { method?: string; body?: unknown }) =>
    init?.method === "PUT" ? (init.body as object) : { formats: FORMATS },
  );
});

describe("Email formats (UI-016)", () => {
  it("has one toolbar that formats the field the admin was last in", async () => {
    await wrap();
    await waitFor(() => expect(screen.getByTestId("email-formats")).toBeTruthy());
    expect(screen.getAllByTestId(/-bold$/)).toHaveLength(1);
    const body = screen.getByTestId("email-format-body");
    await fireEvent(body, "focus");
    await fireEvent(body, "selectionChange", { nativeEvent: { selection: { start: 8, end: 13 } } });
    await fireEvent.press(screen.getByTestId("email-format-toolbar-bold"));
    expect(screen.getByTestId("email-format-body").props.value).toBe("Here is **the q**uote.");
    expect(screen.getByTestId("email-format-opening").props.value).toBe("Hi there,");
  });

  it("offers Save formats only after a change, and not again once saved", async () => {
    await wrap();
    await waitFor(() => expect(screen.getByTestId("email-formats-save")).toBeTruthy());
    expect(screen.getByTestId("email-formats-save")).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId("email-format-subject"), "Thank you");
    expect(screen.getByTestId("email-formats-save")).not.toBeDisabled();
    await fireEvent.press(screen.getByTestId("email-formats-save"));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith("/api/v1/company/email/formats", {
        method: "PUT",
        body: { formats: [{ ...FORMATS[0], subject: "Thank you" }] },
      }),
    );
    await waitFor(() => expect(screen.getByTestId("email-formats-save")).toBeDisabled());
  });
});
