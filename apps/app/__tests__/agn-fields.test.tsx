/** INT-06 (D-069): the admin creates only the missing AGN fields, after a preview and a confirm. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AgnFieldsPanel } from "../features/crm/AgnFieldsPanel";
import type { AgnField } from "../features/crm/api";
import type { ZohoConn } from "../features/crm/useZoho";
import { LocaleProvider } from "../lib/locale";

jest.mock("../lib/cloud", () => {
  class CloudError extends Error {
    code = "x";
  }
  return { CloudError, cloudApi: jest.fn(() => new Promise(() => {})) };
});

const field = (api: string, exists: boolean, writable = true): AgnField => ({
  api_name: api,
  label: api.replaceAll("_", " "),
  type: "text",
  exists,
  writable,
});
const BEFORE = [
  field("AGN_Call_Score", false),
  field("AGN_Chance_Band", false),
  field("AGN_Top_Objection", true),
  field("AGN_Last_Call_Date", true, false),
];
const AFTER = BEFORE.map((f) => ({ ...f, exists: true }));

const conn = (features: Record<string, boolean> | undefined): ZohoConn => ({
  status: {
    connected: true,
    feature: { state: "available" },
    client: "platform",
    ...(features ? { features } : {}),
  },
  waiting: false,
  justConnected: false,
  error: null,
  connect: jest.fn(),
  disconnect: jest.fn(),
  reload: jest.fn(),
});

const wrap = (node: React.ReactNode, locale: "en" | "ar" = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>{node}</UIProvider>
    </LocaleProvider>,
  );

describe("Create AGN fields in Zoho", () => {
  it("is hidden until the connection has the D-069 scopes (one reconnect prompt elsewhere)", async () => {
    await wrap(<AgnFieldsPanel zoho={conn(undefined)} />);
    expect(screen.queryByTestId("agn-fields")).toBeNull();
  });

  it("preview first; create only after confirm; only the missing ones", async () => {
    const preview = jest.fn(async () => ({ fields: BEFORE }));
    const create = jest.fn(async () => ({
      created: ["AGN_Call_Score", "AGN_Chance_Band"],
      fields: AFTER,
    }));
    await wrap(<AgnFieldsPanel zoho={conn({ agn_fields: true })} api={{ preview, create }} />);
    expect(screen.getByText(/Stage and amount are never written/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("agn-preview"));
    await waitFor(() => expect(screen.getByTestId("agn-field-AGN_Call_Score")).toBeOnTheScreen());
    expect(screen.getAllByText("Will be created")).toHaveLength(2);
    expect(screen.getByText("Already in Zoho")).toBeOnTheScreen();
    expect(screen.getByText("Exists with another API name; left alone")).toBeOnTheScreen();
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByTestId("agn-create").props.accessibilityState?.disabled).toBe(true);
    await fireEvent(screen.getByTestId("agn-confirm"), "valueChange", true);
    await fireEvent.press(screen.getByTestId("agn-create"));
    await waitFor(() => expect(screen.getByTestId("agn-done")).toBeOnTheScreen());
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("Arabic", async () => {
    await wrap(<AgnFieldsPanel zoho={conn({ agn_fields: true })} />, "ar");
    expect(screen.getByText("حقول AGN في Zoho")).toBeOnTheScreen();
  });
});
