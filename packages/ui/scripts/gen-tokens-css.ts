/** Writes packages/ui/tokens.css from src/tokens.ts (run: pnpm --filter @sotto/ui gen:css). */
import { writeFileSync } from "node:fs";
import { tokensCss } from "../src/css.ts";

const out = new URL("../tokens.css", import.meta.url);
writeFileSync(out, tokensCss());
console.log(`wrote ${out.pathname}`);
