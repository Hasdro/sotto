import { fireEvent, screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import RootLayout from "../app/_layout";
import AdminLayout from "../app/admin/_layout";
import TeamScreen from "../app/admin/index";
import ModelsScreen from "../app/admin/models";
import PromptsScreen from "../app/admin/prompts";
import PromptDetailScreen from "../app/admin/prompts/[key]";
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
  "admin/prompts/index": PromptsScreen,
  "admin/prompts/[key]": PromptDetailScreen,
  "admin/models": ModelsScreen,
  "admin/settings": SettingsScreen,
};

async function open(url: string) {
  await renderRouter(routes, { initialUrl: url });
}

describe("mock screens", () => {
  it("navigation lists the five areas", async () => {
    await open("/history");
    for (const name of ["Call", "History", "Playbook", "Inbox", "Admin"]) {
      expect(screen.getByRole("link", { name: new RegExp(`^${name}`) })).toBeOnTheScreen();
    }
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

  it("admin team shows members with roles", async () => {
    await open("/admin");
    expect(screen.getByText("Hana Saleh")).toBeOnTheScreen();
    expect(screen.getByText("Company admin")).toBeOnTheScreen();
  });

  it("admin prompts lists versions", async () => {
    await open("/admin/prompts");
    expect(screen.getByText("suggest")).toBeOnTheScreen();
    expect(screen.getByText("Published v4")).toBeOnTheScreen();
  });

  it("admin models shows provider, model and benchmark per stage (R6)", async () => {
    await open("/admin/models");
    expect(screen.getByText("Live suggestion")).toBeOnTheScreen();
    expect(screen.getByText(/^520 ms/)).toBeOnTheScreen();
    expect(screen.getAllByText("Meets target").length).toBeGreaterThan(0);
    expect(screen.getByText("Too slow")).toBeOnTheScreen();
  });

  it("settings switches the app to Arabic", async () => {
    await open("/admin/settings");
    expect(screen.getByText("App language")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("app-language-ar"));
    expect(screen.getByText("لغة التطبيق")).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: /^السجل/ })).toBeOnTheScreen();
  });

  it("the demo role switch hides areas an agent may not open (R3)", async () => {
    await open("/history");
    await fireEvent.press(screen.getByTestId("role-switch-agent"));
    for (const name of ["Call", "History", "Playbook"]) {
      expect(screen.getByRole("link", { name: new RegExp(`^${name}`) })).toBeOnTheScreen();
    }
    expect(screen.queryByRole("link", { name: /^Inbox/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Admin/ })).toBeNull();
    await fireEvent.press(screen.getByTestId("role-switch-manager"));
    expect(screen.getByRole("link", { name: /^Inbox/ })).toBeOnTheScreen();
    expect(screen.queryByRole("link", { name: /^Admin/ })).toBeNull();
  });

  it("a page outside the role's areas shows why instead of the page", async () => {
    await open("/admin/prompts");
    expect(screen.getByText("Published v4")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("role-switch-manager"));
    expect(screen.queryByText("Published v4")).toBeNull();
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

  it("prompt studio: draft, publish, then roll back with one click (R6)", async () => {
    await open("/admin/prompts/suggest");
    expect(screen.getByText("Calls use v4")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("publish-5"));
    expect(screen.getByText("Calls use v5")).toBeOnTheScreen();

    await fireEvent.changeText(
      screen.getByTestId("prompt-editor"),
      "Company: {{company.name}}\nDeal: {{crm.deal.stage}}",
    );
    expect(screen.getByText("Not in this prompt's variables: crm.deal.stage")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("prompt-editor"), "Company: {{company.name}}");
    await fireEvent.press(screen.getByTestId("var-company.tone"));
    await fireEvent.press(screen.getByTestId("save-draft"));
    expect(screen.getByText("+ Company: {{company.name}}{{company.tone}}")).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId("publish-6"));
    expect(screen.getByText("Calls use v6")).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId("rollback-4"));
    expect(screen.getByText("Calls use v4")).toBeOnTheScreen();
  });
});
