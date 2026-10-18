// Writes the generated JSON Schemas from the zod schemas. Run with `pnpm gen` after changing src/.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cardMessageJsonSchema } from "../src/card.ts";
import { demoJsonSchema } from "../src/demo.ts";

const outputs: Record<string, Record<string, unknown>> = {
  "card.v1.schema.json": cardMessageJsonSchema(),
  "demo.v1.schema.json": demoJsonSchema(),
};
for (const [name, schema] of Object.entries(outputs)) {
  const out = join(import.meta.dirname, "..", "schema", name);
  writeFileSync(out, `${JSON.stringify(schema, null, 2)}\n`);
  console.log(`wrote ${out}`);
}
