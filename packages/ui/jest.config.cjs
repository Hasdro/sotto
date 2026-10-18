/** Component tests (*.test.tsx) run on jest-expo; pure logic (*.test.ts) runs on vitest. */
/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/**/*.test.tsx"],
};
