/** Admin › Integrations, wave 3 (UX-30, UX-32, ZC-07, ZC-13, UX-44c): Zoho first, no client
 * form (an override shows "Client ID ends …" only), SMTP presets with only the password for a
 * known provider and a test email on save, Gallabox pick lists with only the unmapped
 * parameters, the Zoho team invite that sends nothing before confirm, and a reason on every
 * disabled button. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import IntegrationsScreen from "../app/admin/integrations";
import { SmtpSettings } from "../features/email/SmtpSettings";
import { INTEGRATIONS_TEXT } from "../features/integrations/strings";
import { ZohoInvite } from "../features/team/ZohoInvite";
import { GallaboxSettings } from "../features/whatsapp/GallaboxSettings";
import type { Locale } from "../lib/i18n";
import { LocaleProvider } from "../lib/locale";

let mockCloud: unknown = { status: "off" };
jest.mock("../lib/useCloud", () => ({ useCloud: () => mockCloud }));
jest.mock("../features/crm/useZoho", () => ({
  useZoho: () => ({ status: { connected: true, needs_reconnect: false } }),
  onReturn: () => () => {},
}));
jest.mock("../features/crm/ZohoConnect", () => ({ ZohoConnect: () => null }));
type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockRoutes: Record<string, (body: unknown) => unknown> = {};
jest.mock("../lib/cloud", () => {
  class CloudError extends Error {}
  return {
    CloudError,
    refreshFeatures: jest.fn(),
    cloudApi: jest.fn(async (path: string, init: { method?: string; body?: unknown } = {}) => {
      const method = init.method ?? "GET";
      const clean = path.split("?")[0] ?? path;
      mockCalls.push({ path: clean, method, body: init.body });
      const fn = mockRoutes[`${method} ${clean}`];
      if (!fn) throw new CloudError(`no mock for ${method} ${clean}`);
      return fn(init.body);
    }),
  };
});
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const wrap = (node: React.ReactNode, locale: Locale = "en") =>
  render(
    <LocaleProvider initial={locale}>
      <UIProvider direction={locale === "ar" ? "rtl" : "ltr"}>{node}</UIProvider>
    </LocaleProvider>,
  );
const NONE = { configured: false };
const calls = (method: string, path: string) =>
  mockCalls.filter((c) => c.method === method && c.path === path);

beforeEach(() => {
  mockCalls.length = 0;
  mockRoutes = {};
  mockCloud = {
    status: "signed_in",
    me: { user: { id: "u", role: "admin", email: "ada@acme.test" }, features: {} },
  };
});

it("strings: English and Arabic in step", () => {
  expect(Object.keys(INTEGRATIONS_TEXT.ar).sort()).toEqual(
    Object.keys(INTEGRATIONS_TEXT.en).sort(),
  );
});

describe("Integrations page (UX-30)", () => {
  it("shows your Zoho connection, then Email, then WhatsApp, and no client form", async () => {
    mockRoutes["GET /api/v1/company/zoho/client"] = () => ({
      platform: NONE,
      org: NONE,
      active: null,
    });
    await wrap(<IntegrationsScreen />);
    const order = JSON.stringify(screen.toJSON()).match(
      /"testID":"(zoho-connection|smtp-settings|gallabox-settings)"/g,
    );
    expect(order).toEqual([
      '"testID":"zoho-connection"',
      '"testID":"smtp-settings"',
      '"testID":"gallabox-settings"',
    ]);
    expect(screen.queryByTestId("zoho-client-id")).toBeNull();
    expect(screen.queryByTestId("zoho-client-secret")).toBeNull();
    expect(screen.queryByTestId("zoho-override")).toBeNull();
  });

  it("an owner override shows 'Client ID ends …' only, and removing asks first", async () => {
    let org: Record<string, unknown> = { configured: true, dc: "us", client_id_tail: "a1b2" };
    mockRoutes["GET /api/v1/company/zoho/client"] = () => ({ platform: NONE, org, active: "org" });
    mockRoutes["DELETE /api/v1/company/zoho/client"] = () => {
      org = NONE;
      return { platform: NONE, org, active: null };
    };
    await wrap(<IntegrationsScreen />);
    await waitFor(() => expect(screen.getByText("Client ID ends …a1b2")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("zoho-override-remove"));
    expect(screen.getByTestId("zoho-override-confirm")).toBeTruthy();
    expect(calls("DELETE", "/api/v1/company/zoho/client")).toHaveLength(0);
    await fireEvent.press(screen.getByTestId("zoho-override-yes"));
    await waitFor(() => expect(screen.getByTestId("zoho-override-note")).toBeTruthy());
    expect(calls("DELETE", "/api/v1/company/zoho/client")).toHaveLength(1);
  });
});

const PRESET = (id: string, host: string, port: number) => ({
  domain: "acme.test",
  found_by: id === "other" ? "none" : "mx",
  preset: { id, label: id === "google" ? "Google Workspace" : "Other", host, port },
  username: id === "other" ? "" : "ada@acme.test",
  from_address: id === "other" ? "" : "ada@acme.test",
  from_name: "Acme",
});

describe("SMTP presets (UX-32)", () => {
  it("a Google domain asks only for the password; save sends the test email inline", async () => {
    let org: Record<string, unknown> = NONE;
    mockRoutes = {
      "GET /api/v1/company/smtp": () => ({
        platform: NONE,
        org,
        active: org === NONE ? null : "org",
      }),
      "GET /api/v1/company/smtp/preset": () => PRESET("google", "smtp.gmail.com", 465),
      "GET /api/v1/email/formats": () => ({ formats: [] }),
      "PUT /api/v1/company/smtp": () => {
        org = {
          configured: true,
          host: "smtp.gmail.com",
          port: 465,
          from_name: "Acme",
          from_address: "ada@acme.test",
          updated_at: 1,
        };
        return { platform: NONE, org, active: "org" };
      },
      "POST /api/v1/company/smtp/test": () => ({ ok: true, to: "ada@acme.test" }),
    };
    await wrap(<SmtpSettings />);
    await waitFor(() =>
      expect(screen.getByText(/Google Workspace found for acme.test/)).toBeTruthy(),
    );
    expect(screen.getByTestId("smtp-password")).toBeTruthy();
    expect(screen.queryByTestId("smtp-host")).toBeNull(); // under "Server settings"
    expect(screen.getByText("Enter the mailbox password first")).toBeTruthy(); // UX-44c
    await fireEvent.changeText(screen.getByTestId("smtp-password"), "pw");
    await fireEvent.press(screen.getByTestId("smtp-save"));
    await waitFor(() => expect(screen.getByTestId("smtp-test-result")).toBeTruthy());
    expect(calls("PUT", "/api/v1/company/smtp")[0]?.body).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      username: "ada@acme.test",
      password: "pw",
      from_name: "Acme",
      from_address: "ada@acme.test",
    });
    expect(calls("POST", "/api/v1/company/smtp/test")).toHaveLength(1);
    expect(screen.getByTestId("smtp-test-result").props.children).toMatch(/ada@acme.test/);
  });

  it("an unknown domain is 'Other' with every field", async () => {
    mockRoutes = {
      "GET /api/v1/company/smtp": () => ({ platform: NONE, org: NONE, active: null }),
      "GET /api/v1/company/smtp/preset": () => PRESET("other", "", 465),
      "GET /api/v1/email/formats": () => ({ formats: [] }),
    };
    await wrap(<SmtpSettings />);
    await waitFor(() => expect(screen.getByText(/could not tell who hosts mail/)).toBeTruthy());
    for (const id of ["host", "username", "password", "from-name", "from-address"])
      expect(screen.getByTestId(`smtp-${id}`)).toBeTruthy();
    expect(screen.getByText("Enter the mail server first")).toBeTruthy();
    expect(screen.getByText("Save a mailbox first")).toBeTruthy(); // the disabled test button
  });
});

const NUMBERED = {
  name: "price_update",
  language: "en",
  category: "UTILITY",
  status: "APPROVED",
  body: "Hi {{1}}, the price for {{2}} is ready.",
  params: [
    { name: "1", component: "body", type: "text", example: "", source: "" },
    { name: "2", component: "body", type: "text", example: "", source: "" },
  ],
};
const GUESSED = {
  ...NUMBERED,
  name: "meeting_followup",
  body: "Thanks {{name}}",
  params: [
    { name: "name", component: "body", type: "text", example: "", source: "customer.first_name" },
  ],
};

describe("Gallabox pick lists (ZC-07)", () => {
  it("shows only unmapped parameters and saves the admin's mapping", async () => {
    const status = { configured: true, channel: { set: false, label: "" }, templates: [] };
    mockRoutes = {
      "GET /api/v1/company/gallabox": () => status,
      "POST /api/v1/company/gallabox/discover": () => ({
        channels: [
          { ref: "r1", label: "Sales", selected: false },
          { ref: "r2", label: "Support", selected: false },
        ],
        templates: [GUESSED, NUMBERED],
        unmapped: { "meeting_followup/en": [], "price_update/en": ["1", "2"] },
        hidden: 0,
        status,
      }),
      "PUT /api/v1/company/gallabox/channel": () => ({
        ...status,
        channel: { set: true, label: "Support" },
      }),
      "PUT /api/v1/company/gallabox/templates": () => status,
    };
    await wrap(<GallaboxSettings />);
    await waitFor(() => expect(screen.getByTestId("gallabox-picker")).toBeTruthy());
    expect(screen.queryByTestId("gallabox-map-meeting_followup/en-name")).toBeNull(); // guessed
    expect(screen.getByTestId("gallabox-map-price_update/en-1")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("gallabox-map-price_update/en-2-deal.name"));
    await fireEvent(screen.getByTestId("gallabox-channel-pick"), "change", "r2");
    await fireEvent.press(screen.getByTestId("gallabox-save-list"));
    await waitFor(() => expect(calls("PUT", "/api/v1/company/gallabox/templates")).toHaveLength(1));
    expect(calls("PUT", "/api/v1/company/gallabox/templates")[0]?.body).toEqual({
      selected: [
        { name: "meeting_followup", language: "en" },
        { name: "price_update", language: "en", mapping: { "2": "deal.name" } },
      ],
    });
  });

  it("disabled buttons say why (UX-44c)", async () => {
    mockRoutes = { "GET /api/v1/company/gallabox": () => ({ configured: false, templates: [] }) };
    await wrap(<GallaboxSettings />);
    expect(screen.getByText("Enter the API key, secret and account ID first")).toBeTruthy();
    expect(screen.getByText("Save the keys first")).toBeTruthy();
    expect(screen.queryByTestId("gallabox-channel_id")).toBeNull(); // picked, not typed
  });
});

const PEOPLE = [
  {
    zoho_id: "1",
    email: "p1@acme.test",
    name: "Person 1",
    zoho_role: "Sales Rep",
    member: false,
    role: "agent",
  },
  {
    zoho_id: "2",
    email: "p2@acme.test",
    name: "Person 2",
    zoho_role: "Sales Rep",
    member: false,
    role: "agent",
  },
  {
    zoho_id: "3",
    email: "p3@acme.test",
    name: "Person 3",
    zoho_role: "Sales Rep",
    member: true,
    role: "agent",
  },
];

describe("Invite the team from Zoho (ZC-13)", () => {
  it("previews, ticks up to the seats left, and invites only on confirm", async () => {
    mockRoutes = {
      "GET /api/v1/zoho/team": () => ({ people: PEOPLE, fallback: false, seats_left: 1 }),
      "POST /api/v1/zoho/team/invite": () => ({
        invited: [
          {
            id: "u1",
            email: "p1@acme.test",
            name: "Person 1",
            role: "agent",
            temporary_password: "tmp-1",
          },
        ],
        skipped: [],
      }),
    };
    await wrap(<ZohoInvite connected />);
    await fireEvent.press(screen.getByText("Invite your team from Zoho CRM"));
    await fireEvent.press(screen.getByTestId("zoho-invite-load"));
    await waitFor(() => expect(screen.getByTestId("zoho-invite-preview")).toBeTruthy());
    expect(screen.getByText("1 seats left")).toBeTruthy();
    expect(screen.getByTestId("zoho-person-1").props.value).toBe(true);
    expect(screen.getByTestId("zoho-person-2").props.value).toBe(false);
    expect(
      within(screen.getByTestId("zoho-person-3")).getByText(/Already on the team/),
    ).toBeTruthy();
    expect(calls("POST", "/api/v1/zoho/team/invite")).toHaveLength(0);
    await fireEvent(screen.getByTestId("zoho-person-2"), "valueChange", true);
    expect(screen.getByText("Untick some: only 1 seats left")).toBeTruthy();
    await fireEvent(screen.getByTestId("zoho-person-2"), "valueChange", false);
    await fireEvent.press(screen.getByTestId("zoho-invite-go"));
    await waitFor(() => expect(screen.getByTestId("zoho-invite-done")).toBeTruthy());
    expect(calls("POST", "/api/v1/zoho/team/invite")[0]?.body).toEqual({
      invites: [{ zoho_id: "1", role: "agent" }],
      confirm: true,
    });
    expect(screen.getByText(/tmp-1/)).toBeTruthy();
  });

  it("asks to connect Zoho first", async () => {
    await wrap(<ZohoInvite connected={false} />);
    await fireEvent.press(screen.getByText("Invite your team from Zoho CRM"));
    expect(screen.getByText("Connect your Zoho account above first.")).toBeTruthy();
  });
});
