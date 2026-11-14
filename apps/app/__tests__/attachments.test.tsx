/** Email attachments (INT-14b, UX-22): the admin curates the list; the agent picks a file in the
 * follow-up email, the preview lists it, and the "mentions an attachment" warning clears. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { EmailAction } from "../features/email";
import { AttachmentsSettings, sizeLabel } from "../features/email/AttachmentsSettings";
import { EMAIL_TEXT } from "../features/email/strings";
import { followUpWarnings } from "../features/email/warnings";
import type { Locale } from "../lib/i18n";
import { LocaleProvider } from "../lib/locale";

let mockCloud: unknown = { status: "off" };
jest.mock("../lib/useCloud", () => ({ useCloud: () => mockCloud }));
type Call = { path: string; method: string; body: unknown; raw?: unknown };
const mockCalls: Call[] = [];
let mockRoutes: Record<string, (body: unknown) => unknown> = {};
jest.mock("../lib/cloud", () => {
  class CloudError extends Error {}
  return {
    CloudError,
    refreshFeatures: jest.fn(),
    cloudApi: jest.fn(
      async (path: string, init: { method?: string; body?: unknown; raw?: unknown } = {}) => {
        const method = init.method ?? "GET";
        const clean = path.split("?")[0] ?? path;
        mockCalls.push({ path, method, body: init.body, raw: init.raw });
        const fn = mockRoutes[`${method} ${clean}`];
        if (!fn) throw new CloudError(`no mock for ${method} ${clean}`);
        return fn(init.body);
      },
    ),
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
const FILE = {
  id: "a1b2c3d4e5f60718",
  name: "Proposal.pdf",
  mime: "application/pdf",
  size: 52_000,
};

beforeEach(() => {
  mockCalls.length = 0;
  mockRoutes = {};
});

describe("warning (UX-22)", () => {
  it("clears once a file is attached", () => {
    expect(followUpWarnings("Please find the proposal attached.").attached).toBe(true);
    expect(followUpWarnings("Please find the proposal attached.", 1).attached).toBe(false);
  });
  it("sizes read as KB or MB", () => {
    expect(sizeLabel(52_000)).toBe("51 KB");
    expect(sizeLabel(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("admin list (INT-14b)", () => {
  it("lists, deletes, and says which types and sizes are allowed", async () => {
    signedIn("admin");
    mockRoutes = {
      "GET /api/v1/company/email/attachments": () => ({
        attachments: [{ ...FILE, created_at: 1 }],
        types: ["pdf"],
      }),
      [`DELETE /api/v1/company/email/attachments/${FILE.id}`]: () => ({
        attachments: [],
        types: ["pdf"],
      }),
    };
    await wrap(<AttachmentsSettings />);
    await waitFor(() => expect(screen.getByTestId(`attachment-${FILE.id}`)).toBeTruthy());
    expect(screen.getByText(EMAIL_TEXT.en["att.limits"])).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`attachment-delete-${FILE.id}`));
    await waitFor(() => expect(screen.getByTestId("attachments-empty")).toBeTruthy());
  });

  it("is in Arabic too, and says why when the org turned it off", async () => {
    signedIn("admin");
    mockRoutes = {
      "GET /api/v1/company/email/attachments": () => ({ attachments: [], types: [] }),
    };
    await wrap(<AttachmentsSettings />, "ar");
    await waitFor(() => expect(screen.getByText(EMAIL_TEXT.ar["att.title"])).toBeTruthy());
    signedIn("admin", { email_attachments: { state: "off_by_org" } });
    await wrap(<AttachmentsSettings />);
    expect(screen.queryByTestId("attachments-settings")).toBeNull();
  });
});

describe("the agent's follow-up email", () => {
  const PREVIEW = {
    from: { name: "Acme", address: "sales@acme.test" },
    to: ["jane@customer.test"],
    cc: [],
    subject: "Proposal",
    text: "Hi Jane,\n\nThe proposal is attached.",
  };

  it("picks from the admin's list (no upload), and the preview lists the file", async () => {
    signedIn("agent");
    mockRoutes = {
      "GET /api/v1/email/senders": () => ({
        senders: [{ id: "org", from_name: "Acme", from_address: "sales@acme.test" }],
      }),
      "GET /api/v1/email/formats": () => ({
        formats: [
          {
            id: "follow_up",
            name: "Follow-up",
            kind: "follow_up",
            subject: "",
            opening: "",
            body: "",
            signature: "",
          },
        ],
      }),
      "GET /api/v1/email/attachments": () => ({ attachments: [FILE] }),
      "POST /api/v1/email/preview": (body) =>
        (body as { attachments?: string[] }).attachments?.length
          ? { ...PREVIEW, attachments: [{ name: FILE.name, size: FILE.size }] }
          : PREVIEW,
    };
    await wrap(
      <EmailAction
        callId="call-1"
        customer={{ name: "Jane", email: "jane@customer.test" }}
        draft={{ subject: "Proposal", body: "The proposal is attached." }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId(`email-attach-${FILE.id}`)).toBeTruthy());
    expect(screen.queryByTestId("attachments-add")).toBeNull(); // agents never upload
    // Without the file the warning shows.
    await fireEvent.press(screen.getByTestId("email-preview"));
    await waitFor(() => expect(screen.getByTestId("email-warn-attached")).toBeTruthy());
    await fireEvent.press(screen.getByTestId("email-edit"));
    await fireEvent(screen.getByTestId(`email-attach-${FILE.id}`), "valueChange", true);
    await fireEvent.press(screen.getByTestId("email-preview"));
    await waitFor(() => expect(screen.getByTestId("email-preview-attachments")).toBeTruthy());
    expect(screen.queryByTestId("email-warn-attached")).toBeNull();
    const last = mockCalls.filter((c) => c.path === "/api/v1/email/preview").pop();
    expect((last?.body as { attachments?: string[] } | undefined)?.attachments).toEqual([FILE.id]);
  });
});
