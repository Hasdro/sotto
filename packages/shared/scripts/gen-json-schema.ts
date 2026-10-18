// Writes schema/card.v1.schema.json from the zod schema. Run with `pnpm gen` after changing src/card.ts.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cardMessageJsonSchema } from "../src/card.ts";

const out = join(import.meta.dirname, "..", "schema", "card.v1.schema.json");
writeFileSync(out, `${JSON.stringify(cardMessageJsonSchema(), null, 2)}\n`);
console.log(`wrote ${out}`);
