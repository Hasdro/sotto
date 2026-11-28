/** PROD-001: the component gallery is a developer page. It opens in development and in builds
 * that name no server (the CI accessibility export), and a production build sends /gallery Home. */
import { render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text: T } = require("react-native");
    return <T testID="redirect">{href}</T>;
  },
}));
jest.mock("../lib/cloud", () => ({ cloudOrigin: () => "https://shield.example.test" }));

const g = globalThis as { __DEV__?: boolean };
const dev = g.__DEV__;
afterEach(() => {
  g.__DEV__ = dev;
});

describe("/gallery gate (PROD-001)", () => {
  it("opens in development and without a server, never in a production build", () => {
    const { galleryAllowed } = require("../app/gallery") as typeof import("../app/gallery");
    expect(galleryAllowed(true, "https://shield.example.test")).toBe(true);
    expect(galleryAllowed(false, null)).toBe(true);
    expect(galleryAllowed(false, "https://shield.example.test")).toBe(false);
  });

  it("sends /gallery Home in a production build", async () => {
    g.__DEV__ = false;
    const Gallery = (require("../app/gallery") as typeof import("../app/gallery")).default;
    await render(<Gallery />);
    expect(screen.getByTestId("redirect")).toHaveTextContent("/home");
    expect(screen.queryByText("Components")).toBeNull();
  });
});
