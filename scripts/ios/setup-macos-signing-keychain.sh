#!/bin/bash
#
# Install a macOS Developer ID signing certificate into a temporary keychain for CI builds.
#

set -euo pipefail

if [[ -z "${MACOS_DEVELOPER_ID_CERT_BASE64:-}" ]]; then
  echo "Error: MACOS_DEVELOPER_ID_CERT_BASE64 is required." >&2
  exit 1
fi

if [[ -z "${MACOS_DEVELOPER_ID_CERT_PASSWORD:-}" ]]; then
  echo "Error: MACOS_DEVELOPER_ID_CERT_PASSWORD is required." >&2
  exit 1
fi

KEYCHAIN_PASSWORD="${MACOS_KEYCHAIN_PASSWORD:-}"
KEYCHAIN_PATH="${MACOS_KEYCHAIN_PATH:-${RUNNER_TEMP:-/tmp}/macos-signing.keychain-db}"

CERTIFICATE_PATH="${RUNNER_TEMP:-/tmp}/macos-signing-certificate.p12"

security create-keychain -p "${KEYCHAIN_PASSWORD}" "${KEYCHAIN_PATH}"
security set-keychain-settings -lut 21600 "${KEYCHAIN_PATH}"
security unlock-keychain -p "${KEYCHAIN_PASSWORD}" "${KEYCHAIN_PATH}"

security list-keychains -d user -s "${KEYCHAIN_PATH}"
security default-keychain -s "${KEYCHAIN_PATH}"

printf '%s' "${MACOS_DEVELOPER_ID_CERT_BASE64}" | base64 --decode > "${CERTIFICATE_PATH}"
security import "${CERTIFICATE_PATH}" -k "${KEYCHAIN_PATH}" -P "${MACOS_DEVELOPER_ID_CERT_PASSWORD}" -T /usr/bin/codesign

security set-key-partition-list -S apple-tool:,apple: -s -k "${KEYCHAIN_PASSWORD}" "${KEYCHAIN_PATH}"

rm -f "${CERTIFICATE_PATH}"

if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "MACOS_KEYCHAIN_PATH=${KEYCHAIN_PATH}" >> "${GITHUB_ENV}"
fi

echo "Installed macOS Developer ID certificate into keychain: ${KEYCHAIN_PATH}"
