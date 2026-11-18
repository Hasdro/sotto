import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import * as ReactNative from "react-native";
import RootLayout from "../app/_layout";
import AdminLayout from "../app/admin/_layout";
import TeamScreen from "../app/admin/index";
import SettingsScreen from "../app/admin/settings";
import CallDetailScreen from "../app/history/[id]";
import HistoryScreen from "../app/history/index";
import InboxScreen from "../app/inbox";
import PlaybookScreen from "../app/playbook";

const routes = {
  _layout: RootLayout,
  "history/index": HistoryScreen,
  "history/[id]": CallDetailScreen,
  playbook: PlaybookScreen,
  inbox: InboxScreen,
  "admin/_layout": AdminLayout,
  "admin/index": TeamScreen,
  "admin/settings": SettingsScreen,
};

async function open(url: string) {
  await renderRouter(routes, { initialUrl: url });
}

/** Below the wide breakpoint the navigation lives in the drawer (D-023). */
async function openMenu() {
  await fireEvent.press(screen.getByTestId("menu-button"));
}

async function drawerClosed() {
  await waitFor(() => expect(screen.queryByTestId("nav-drawer")).toBeNull());
}

describe("mock screens", () => {
  it("navigation lists the five areas", async () => {
    await open("/history");
    await openMenu();
    for (const name of ["Call", "History", "Playbook", "Inbox", "Admin"]) {
      expect(screen.getByRole("link", { name: new RegExp(`^${name}`) })).toBeOnTheScreen();
    }
  });

  it("managers and admins see the trial banner with days, seats and minutes (R3)", async () => {
    await open("/history");
    expect(screen.getByTestId("plan-banner")).toHaveTextContent(
      /Trial: 9 days left · 3 of 5 seats · 412 of 1,000 call minutes/,
    );
  });

  it("history lists past calls", async () => {
    await open("/history");
    expect(screen.getByText("Layla Haddad")).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: /Omar Al Mansouri/ })).toBeOnTheScreen();
  });

  it("a past call shows its transcript and the cards shown", async () => {
    await open("/history/c-1041");
    expect(screen.getByText("Omar Al Mansouri")).toBeOnTheScreen();
    expect(screen.getByText("Cards shown")).toBeOnTheScreen();
    expect(screen.getByText(/Ask what their quote includes/)).toBeOnTheScreen();
  });

  it("history detail of an unknown call says so", async () => {
    await open("/history/nope");
    expect(screen.getByText("This call is not in your history.")).toBeOnTheScreen();
  });

  it("playbook search filters the answers", async () => {
    await open("/playbook");
    expect(screen.getByText("Answers: 6")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("playbook-search"), "freehold");
    expect(screen.getByText("Answers: 1")).toBeOnTheScreen();
    expect(screen.getByText("Can foreigners buy freehold here?")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("playbook-search"), "zzz");
    expect(screen.getByText("No matching answers")).toBeOnTheScreen();
  });

  it("inbox filters open, answered and added", async () => {
    await open("/inbox");
    expect(screen.getByText("Can I pay the deposit in bitcoin?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("inbox-filter-answered"));
    expect(screen.getByText("Is there a discount for buying two units?")).toBeOnTheScreen();
    expect(screen.queryByText("Can I pay the deposit in bitcoin?")).toBeNull();
    await fireEvent.press(screen.getByTestId("inbox-filter-added"));
    expect(screen.getByText("Are pets allowed in the Marina tower?")).toBeOnTheScreen();
  });

  it("admin team shows no sample staff; without a Sotto account it says one is needed", async () => {
    await open("/admin");
    expect(screen.getByText("Team needs a Sales Shield account")).toBeOnTheScreen();
    expect(screen.queryByText("Hana Saleh")).toBeNull();
  });

  it("settings switches the app to Arabic", async () => {
    await open("/admin/settings");
    expect(screen.getByText("App language")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("app-language-ar"));
    expect(screen.getByText("لغة التطبيق")).toBeOnTheScreen();
    await openMenu();
    expect(screen.getByRole("link", { name: /^السجل/ })).toBeOnTheScreen();
  });

  it("the demo role switch hides areas an agent may not open (R3, draft D-050 (backlog))", async () => {
    await open("/history");
    await openMenu();
    await fireEvent.press(screen.getByTestId("role-switch-agent"));
    for (const name of ["Call", "History"]) {
      expect(screen.getByRole("link", { name: new RegExp(`^${name}`) })).toBeOnTheScreen();
    }
    expect(screen.queryByRole("link", { name: /^Playbook/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Inbox/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Admin/ })).toBeNull();
    await fireEvent.press(screen.getByTestId("role-switch-manager"));
    expect(screen.getByRole("link", { name: /^Inbox/ })).toBeOnTheScreen();
    expect(screen.queryByRole("link", { name: /^Admin/ })).toBeNull();
  });

  it.each(["/playbook", "/inbox"])(
    "an agent who opens %s by URL gets the no-access page (draft D-050 (backlog))",
    async (path) => {
      await open(path);
      await openMenu();
      await fireEvent.press(screen.getByTestId("role-switch-agent"));
      expect(screen.getByTestId("no-access")).toBeOnTheScreen();
      expect(screen.queryByTestId("playbook-search")).toBeNull();
      await fireEvent.press(screen.getByTestId("role-switch-admin")); // the choice is remembered
    },
  );

  it("a page outside the role's areas shows why instead of the page", async () => {
    await open("/admin/settings");
    expect(screen.getByText("App language")).toBeOnTheScreen();
    await openMenu();
    await fireEvent.press(screen.getByTestId("role-switch-manager"));
    expect(screen.queryByText("App language")).toBeNull();
    expect(screen.getByText("Not available for this role")).toBeOnTheScreen();
    expect(screen.getByText("This page isn't open to the Sales manager role.")).toBeOnTheScreen();
  });

  it("a manager answers an inbox question and it lands in the playbook (R2 step 5)", async () => {
    await open("/inbox");
    await fireEvent.changeText(
      screen.getByTestId("answer-q-31"),
      "No: card or bank transfer only.",
    );
    expect(screen.getByText("6 of 25 words")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("add-q-31"));
    expect(
      screen.getByText("Added to the playbook: Can I pay the deposit in bitcoin?"),
    ).toBeOnTheScreen();
    await openMenu();
    await fireEvent.press(screen.getByRole("link", { name: /^Playbook/ }));
    await fireEvent.changeText(screen.getByTestId("playbook-search"), "bitcoin");
    expect(screen.getByText("Answers: 1")).toBeOnTheScreen();
    expect(screen.getByText("No: card or bank transfer only.")).toBeOnTheScreen();
  });

  it("the inbox refuses an answer too long to say from one card", async () => {
    await open("/inbox");
    const long = Array.from({ length: 26 }, () => "word").join(" ");
    await fireEvent.changeText(screen.getByTestId("answer-q-30"), long);
    await fireEvent.press(screen.getByTestId("add-q-30"));
    expect(
      screen.getByText("Keep it to 25 words so the agent can say it from one card."),
    ).toBeOnTheScreen();
  });
});

