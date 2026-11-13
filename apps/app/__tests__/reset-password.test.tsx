/** UX-39r: /reset-password drops the token from the address bar and the referrer before any
 * request, then sets the new password; expired and used links get one product-voice line. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Platform } from "react-native";
import ResetPasswordScreen from "../app/reset-password";
import { CloudError, confirmPasswordReset } from "../lib/cloud";
import { LocaleProvider } from "../lib/locale";

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
  return { CloudError, confirmPasswordReset: jest.fn() };
});

const events: string[] = [];
const g = globalThis as Record<string, unknown>;
let meta: Record<string, string> | null = null;

beforeEach(() => {
  events.length = 0;
  meta = null;
  Object.defineProperty(Platform, "OS", { get: () => "web", configurable: true });
  const location = { hash: "#token=abc123", pathname: "/reset-password", search: "" };
  g.location = location;
  g.history = {
    replaceState: (_d: unknown, _u: string, url: string) => {
      events.push(`replace:${url}`);
      location.hash = "";
    },
  };
  g.document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    documentElement: {},
    head: {
      querySelector: () => null,
      appendChild: () => events.push("meta"),
    },
    createElement: () => {
      meta = {};
      return {
        setAttribute: (k: string, v: string) => {
          if (meta) meta[k] = v;
        },
      };
    },
  };
  jest.mocked(confirmPasswordReset).mockReset();
  jest.mocked(confirmPasswordReset).mockImplementation(async (token) => {
    events.push(`confirm:${token}:${(g.location as { hash: string }).hash}`);
  });
});

afterAll(() => {
  delete g.location;
  delete g.history;
  delete g.document;
});

const wrap = () =>
  render(
    <LocaleProvider initial="en">
      <UIProvider direction="ltr">
        <ResetPasswordScreen />
      </UIProvider>
    </LocaleProvider>,
  );

async function fill(a: string, b = a) {
  await fireEvent.changeText(screen.getByTestId("reset-new"), a);
  await fireEvent.changeText(screen.getByTestId("reset-again"), b);
  await fireEvent.press(screen.getByTestId("reset-save"));
}

describe("/reset-password", () => {
  it("drops the token from the URL and sets no-referrer before any request", async () => {
    await wrap();
    expect(events).toEqual(["meta", "replace:/reset-password"]);
    expect(meta).toEqual({ name: "referrer", content: "no-referrer" });
    await fill("a-long-new-password");
    await waitFor(() => expect(screen.getByTestId("reset-done")).toBeOnTheScreen());
    expect(events).toEqual(["meta", "replace:/reset-password", "confirm:abc123:"]);
  });

  it("checks length and that both passwords match before asking the server", async () => {
    await wrap();
    await fill("short");
    expect(screen.getByTestId("reset-error")).toHaveTextContent("Use 10 or more characters.");
    await fill("a-long-new-password", "a-long-new-passwort");
    expect(screen.getByTestId("reset-error")).toHaveTextContent("The two passwords are different.");
    expect(jest.mocked(confirmPasswordReset)).not.toHaveBeenCalled();
  });

  it("an expired or used link gets one product-voice line", async () => {
    jest
      .mocked(confirmPasswordReset)
      .mockRejectedValue(new CloudError(400, "reset_invalid", "this reset link is not valid"));
    await wrap();
    await fill("a-long-new-password");
    await waitFor(() =>
      expect(screen.getByTestId("reset-error")).toHaveTextContent(
        "This link has expired or was already used. Ask for a new one from the sign-in screen.",
      ),
    );
  });

  it("without a token it says the link is incomplete and cannot submit", async () => {
    (g.location as { hash: string }).hash = "";
    await wrap();
    expect(screen.getByTestId("reset-error")).toHaveTextContent(/^This link is incomplete\./);
    expect(screen.getByTestId("reset-save")).toBeDisabled();
  });
});
