import { defineConfig } from "vitest/config";

// Coverage floor for the shipped live pipeline (T-042, CONSTRAINTS.md): 80% now, 90% at Phase 8.
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/__tests__/**", "src/index.ts"],
      reporter: ["text-summary"],
      thresholds: { statements: 80, branches: 80 },
    },
  },
});
