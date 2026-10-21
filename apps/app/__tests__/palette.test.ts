import { type Command, filterCommands } from "../components/CommandPalette";

const c = (id: string, label: string): Command => ({ id, icon: "•", label, href: "/home" });

describe("quick search", () => {
  it("matches every typed word in any order, ignoring case", () => {
    const all = [c("a", "Start listening to a call"), c("b", "Call history"), c("c", "Settings")];
    expect(filterCommands(all, "call").map((x) => x.id)).toEqual(["a", "b"]);
    expect(filterCommands(all, "HISTORY call").map((x) => x.id)).toEqual(["b"]);
    expect(filterCommands(all, "").map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(filterCommands(all, "zoom")).toEqual([]);
  });
});
