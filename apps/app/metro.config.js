// Metro for the Sotto app.
// zod v4 re-exports all ~40 of its error-message languages (`z.locales`); nothing in Sotto uses
// them (errors are dropped, never shown), and without tree shaking they cost ~30 KB gzipped of
// the web budget (CONSTRAINTS.md). Its English messages stay: zod imports them directly.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const STUB = path.resolve(__dirname, "lib/zod-locales-stub.js");
const ZOD_INTERNAL = /[\\/]zod[\\/]v4[\\/](core|classic)[\\/]/;
const resolveDefault = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "../locales/index.js" && ZOD_INTERNAL.test(context.originModulePath)) {
    return { type: "sourceFile", filePath: STUB };
  }
  return (resolveDefault ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
