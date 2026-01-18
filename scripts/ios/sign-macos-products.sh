#!/bin/bash
#
# Build and sign macOS Swift package products with Developer ID.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IOS_DIR="${PROJECT_ROOT}/ios"

if [[ -z "${MACOS_DEVELOPER_ID_SIGNING_IDENTITY:-}" ]]; then
  echo "Error: MACOS_DEVELOPER_ID_SIGNING_IDENTITY is required." >&2
  exit 1
fi

if [[ -z "${MACOS_DEVELOPER_ID_TEAM_ID:-}" ]]; then
  echo "Error: MACOS_DEVELOPER_ID_TEAM_ID is required." >&2
  exit 1
fi

KEYCHAIN_PATH="${MACOS_KEYCHAIN_PATH:-}"

CODESIGN_ARGS=(
  --force
  --options runtime
  --timestamp
  --sign "${MACOS_DEVELOPER_ID_SIGNING_IDENTITY}"
)

if [[ -n "${KEYCHAIN_PATH}" ]]; then
  CODESIGN_ARGS+=(--keychain "${KEYCHAIN_PATH}")
fi

sign_paths=()
STRICT_MODE="${MACOS_SIGNING_STRICT:-false}"

sign_package() {
  local package_name="$1"
  local product_name="$2"
  local package_dir="${IOS_DIR}/${package_name}"

  if [[ ! -d "${package_dir}" ]]; then
    echo "Error: ${package_name} package not found at ${package_dir}" >&2
    exit 1
  fi

  echo "Building ${package_name} (release) for macOS signing..."
  local bin_path
  bin_path=$(cd "${package_dir}" && swift build -c release --show-bin-path)

  if [[ ! -d "${bin_path}" ]]; then
    echo "Error: build output not found for ${package_name}: ${bin_path}" >&2
    exit 1
  fi

  local found=false
  if [[ -n "${product_name}" && -e "${bin_path}/${product_name}" ]]; then
    sign_paths+=("${bin_path}/${product_name}")
    found=true
  fi

  while IFS= read -r -d '' candidate; do
    sign_paths+=("${candidate}")
    found=true
  done < <(find "${bin_path}" -maxdepth 2 \( -name "*.app" -o -name "*.appex" -o -name "*.framework" -o -name "*.dylib" \) -print0)

  if [[ "${found}" != true ]]; then
    if [[ "${STRICT_MODE}" == "true" ]]; then
      echo "Error: no signable artifacts found for ${package_name} in ${bin_path}" >&2
      exit 1
    else
      echo "Warning: no signable artifacts found for ${package_name} in ${bin_path}"
    fi
  fi
}

sign_package "XcodeCompanion" "AutoMobileCompanion"
sign_package "XcodeExtension" ""

for artifact in "${sign_paths[@]}"; do
  echo "Signing ${artifact}"
  codesign "${CODESIGN_ARGS[@]}" "${artifact}"
  codesign --verify --strict --verbose=2 "${artifact}"
  codesign -dv --verbose=2 "${artifact}" 2>&1 | sed 's/^/  /'
  echo ""
done
