#!/usr/bin/env bash
# Verify that a downloaded artifact's SHA256 matches an expected checksum.
# Used to detect artifact corruption during upload/download transit.
#
# Usage: verify-transit-sha256.sh <file-path> <expected-sha256>
#
# Example:
#   verify-transit-sha256.sh /tmp/control-proxy-debug.apk abc123...
set -euo pipefail

FILE_PATH="${1:?Usage: verify-transit-sha256.sh <file-path> <expected-sha256>}"
EXPECTED="${2:?Usage: verify-transit-sha256.sh <file-path> <expected-sha256>}"

if [ ! -f "$FILE_PATH" ]; then
  echo "ERROR: File not found at $FILE_PATH"
  exit 1
fi

ACTUAL=$(sha256sum "$FILE_PATH" | cut -d' ' -f1)
echo "Expected: $EXPECTED"
echo "Actual:   $ACTUAL"

if [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "::error::SHA256 mismatch after download for $(basename "$FILE_PATH")"
  exit 1
fi

echo "SHA256 verified successfully."
