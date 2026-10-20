#!/usr/bin/env bash
# Builds the phone apps on the Mac (T-016, D-022), pointed at the management server.
#   bash apps/app/build-phones.sh [https://server]   → apps/mobile-builds/
# Android: a release APK (signed with the debug key; fine for sideloading, not for the Play Store).
# iPhone: a simulator build (a device build needs an Apple signing team).
set -euo pipefail
SERVER=${1:-https://104-168-48-116.sslip.io}
ROOT=$(git rev-parse --show-toplevel)
APP="$ROOT/apps/app"
OUT="$ROOT/apps/mobile-builds"
VERSION=$(node -p "require('$APP/app.json').expo.version")
export NODE_ENV=production EXPO_PUBLIC_SOTTO_SERVER="$SERVER" EXPO_PUBLIC_DEMO_BRIDGE_URL=
export JAVA_HOME=${JAVA_HOME:-"/Applications/Android Studio.app/Contents/jbr/Contents/Home"}
export ANDROID_HOME=${ANDROID_HOME:-"$HOME/Library/Android/sdk"}
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
export LANG=en_US.UTF-8
mkdir -p "$OUT"
cd "$APP"
CI=1 npx expo prebuild --no-install --clean >/dev/null
echo "==> Android"
# Modern phones only (arm64): four chip types need ~10 GB of build space instead of ~3 GB.
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --console=plain -q)
cp android/app/build/outputs/apk/release/app-release.apk "$OUT/Sotto-$VERSION.apk"
echo "==> iPhone (simulator)"
(cd ios && pod install >/dev/null && xcodebuild -workspace Sotto.xcworkspace -scheme Sotto \
  -configuration Release -sdk iphonesimulator -derivedDataPath build CODE_SIGNING_ALLOWED=NO -quiet)
rm -rf "$OUT/Sotto-simulator.app" && cp -R ios/build/Build/Products/Release-iphonesimulator/Sotto.app "$OUT/Sotto-simulator.app"
# The native build leaves several GB of intermediates; they regenerate on the next build.
rm -rf ios/build android/app/build android/app/.cxx "$ROOT"/node_modules/.pnpm/*/node_modules/*/android/build \
  "$ROOT"/node_modules/.pnpm/*/node_modules/@*/*/android/build
ls -la "$OUT"
