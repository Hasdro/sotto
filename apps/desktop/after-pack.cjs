// macOS: ad-hoc sign the packaged app. Without a signature, Apple-silicon Macs refuse to open
// it ("damaged"). A Developer ID signature + notarisation replaces this once the owner has an
// Apple Developer account; until then the first open is right-click → Open.
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
};
