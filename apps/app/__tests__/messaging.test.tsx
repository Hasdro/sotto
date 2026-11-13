/** Email and WhatsApp (R12, D-032, D-033, D-039): write-only Integrations forms, the template
 * picker, and post-call actions that send nothing before the agent confirms the exact preview. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { EmailAction } from "../features/email";
import { SmtpSettings } from "../features/email/SmtpSettings";
import { EMAIL_TEXT } from "../features/email/strings";
import { WhatsAppAction } from "../features/whatsapp";
import { GallaboxSettings } from "../features/whatsapp/GallaboxSettings";
import { WHATSAPP_TEXT } from "../features/whatsapp/strings";
import type { Locale } from "../lib/i18n";
import { LocaleProvider } from "../lib/locale";

let mockCloud: unknown = { status: "off" };
jest.mock("../lib/useCloud", () => ({ useCloud: () => mockCloud }));
type Call = { path: string; method: string; body: unknown };
const mockCalls: Call[] = [];
let mockRoutes: Record<string, (body: unknown) => unknown> = {};
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
    refreshFeatures: jest.fn(),
    cloudApi: jest.fn(async (path: string, init: { method?: string; body?: unknown } = {}) => {
      const method = init.method ?? "GET";
      const clean = path.split("?")[0] ?? path;
      mockCalls.push({ path: clean, method, body: init.body });
      const fn = mockRoutes[`${method} ${clean}`];
      if (!fn) throw new CloudError(404, "not_found", `no mock for ${method} ${clean}`);
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
const signedIn = (role: string, features: Record<string, unknown> = {}) => {
  mockCloud = { status: "signed_in", me: { user: { id: "u", role }, features } };
};
const sent = (path: string) => mockCalls.filter((c) => c.path === path && c.method === "POST");
const fail = (message: string) => {
  const err = new Error(message);
  throw err;
};

const NONE = { configured: false };
const TEMPLATE = {
  name: "meeting_followup",
  language: "en",
  category: "UTILITY",
  status: "APPROVED",
  body: "Thanks {{name}}, see you on {{date}}.",
  params: [
    { name: "name", component: "header", type: "text", example: "" },
    { name: "name", component: "body", type: "text", example: "Jane" },
    { name: "date", component: "body", type: "text", example: "12 Dec" },
  ],
};

beforeEach(() => {
  mockCalls.length = 0;
  mockRoutes = {};
});

describe("strings", () => {
  it("has English and Arabic in step", () => {
    for (const table of [EMAIL_TEXT, WHATSAPP_TEXT]) {
      expect(Object.keys(table.ar).sort()).toEqual(Object.keys(table.en).sort());
      for (const v of Object.values(table.ar)) expect(v.trim()).not.toBe("");
    }
  });
});

describe("SmtpSettings", () => {
  it("saves write-only and shows the mail server's exact error on a failed test", async () => {
    signedIn("admin");
    let status: Record<string, unknown> = { platform: NONE, org: NONE, active: null };
    mockRoutes = {
      "GET /api/v1/company/smtp": () => status,
      "GET /api/v1/email/formats": () => ({ formats: [] }),
      "PUT /api/v1/company/smtp": () => {
        status = {
          platform: NONE,
          org: {
            configured: true,
            host: "smtp.hostinger.com",
            port: 465,
            from_name: "Acme",
            from_address: "sales@acme.test",
            updated_at: 1,
          },
          active: "org",
        };
        return status;
      },
      "POST /api/v1/company/smtp/test": () => ({
        ok: false,
        to: "admin@acme.test",
        error: "535 5.7.8 Error: authentication failed",
      }),
    };
    await wrap(<SmtpSettings />);
    expect(screen.getByTestId("smtp-password").props.secureTextEntry).toBe(true);
    await fireEvent.changeText(screen.getByTestId("smtp-host"), "smtp.hostinger.com");
    await fireEvent.changeText(screen.getByTestId("smtp-username"), "login");
    await fireEvent.changeText(screen.getByTestId("smtp-password"), "pw");
    await fireEvent.changeText(screen.getByTestId("smtp-from-name"), "Acme");
    await fireEvent.changeText(screen.getByTestId("smtp-from-address"), "sales@acme.test");
    await fireEvent.press(screen.getByTestId("smtp-save"));
    await waitFor(() => expect(screen.getByText("Saved.")).toBeTruthy());
    expect(mockCalls.find((c) => c.method === "PUT")?.body).toEqual({
      host: "smtp.hostinger.com",
      port: 465,
      username: "login",
      password: "pw",
      from_name: "Acme",
      from_address: "sales@acme.test",
    });
    // The typed login is cleared after saving: it is never shown again.
    expect(screen.getByTestId("smtp-password").props.value).toBe("");
    await fireEvent.press(screen.getByTestId("smtp-test"));
    await waitFor(() =>
      expect(screen.getByTestId("smtp-test-result").props.children).toBe(
        "The mail server said: 535 5.7.8 Error: authentication failed",
      ),
    );
  });
});

describe("GallaboxSettings", () => {
  it("loads templates into the picker, refuses unapproved ones and saves the choice", async () => {
    signedIn("admin");
    let status = { configured: true, templates: [] as unknown[] };
    mockRoutes = {
      "GET /api/v1/company/gallabox": () => status,
      "POST /api/v1/company/gallabox/templates/load": () => ({
        templates: [TEMPLATE, { ...TEMPLATE, name: "promo", status: "PENDING", params: [] }],
      }),
      "PUT /api/v1/company/gallabox/templates": () => {
        status = { configured: true, templates: [TEMPLATE] };
        return status;
      },
    };
    await wrap(<GallaboxSettings />);
    for (const id of ["api_key", "api_secret"]) {
      expect(screen.getByTestId(`gallabox-${id}`).props.secureTextEntry).toBe(true);
    }
    await waitFor(() => expect(screen.getByText("No templates on the list yet.")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("gallabox-load"));
    await waitFor(() => expect(screen.getByTestId("gallabox-picker")).toBeTruthy());
    expect(screen.getByText("Fills: name, date")).toBeTruthy();
    expect(screen.getByText("Not approved yet (PENDING)")).toBeTruthy();
    await fireEvent(screen.getByTestId("gallabox-pick-promo/en"), "valueChange", true);
    await fireEvent(screen.getByTestId("gallabox-pick-meeting_followup/en"), "valueChange", true);
    await fireEvent.press(screen.getByTestId("gallabox-save-list"));
    await waitFor(() => expect(screen.getByText("Saved 1 templates.")).toBeTruthy());
    expect(mockCalls.find((c) => c.method === "PUT")?.body).toEqual({
      selected: [{ name: "meeting_followup", language: "en" }],
    });
  });
});

const FORMATS = [
  {
    id: "follow_up",
    name: "Follow-up",
    kind: "follow_up",
    subject: "Following up",
    opening: "Hi {{customer.name}},",
    body: "Example",
    signature: "Best,\n{{agent.name}}",
  },
];
const PREVIEW = {
  from: { name: "Acme Sales", address: "sales@acme.test" },
  to: ["jane@acme.test"],
  cc: [],
  subject: "Pricing",
  text: "Hi Jane,\n\nHere it is.\n\nBest,\nSam",
};

describe("EmailAction", () => {
  it("is greyed with a reason until a sender exists", async () => {
    signedIn("agent", { email_send: { state: "needs_connection", cause: "email_sender" } });
    await wrap(<EmailAction callId="c1" />);
    expect(screen.getByTestId("feature-off-email_send")).toBeTruthy();
    expect(mockCalls).toEqual([]);
  });

  it("sends nothing before confirm, and a retry reuses the idempotency key", async () => {
    signedIn("agent", { email_send: { state: "available" } });
    let attempts = 0;
    mockRoutes = {
      "GET /api/v1/email/senders": () => ({
        senders: [{ id: "org", from_name: "Acme Sales", from_address: "sales@acme.test" }],
      }),
      "GET /api/v1/email/formats": () => ({ formats: FORMATS }),
      "POST /api/v1/email/preview": () => PREVIEW,
      "POST /api/v1/email/send": () => {
        attempts += 1;
        return attempts === 1 ? fail("network down") : { status: "sent", duplicate: false };
      },
    };
    await wrap(
      <EmailAction
        callId="c1"
        customer={{ name: "Jane", email: "jane@acme.test" }}
        draft={{ subject: "Pricing", body: "Here it is." }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId("email-sender")).toBeTruthy());
    expect(screen.getByTestId("email-to").props.value).toBe("jane@acme.test");
    expect(screen.getByTestId("email-body").props.value).toBe("Here it is.");
    await fireEvent.press(screen.getByTestId("email-preview"));
    await waitFor(() => expect(screen.getByTestId("email-preview-text")).toBeTruthy());
    expect(screen.getByTestId("email-preview-text").props.children).toBe(PREVIEW.text);
    expect(sent("/api/v1/email/send")).toEqual([]);
    expect(sent("/api/v1/email/preview")[0]?.body).toEqual({
      sender: "org",
      format: "follow_up",
      to: ["jane@acme.test"],
      cc: [],
      subject: "Pricing",
      body: "Here it is.",
      customer_name: "Jane",
    });
    await fireEvent.press(screen.getByTestId("email-confirm"));
    await waitFor(() => expect(screen.getByTestId("email-error")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("email-confirm"));
    await waitFor(() => expect(screen.getByText("Sent to jane@acme.test.")).toBeTruthy());
    const keys = sent("/api/v1/email/send").map(
      (c) => (c.body as { idempotency_key: string; confirm: boolean }).idempotency_key,
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toMatch(/^c1-email-/);
    expect(sent("/api/v1/email/send")[0]?.body).toMatchObject({ confirm: true });
  });

  it("renders in Arabic", async () => {
    signedIn("agent", { email_send: { state: "available" } });
    mockRoutes = {
      "GET /api/v1/email/senders": () => ({ senders: [] }),
      "GET /api/v1/email/formats": () => ({ formats: FORMATS }),
    };
    await wrap(<EmailAction callId="c1" />, "ar");
    expect(screen.getByText("إرسال بريد إلكتروني")).toBeTruthy();
  });
});

describe("WhatsAppAction", () => {
  it("prefills the name, previews, then sends the template once on confirm", async () => {
    signedIn("agent", { whatsapp: { state: "available" } });
    mockRoutes = {
      "GET /api/v1/whatsapp/templates": () => ({ templates: [TEMPLATE], freeform: false }),
      "POST /api/v1/whatsapp/preview": () => ({
        template: "meeting_followup",
        language: "en",
        to: { name: "Jane Doe", phone: "+971501234567" },
        text: "Thanks Jane, see you on 12 Dec.",
      }),
      "POST /api/v1/whatsapp/send": () => ({ status: "sent", duplicate: false }),
    };
    await wrap(
      <WhatsAppAction callId="c9" customer={{ name: "Jane Doe", phone: "+971 50 123 4567" }} />,
    );
    await waitFor(() => expect(screen.getByTestId("whatsapp-param-name")).toBeTruthy());
    expect(screen.getByTestId("whatsapp-param-name").props.value).toBe("Jane");
    expect(screen.queryByTestId("whatsapp-param-date")?.props.value).toBe("");
    expect(screen.getByTestId("whatsapp-preview").props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId("whatsapp-param-date"), "12 Dec");
    await fireEvent.press(screen.getByTestId("whatsapp-preview"));
    await waitFor(() => expect(screen.getByTestId("whatsapp-preview-text")).toBeTruthy());
    expect(sent("/api/v1/whatsapp/send")).toEqual([]);
    await fireEvent.press(screen.getByTestId("whatsapp-confirm"));
    await waitFor(() => expect(screen.getByText("Sent.")).toBeTruthy());
    const body = sent("/api/v1/whatsapp/send")[0]?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      template: "meeting_followup",
      language: "en",
      type: "template",
      confirm: true,
      recipient: { name: "Jane Doe", phone: "+971 50 123 4567" },
      values: { name: "Jane", date: "12 Dec" },
    });
    expect(String(body.idempotency_key)).toMatch(/^c9-wa-/);
  });

  it("says so when the admin chose no templates", async () => {
    signedIn("agent", { whatsapp: { state: "available" } });
    mockRoutes = { "GET /api/v1/whatsapp/templates": () => ({ templates: [], freeform: false }) };
    await wrap(<WhatsAppAction callId="c9" />);
    await waitFor(() => expect(screen.getByTestId("whatsapp-none")).toBeTruthy());
  });

  it("is hidden for a role it is not for", async () => {
    signedIn("agent", { whatsapp: { state: "no_permission" } });
    await wrap(<WhatsAppAction callId="c9" />);
    expect(screen.queryByTestId("whatsapp-action")).toBeNull();
  });
});
