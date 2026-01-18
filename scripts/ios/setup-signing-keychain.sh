#!/bin/bash
#
# Install an Apple signing certificate into a temporary keychain for CI builds.
#

set -euo pipefail

if [[ -z "${IOS_CERTIFICATE_BASE64:-}" ]]; then
  echo "Error: IOS_CERTIFICATE_BASE64 is required." >&2
  exit 1
fi

if [[ -z "${IOS_CERTIFICATE_PASSWORD:-}" ]]; then
  echo "Error: IOS_CERTIFICATE_PASSWORD is required." >&2
  exit 1
fi

KEYCHAIN_PASSWORD="${IOS_KEYCHAIN_PASSWORD:-}" # empty password is allowed
KEYCHAIN_PATH="${IOS_KEYCHAIN_PATH:-${RUNNER_TEMP:-/tmp}/ios-signing.keychain-db}"

CERTIFICATE_PATH="${RUNNER_TEMP:-/tmp}/ios-signing-certificate.p12"

security create-keychain -p "${KEYCHAIN_PASSWORD}" "${KEYCHAIN_PATH}"
security set-keychain-settings -lut 21600 "${KEYCHAIN_PATH}"
security unlock-keychain -p "${KEYCHAIN_PASSWORD}" "${KEYCHAIN_PATH}"

# Ensure the new keychain is used for subsequent codesign operations.
security list-keychains -d user -s "${KEYCHAIN_PATH}"
security default-keychain -s "${KEYCHAIN_PATH}"

printf '%s' "${IOS_CERTIFICATE_BASE64}" | base64 --decode > "${CERTIFICATE_PATH}"
security import "${CERTIFICATE_PATH}" -k "${KEYCHAIN_PATH}" -P "${IOS_CERTIFICATE_PASSWORD}" -T /usr/bin/codesign

security set-key-partition-list -S apple-tool:,apple: -s -k "${KEYCHAIN_PASSWORD}" "${KEYCHAIN_PATH}"

rm -f "${CERTIFICATE_PATH}"

if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "IOS_KEYCHAIN_PATH=${KEYCHAIN_PATH}" >> "${GITHUB_ENV}"
fi

echo "Installed signing certificate into keychain: ${KEYCHAIN_PATH}"
