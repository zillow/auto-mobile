#!/usr/bin/env bash

set -euo pipefail

constants_path="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/src/constants/release.ts"
release_version="${RELEASE_VERSION:-}"
checksum="${APK_SHA256_CHECKSUM:-}"

if [ -z "$release_version" ] && [ -z "$checksum" ]; then
  echo "INFO: No release environment variables set - using default constants"
  exit 0
fi

if [ -n "$checksum" ] && ! [[ "$checksum" =~ ^[a-f0-9]{64}$ ]]; then
  echo "ERROR: APK_SHA256_CHECKSUM must be a valid SHA256 hash (64 hex characters)"
  echo "   Got: ${checksum}"
  exit 1
fi

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

cp "$constants_path" "$tmp_file"

if [ -n "$release_version" ]; then
  sed -E -i "" -e "s/^export const RELEASE_VERSION: string = \".*\";/export const RELEASE_VERSION: string = \"${release_version}\";/" "$tmp_file" 2>/dev/null \
    || sed -E -i -e "s/^export const RELEASE_VERSION: string = \".*\";/export const RELEASE_VERSION: string = \"${release_version}\";/" "$tmp_file"
fi

if [ -n "$checksum" ]; then
  sed -E -i "" -e "s/^export const APK_SHA256_CHECKSUM: string = \".*\";/export const APK_SHA256_CHECKSUM: string = \"${checksum}\";/" "$tmp_file" 2>/dev/null \
    || sed -E -i -e "s/^export const APK_SHA256_CHECKSUM: string = \".*\";/export const APK_SHA256_CHECKSUM: string = \"${checksum}\";/" "$tmp_file"
fi

if cmp -s "$constants_path" "$tmp_file"; then
  echo "INFO: Release constants already up to date"
  exit 0
fi

mv "$tmp_file" "$constants_path"
trap - EXIT

echo "Updated release constants:"
if [ -n "$release_version" ]; then
  echo "   Version: ${release_version}"
fi
if [ -n "$checksum" ]; then
  echo "   Checksum: ${checksum}"
fi
echo "   File: ${constants_path}"
