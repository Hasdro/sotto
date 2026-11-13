/** UX-39: Sign in and Create a company are separate screens; Forgot password asks for a link;
 * the sign-in screen says the session lasts on this computer. */
import { UIProvider } from "@sotto/ui";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AccountGate } from "../features/account/AccountGate";
import { requestPasswordReset, signIn, signUp } from "../lib/cloud";
import { LocaleProvider } from "../lib/locale";

jest.mock("../lib/useCloud", () => ({ useCloud: () => ({ status: "signed_out", error: null }) }));
jest.mock("../lib/cloud", () => ({
  CloudError: class extends Error {
    status = 0;
  },
  startCloud: jest.fn(async () => {}),
  signIn: jest.fn(async () => {}),
  signUp: jest.fn(async () => {}),
  changePassword: jest.fn(async () => {}),
  requestPasswordReset: jest.fn(async () => {}),
}));

const wrap = () =>
  render(
    <LocaleProvider initial="en">
      <UIProvider direction="ltr">
        <AccountGate>{null}</AccountGate>
      </UIProvider>
    </LocaleProvider>,
  );

describe("sign-in screens", () => {
  it("sign in asks only for email and password, and says you stay signed in", async () => {
    await wrap();
    expect(screen.getByTestId("acct-email")).toBeOnTheScreen();
    expect(screen.getByTestId("acct-password")).toBeOnTheScreen();
    expect(screen.queryByTestId("acct-company")).toBeNull();
    expect(screen.queryByTestId("acct-name")).toBeNull();
    expect(screen.getByText("You'll stay signed in on this computer.")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("acct-email"), " sara@acme.test ");
    await fireEvent.changeText(screen.getByTestId("acct-password"), "secret-pass-1");
    await fireEvent.press(screen.getByTestId("acct-submit"));
    expect(jest.mocked(signIn)).toHaveBeenCalledWith("sara@acme.test", "secret-pass-1");
  });

  it("Create a company is its own screen with today's sign-up fields", async () => {
    await wrap();
    await fireEvent.press(screen.getByTestId("acct-switch"));
    expect(screen.getByTestId("account-create")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Start your free trial" })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("acct-company"), "Acme");
    await fireEvent.changeText(screen.getByTestId("acct-name"), "Sara");
    await fireEvent.changeText(screen.getByTestId("acct-email"), "sara@acme.test");
    await fireEvent.changeText(screen.getByTestId("acct-password"), "secret-pass-1");
    await fireEvent.press(screen.getByTestId("acct-submit"));
    expect(jest.mocked(signUp)).toHaveBeenCalledWith({
      company: "Acme",
      name: "Sara",
      email: "sara@acme.test",
      password: "secret-pass-1",
    });
    await fireEvent.press(screen.getByTestId("acct-switch"));
    expect(screen.queryByTestId("acct-company")).toBeNull();
  });

  it("Forgot password sends the reset request and says the same thing for any address", async () => {
    await wrap();
    await fireEvent.changeText(screen.getByTestId("acct-email"), "sara@acme.test");
    await fireEvent.press(screen.getByTestId("acct-forgot"));
    expect(screen.getByTestId("account-forgot")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("acct-reset-send"));
    expect(jest.mocked(requestPasswordReset)).toHaveBeenCalledWith("sara@acme.test");
    await waitFor(() => expect(screen.getByTestId("acct-reset-sent")).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId("acct-back"));
    expect(screen.getByTestId("acct-password")).toBeOnTheScreen();
  });
});
