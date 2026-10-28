#!/bin/sh
# Builds "dist/Stereo Test.app", a native macOS app (Apple silicon and Intel) that runs experiment.html
# with no browser or server. Needs the Xcode command line tools (xcode-select --install).
# Usage: tools/build-mac-app.sh
set -eu
cd "$(dirname "$0")/.."

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
# Built in a temporary folder and moved into dist/ only once it is signed, so a failed build leaves nothing.
APP="$WORK/Stereo Test.app"

# Use the first SDK this Swift compiler can build against: a newer SDK than the compiler can be installed.
echo 'import AppKit' > "$WORK/probe.swift"
SDK=""
for candidate in "$(xcrun --sdk macosx --show-sdk-path)" $(ls -d /Library/Developer/CommandLineTools/SDKs/MacOSX*.sdk 2>/dev/null | sort -r); do
  if swiftc -sdk "$candidate" -typecheck "$WORK/probe.swift" 2>/dev/null; then SDK=$candidate; break; fi
done
[ -n "$SDK" ] || { echo "No macOS SDK works with this Swift compiler. Update the command line tools." >&2; exit 1; }
echo "Using $SDK"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"

for arch in arm64 x86_64; do
  swiftc -O -swift-version 5 -sdk "$SDK" -target "$arch-apple-macos13.0" -o "$WORK/StereoTest-$arch" mac/StereoTest.swift
done
lipo -create "$WORK/StereoTest-arm64" "$WORK/StereoTest-x86_64" -output "$APP/Contents/MacOS/StereoTest"

# -X leaves out Finder tags and other extended attributes, which codesign rejects.
cp -X mac/Info.plist "$APP/Contents/Info.plist"
cp -X experiment.html rds.js index.html "$APP/Contents/Resources/web/"

swiftc -O -swift-version 5 -sdk "$SDK" -o "$WORK/make-icon" mac/make-icon.swift
"$WORK/make-icon" "$WORK/icon.png"
mkdir "$WORK/AppIcon.iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$WORK/icon.png" --out "$WORK/AppIcon.iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$WORK/icon.png" --out "$WORK/AppIcon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$WORK/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns"

# Ad-hoc signature (no Developer ID, not notarized). See the README for opening it on another Mac.
xattr -cr "$APP"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
mkdir -p dist
rm -rf "dist/Stereo Test.app"
mv "$APP" "dist/Stereo Test.app"
echo "Built dist/Stereo Test.app"
