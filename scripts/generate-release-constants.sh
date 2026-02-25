#!/usr/bin/env bash

set -euo pipefail

constants_path="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/src/constants/release.ts"
release_version="${RELEASE_VERSION:-}"
checksum="${APK_SHA256_CHECKSUM:-}"
ios_ctrl_proxy_release_version="${IOS_CTRL_PROXY_RELEASE_VERSION:-}"
ios_ctrl_proxy_checksum="${IOS_CTRL_PROXY_SHA256_CHECKSUM:-}"
ios_ctrl_proxy_app_hash="${IOS_CTRL_PROXY_APP_HASH:-}"
ios_ctrl_proxy_runner_sha256="${IOS_CTRL_PROXY_RUNNER_SHA256:-}"

if [ -z "$release_version" ] && [ -z "$checksum" ] && [ -z "$ios_ctrl_proxy_release_version" ] && [ -z "$ios_ctrl_proxy_checksum" ] && [ -z "$ios_ctrl_proxy_app_hash" ] && [ -z "$ios_ctrl_proxy_runner_sha256" ]; then
  echo "INFO: No release environment variables set - using default constants"
  exit 0
fi

if [ -n "$checksum" ] && ! [[ "$checksum" =~ ^[a-f0-9]{64}$ ]]; then
  echo "ERROR: APK_SHA256_CHECKSUM must be a valid SHA256 hash (64 hex characters)"
  echo "   Got: ${checksum}"
  exit 1
fi

if [ -n "$ios_ctrl_proxy_checksum" ] && ! [[ "$ios_ctrl_proxy_checksum" =~ ^[a-f0-9]{64}$ ]]; then
  echo "ERROR: IOS_CTRL_PROXY_SHA256_CHECKSUM must be a valid SHA256 hash (64 hex characters)"
  echo "   Got: ${ios_ctrl_proxy_checksum}"
  exit 1
fi

if [ -n "$ios_ctrl_proxy_app_hash" ] && ! [[ "$ios_ctrl_proxy_app_hash" =~ ^[a-f0-9]{64}$ ]]; then
  echo "ERROR: IOS_CTRL_PROXY_APP_HASH must be a valid SHA256 hash (64 hex characters)"
  echo "   Got: ${ios_ctrl_proxy_app_hash}"
  exit 1
fi

if [ -n "$ios_ctrl_proxy_runner_sha256" ] && ! [[ "$ios_ctrl_proxy_runner_sha256" =~ ^[a-f0-9]{64}$ ]]; then
  echo "ERROR: IOS_CTRL_PROXY_RUNNER_SHA256 must be a valid SHA256 hash (64 hex characters)"
  echo "   Got: ${ios_ctrl_proxy_runner_sha256}"
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

if [ -n "$ios_ctrl_proxy_release_version" ]; then
  sed -E -i "" -e "s/^export const IOS_CTRL_PROXY_RELEASE_VERSION: string = \".*\";/export const IOS_CTRL_PROXY_RELEASE_VERSION: string = \"${ios_ctrl_proxy_release_version}\";/" "$tmp_file" 2>/dev/null \
    || sed -E -i -e "s/^export const IOS_CTRL_PROXY_RELEASE_VERSION: string = \".*\";/export const IOS_CTRL_PROXY_RELEASE_VERSION: string = \"${ios_ctrl_proxy_release_version}\";/" "$tmp_file"
fi

if [ -n "$ios_ctrl_proxy_checksum" ]; then
  sed -E -i "" -e "s/^export const IOS_CTRL_PROXY_SHA256_CHECKSUM: string = \".*\";/export const IOS_CTRL_PROXY_SHA256_CHECKSUM: string = \"${ios_ctrl_proxy_checksum}\";/" "$tmp_file" 2>/dev/null \
    || sed -E -i -e "s/^export const IOS_CTRL_PROXY_SHA256_CHECKSUM: string = \".*\";/export const IOS_CTRL_PROXY_SHA256_CHECKSUM: string = \"${ios_ctrl_proxy_checksum}\";/" "$tmp_file"
fi

if [ -n "$ios_ctrl_proxy_app_hash" ]; then
  sed -E -i "" -e "s/^export const IOS_CTRL_PROXY_APP_HASH: string = \".*\";/export const IOS_CTRL_PROXY_APP_HASH: string = \"${ios_ctrl_proxy_app_hash}\";/" "$tmp_file" 2>/dev/null \
    || sed -E -i -e "s/^export const IOS_CTRL_PROXY_APP_HASH: string = \".*\";/export const IOS_CTRL_PROXY_APP_HASH: string = \"${ios_ctrl_proxy_app_hash}\";/" "$tmp_file"
fi

if [ -n "$ios_ctrl_proxy_runner_sha256" ]; then
  sed -E -i "" -e "s/^export const IOS_CTRL_PROXY_RUNNER_SHA256: string = \".*\";/export const IOS_CTRL_PROXY_RUNNER_SHA256: string = \"${ios_ctrl_proxy_runner_sha256}\";/" "$tmp_file" 2>/dev/null \
    || sed -E -i -e "s/^export const IOS_CTRL_PROXY_RUNNER_SHA256: string = \".*\";/export const IOS_CTRL_PROXY_RUNNER_SHA256: string = \"${ios_ctrl_proxy_runner_sha256}\";/" "$tmp_file"
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
if [ -n "$ios_ctrl_proxy_release_version" ]; then
  echo "   CtrlProxy iOS version: ${ios_ctrl_proxy_release_version}"
fi
if [ -n "$ios_ctrl_proxy_checksum" ]; then
  echo "   CtrlProxy iOS checksum: ${ios_ctrl_proxy_checksum}"
fi
if [ -n "$ios_ctrl_proxy_app_hash" ]; then
  echo "   CtrlProxy iOS app hash: ${ios_ctrl_proxy_app_hash}"
fi
if [ -n "$ios_ctrl_proxy_runner_sha256" ]; then
  echo "   CtrlProxy iOS runner SHA256: ${ios_ctrl_proxy_runner_sha256}"
fi
echo "   File: ${constants_path}"
