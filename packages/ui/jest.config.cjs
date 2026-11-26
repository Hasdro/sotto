/** Component tests (*.test.tsx) run on jest-expo; pure logic (*.test.ts) runs on vitest. */
/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/**/*.test.tsx"],
  // Parallel workspace runs share 2-vCPU CI runners; cap workers like apps/app to prevent RN 5 s timeouts.
  maxWorkers: 2,
};
