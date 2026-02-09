#!/usr/bin/env bash
# Verify that a built artifact's SHA256 matches the checksum stored in src/constants/release.ts.
#
# Usage: verify-artifact-sha256.sh <artifact-path> <constant-name>
#
# Example:
#   verify-artifact-sha256.sh /tmp/accessibility-service-debug.apk APK_SHA256_CHECKSUM
#   verify-artifact-sha256.sh /tmp/XCTestService.ipa XCTESTSERVICE_SHA256_CHECKSUM
set -euo pipefail

ARTIFACT_PATH="${1:?Usage: verify-artifact-sha256.sh <artifact-path> <constant-name>}"
CONSTANT_NAME="${2:?Usage: verify-artifact-sha256.sh <artifact-path> <constant-name>}"

RELEASE_TS="src/constants/release.ts"

if [ ! -f "$ARTIFACT_PATH" ]; then
  echo "ERROR: Artifact not found at $ARTIFACT_PATH"
  exit 1
fi

if [ ! -f "$RELEASE_TS" ]; then
  echo "ERROR: Release constants file not found at $RELEASE_TS"
  exit 1
fi

BUILT_SHA256=$(sha256sum "$ARTIFACT_PATH" | cut -d' ' -f1)
echo "Built artifact SHA256: $BUILT_SHA256"

SOURCE_SHA256=$(grep "$CONSTANT_NAME" "$RELEASE_TS" | sed 's/.*"\([^"]*\)".*/\1/')
echo "Source SHA256:         $SOURCE_SHA256"

if [ -z "$SOURCE_SHA256" ]; then
  echo ""
  echo "ERROR: No SHA256 checksum found for $CONSTANT_NAME in source."
  echo ""
  echo "A release cannot proceed without a checksum in $RELEASE_TS."
  echo "Please:"
  echo "1. Trigger the nightly workflow to generate a checksum update PR"
  echo "2. Merge the update PR before releasing"
  exit 1
fi

if [ "$BUILT_SHA256" != "$SOURCE_SHA256" ]; then
  echo ""
  echo "ERROR: SHA256 mismatch for $CONSTANT_NAME!"
  echo ""
  echo "The built artifact has a different checksum than what's in source."
  echo "This likely means the source code changed after the last"
  echo "checksum update PR was merged."
  echo ""
  echo "Please:"
  echo "1. Check if there's a pending SHA256 update PR"
  echo "2. If not, trigger the nightly workflow to generate one"
  echo "3. Merge the update PR before releasing"
  exit 1
fi

echo ""
echo "SHA256 verified successfully."
echo "checksum=$BUILT_SHA256"
