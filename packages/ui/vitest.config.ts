import { defineConfig } from "vitest/config";

// vitest runs the pure-logic tests (*.test.ts); jest-expo runs the component tests (*.test.tsx).
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