describe("navigation shell (D-023)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("phones get a menu button and no bottom tabs; the drawer starts closed", async () => {
    await open("/history");
    const button = screen.getByTestId("menu-button");
    expect(button).toBeCollapsed();
    expect(screen.queryByTestId("nav-drawer")).toBeNull();
    expect(screen.queryByRole("link", { name: /^Playbook/ })).toBeNull();
  });

  it("the menu button opens the drawer with every item, the role switch and the user", async () => {
    await open("/history");
    await openMenu();
    expect(screen.getByTestId("nav-drawer")).toBeOnTheScreen();
    expect(screen.getByTestId("menu-button")).toBeExpanded();
    for (const name of ["Call", "History", "Playbook", "Inbox", "Admin"]) {
      expect(screen.getByRole("link", { name: new RegExp(`^${name}`) })).toBeOnTheScreen();
    }
    expect(screen.getByRole("link", { name: /^History/ })).toBeSelected();
    expect(screen.getByTestId("role-switch")).toBeOnTheScreen();
    expect(screen.getByText("Company admin")).toBeOnTheScreen();
  });

  it("shows the open-question count on Inbox and a dot on the menu button", async () => {
    await open("/history");
    expect(screen.getByTestId("menu-dot")).toBeOnTheScreen();
    expect(screen.getByLabelText("Open menu, 2 open questions")).toBeOnTheScreen();
    await openMenu();
    expect(screen.getByRole("link", { name: /^Inbox/ })).toHaveTextContent(/Inbox\s*2/);
  });

  it("a tap on the scrim closes the drawer", async () => {
    await open("/history");
    await openMenu();
    // Touch-only: screen readers get the close button, the scrim sits outside the modal panel.
    await fireEvent.press(screen.getByTestId("nav-scrim", { includeHiddenElements: true }));
    await drawerClosed();
  });

  it("the close button closes the drawer", async () => {
    await open("/history");
    await openMenu();
    await fireEvent.press(screen.getByLabelText("Close menu", { exact: true }));
    await drawerClosed();
  });

  it("Android back / Escape (Modal onRequestClose) closes the drawer", async () => {
    await open("/history");
    await openMenu();
    // fireEvent bubbles up to the Modal's onRequestClose.
    await fireEvent(screen.getByTestId("nav-drawer"), "requestClose");
    await drawerClosed();
  });

  it("an item navigates and closes the drawer", async () => {
    await open("/history");
    await openMenu();
    await fireEvent.press(screen.getByRole("link", { name: /^Playbook/ }));
    await drawerClosed();
    expect(screen.getByTestId("playbook-search")).toBeOnTheScreen();
  });

  it("in Arabic the drawer opens from the right", async () => {
    await open("/admin/settings");
    await fireEvent.press(screen.getByTestId("app-language-ar"));
    await openMenu();
    expect(screen.getByTestId("nav-drawer")).toHaveStyle({ right: 0 });
    expect(screen.getByLabelText("إغلاق القائمة", { exact: true })).toBeOnTheScreen();
  });

  it("in English the drawer opens from the left", async () => {
    await open("/history");
    await openMenu();
    expect(screen.getByTestId("nav-drawer")).toHaveStyle({ left: 0 });
  });

  it("wide windows keep the sidebar and have no menu button", async () => {
    jest
      .spyOn(ReactNative.Dimensions, "get")
      .mockReturnValue({ width: 1280, height: 900, scale: 1, fontScale: 1 });
    await open("/history");
    expect(screen.queryByTestId("menu-button")).toBeNull();
    expect(screen.getByRole("link", { name: /^Playbook/ })).toBeOnTheScreen();
  });
});
