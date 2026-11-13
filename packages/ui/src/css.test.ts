import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { themeVars, tokensCss } from "./css.ts";
import { themes } from "./tokens.ts";

const names = (lines: string[]) => lines.map((l) => l.split(":")[0]).sort();

describe("tokens.css (HTML surfaces)", () => {
  it("is up to date with tokens.ts (run `pnpm --filter @sotto/ui gen:css`)", () => {
    const file = readFileSync(new URL("../tokens.css", import.meta.url), "utf8");
    expect(file).toBe(tokensCss());
  });

  it("light and dark define the same variables", () => {
    expect(names(themeVars(themes.dark))).toEqual(names(themeVars(themes.light)));
  });

  it("covers every colour token, so HTML pages never hard-code a colour", () => {
    const css = tokensCss();
    for (const key of Object.keys(themes.light.color)) {
      const kebab = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      expect(css).toContain(`--ss-${kebab}:`);
    }
  });

  it("components.css uses only --ss- variables for colour (no raw hex)", () => {
    const css = readFileSync(new URL("../components.css", import.meta.url), "utf8");
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
