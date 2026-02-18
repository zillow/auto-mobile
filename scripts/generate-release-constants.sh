#!/usr/bin/env bash

set -euo pipefail

constants_path="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/src/constants/release.ts"
release_version="${RELEASE_VERSION:-}"
checksum="${APK_SHA256_CHECKSUM:-}"
xctestservice_release_version="${XCTESTSERVICE_RELEASE_VERSION:-}"
xctestservice_checksum="${XCTESTSERVICE_SHA256_CHECKSUM:-}"
xctestservice_app_hash="${XCTESTSERVICE_APP_HASH:-}"
xctestservice_runner_sha256="${XCTESTSERVICE_RUNNER_SHA256:-}"

if [ -z "$release_version" ] && [ -z "$checksum" ] && [ -z "$xctestservice_release_version" ] && [ -z "$xctestservice_checksum" ] && [ -z "$xctestservice_app_hash" ] && [ -z "$xctestservice_runner_sha256" ]; then
  echo "INFO: No release environment variables set - using default constants"
  exit 0
fi

if [ -n "$checksum" ] && ! [[ "$checksum" =~ ^[a-f0-9]{64}$ ]]; then
  echo "ERROR: APK_SHA256_CHECKSUM must be a valid SHA256 hash (64 hex characters)"
  echo "   Got: ${checksum}"
  exit 1
fi

if [ -n "$xctestservice_checksum" ] && ! [[ "$xctestservice_checksum" =~ ^[a-f0-9]{64}$ ]]; then
  echo "ERROR: XCTESTSERVICE_SHA256_CHECKSUM must be a valid SHA256 hash (64 hex characters)"
  echo "   Got: ${xctestservice_checksum}"
  exit 1
fi

if [ -n "$xctestservice_app_hash" ] && ! [[ "$xctestservice_app_hash" =~ ^[a-f0-9]{64}$ ]]; then
  echo "ERROR: XCTESTSERVICE_APP_HASH must be a valid SHA256 hash (64 hex characters)"
  echo "   Got: ${xctestservice_app_hash}"
  exit 1
fi

if [ -n "$xctestservice_runner_sha256" ] && ! [[ "$xctestservice_runner_sha256" =~ ^[a-f0-9]{64}$ ]]; then
  echo "ERROR: XCTESTSERVICE_RUNNER_SHA256 must be a valid SHA256 hash (64 hex characters)"
  echo "   Got: ${xctestservice_runner_sha256}"
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

if [ -n "$xctestservice_release_version" ]; then
  sed -E -i "" -e "s/^export const XCTESTSERVICE_RELEASE_VERSION: string = \".*\";/export const XCTESTSERVICE_RELEASE_VERSION: string = \"${xctestservice_release_version}\";/" "$tmp_file" 2>/dev/null \
    || sed -E -i -e "s/^export const XCTESTSERVICE_RELEASE_VERSION: string = \".*\";/export const XCTESTSERVICE_RELEASE_VERSION: string = \"${xctestservice_release_version}\";/" "$tmp_file"
fi

if [ -n "$xctestservice_checksum" ]; then
  sed -E -i "" -e "s/^export const XCTESTSERVICE_SHA256_CHECKSUM: string = \".*\";/export const XCTESTSERVICE_SHA256_CHECKSUM: string = \"${xctestservice_checksum}\";/" "$tmp_file" 2>/dev/null \
    || sed -E -i -e "s/^export const XCTESTSERVICE_SHA256_CHECKSUM: string = \".*\";/export const XCTESTSERVICE_SHA256_CHECKSUM: string = \"${xctestservice_checksum}\";/" "$tmp_file"
fi

if [ -n "$xctestservice_app_hash" ]; then
  sed -E -i "" -e "s/^export const XCTESTSERVICE_APP_HASH: string = \".*\";/export const XCTESTSERVICE_APP_HASH: string = \"${xctestservice_app_hash}\";/" "$tmp_file" 2>/dev/null \
    || sed -E -i -e "s/^export const XCTESTSERVICE_APP_HASH: string = \".*\";/export const XCTESTSERVICE_APP_HASH: string = \"${xctestservice_app_hash}\";/" "$tmp_file"
fi

if [ -n "$xctestservice_runner_sha256" ]; then
  sed -E -i "" -e "s/^export const XCTESTSERVICE_RUNNER_SHA256: string = \".*\";/export const XCTESTSERVICE_RUNNER_SHA256: string = \"${xctestservice_runner_sha256}\";/" "$tmp_file" 2>/dev/null \
    || sed -E -i -e "s/^export const XCTESTSERVICE_RUNNER_SHA256: string = \".*\";/export const XCTESTSERVICE_RUNNER_SHA256: string = \"${xctestservice_runner_sha256}\";/" "$tmp_file"
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
  echo "   APK checksum: ${checksum}"
fi
if [ -n "$xctestservice_release_version" ]; then
  echo "   XCTestService version: ${xctestservice_release_version}"
fi
if [ -n "$xctestservice_checksum" ]; then
  echo "   XCTestService checksum: ${xctestservice_checksum}"
fi
if [ -n "$xctestservice_app_hash" ]; then
  echo "   XCTestService app hash: ${xctestservice_app_hash}"
fi
if [ -n "$xctestservice_runner_sha256" ]; then
  echo "   XCTestService runner SHA256: ${xctestservice_runner_sha256}"
fi
echo "   File: ${constants_path}"
