/**
 * `PageHeader` in `@sotto/ui` (T-092): the app's old `components/PageHeader.tsx` moved here.
 * The icon disc and the muted subtitle come with it; new screens use `lead` instead.
 */
import { render, screen } from "@testing-library/react-native";
import { UIProvider } from "../theme.tsx";
import { themes } from "../tokens.ts";
import { PageHeader } from "./chrome.tsx";

describe("PageHeader", () => {
  it("renders title and lead", async () => {
    await render(
      <UIProvider>
        <PageHeader title="Team" lead="Who can take calls" />
      </UIProvider>,
    );
    expect(screen.getByRole("header", { name: "Team" })).toBeOnTheScreen();
    expect(screen.getByText("Who can take calls")).toBeOnTheScreen();
  });

  it("renders the icon disc when icon is given", async () => {
    await render(
      <UIProvider>
        <PageHeader title="Team" icon="users" />
      </UIProvider>,
    );
    expect(screen.queryByTestId("icon-users", { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it("renders subtitle muted at heading size on wide screens", async () => {
    await render(
      <UIProvider>
        <PageHeader title="Team" subtitle="Who can take calls" />
      </UIProvider>,
    );
    expect(screen.getByText("Who can take calls")).toHaveStyle({
      fontSize: 18,
      color: themes.light.color.textMuted,
    });
  });

  it("renders subtitle at body size when compact", async () => {
    await render(
      <UIProvider>
        <PageHeader title="Team" subtitle="Who can take calls" compact />
      </UIProvider>,
    );
    expect(screen.getByText("Who can take calls")).toHaveStyle({ fontSize: 16 });
  });
});
