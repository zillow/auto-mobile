#!/bin/bash
#
# Build and sign iOS Swift package frameworks for release builds.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IOS_DIR="${PROJECT_ROOT}/ios"

if [[ -z "${IOS_SIGNING_IDENTITY:-}" ]]; then
  echo "Error: IOS_SIGNING_IDENTITY is required." >&2
  exit 1
fi

if [[ -z "${IOS_SIGNING_TEAM_ID:-}" ]]; then
  echo "Error: IOS_SIGNING_TEAM_ID is required." >&2
  exit 1
fi

KEYCHAIN_PATH="${IOS_KEYCHAIN_PATH:-}"
STRICT_MODE="${IOS_SIGNING_STRICT:-false}"

PACKAGES=(
  "XCTestRunner"
  "XCTestService"
)

for package in "${PACKAGES[@]}"; do
  PACKAGE_DIR="${IOS_DIR}/${package}"
  if [[ ! -d "${PACKAGE_DIR}" ]]; then
    echo "Error: ${package} package not found at ${PACKAGE_DIR}" >&2
    exit 1
  fi

  DERIVED_DATA_PATH="${PROJECT_ROOT}/scratch/ios-signing/${package}"
  mkdir -p "${DERIVED_DATA_PATH}"

  XCODEBUILD_ARGS=(
    -scheme "${package}"
    -destination 'generic/platform=iOS'
    -configuration Release
    -derivedDataPath "${DERIVED_DATA_PATH}"
    CODE_SIGN_STYLE=Manual
    CODE_SIGN_IDENTITY="${IOS_SIGNING_IDENTITY}"
    DEVELOPMENT_TEAM="${IOS_SIGNING_TEAM_ID}"
    CODE_SIGNING_ALLOWED=YES
    CODE_SIGNING_REQUIRED=YES
  )

  if [[ -n "${KEYCHAIN_PATH}" ]]; then
    XCODEBUILD_ARGS+=(OTHER_CODE_SIGN_FLAGS="--keychain ${KEYCHAIN_PATH}")
  fi

  echo "Building ${package} for iOS release signing..."
  (cd "${PACKAGE_DIR}" && xcodebuild "${XCODEBUILD_ARGS[@]}")

  FRAMEWORK_PATH=$(find "${DERIVED_DATA_PATH}" -type d -name "${package}.framework" -path "*/Release-iphoneos/*" | head -n 1 || true)
  if [[ -z "${FRAMEWORK_PATH}" ]]; then
    if [[ "${STRICT_MODE}" == "true" ]]; then
      echo "Error: ${package}.framework not found in derived data: ${DERIVED_DATA_PATH}" >&2
      exit 1
    else
      echo "Warning: ${package}.framework not found in derived data: ${DERIVED_DATA_PATH}"
      continue
    fi
  fi

  echo "Verifying signed framework: ${FRAMEWORK_PATH}"
  codesign --verify --strict --verbose=2 "${FRAMEWORK_PATH}"
  codesign -dv --verbose=2 "${FRAMEWORK_PATH}" 2>&1 | sed 's/^/  /'
  echo ""
done
