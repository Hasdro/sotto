/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  // Parallel sessions share this machine; full parallelism makes RN tests hit the 5 s timeout.
  maxWorkers: 2,
};
