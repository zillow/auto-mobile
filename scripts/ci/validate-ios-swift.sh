#!/bin/bash

# CI validation script for iOS Swift components
# Validates that all Swift packages can build successfully

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "========================================="
echo "iOS Swift Component Validation (CI)"
echo "========================================="
echo ""

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
  echo "⚠️  Warning: iOS Swift validation requires macOS"
  echo "   Skipping Swift package validation"
  exit 0
fi

# Check for Swift
if ! command -v swift &>/dev/null; then
  echo "❌ Error: swift not found"
  echo "   Please install Xcode from the App Store"
  exit 1
fi

echo "✓ Swift version: $(swift --version | head -n 1)"
echo ""

# Component directories
COMPONENTS=(
  "ios/AccessibilityService"
  "ios/AXeAutomation"
  "ios/XCTestRunner"
  "ios/XcodeCompanion"
  "ios/XcodeExtension"
)

FAILED_COMPONENTS=()
PASSED_COMPONENTS=()

# Validate each Swift component
for component in "${COMPONENTS[@]}"; do
  component_path="${PROJECT_ROOT}/${component}"

  if [[ ! -d "${component_path}" ]]; then
    echo "⚠️  Warning: ${component} not found, skipping"
    continue
  fi

  echo "Validating ${component}..."
  echo "---"

  # Build the Swift package
  if (cd "${component_path}" && swift build 2>&1); then
    echo "✓ ${component} build successful"
    PASSED_COMPONENTS+=("${component}")
  else
    echo "❌ ${component} build failed"
    FAILED_COMPONENTS+=("${component}")
  fi

  echo ""
done

# Summary
echo "========================================="
echo "Validation Summary"
echo "========================================="
echo ""
echo "Passed: ${#PASSED_COMPONENTS[@]}"
for component in "${PASSED_COMPONENTS[@]}"; do
  echo "  ✓ ${component}"
done
echo ""

if [[ ${#FAILED_COMPONENTS[@]} -gt 0 ]]; then
  echo "Failed: ${#FAILED_COMPONENTS[@]}"
  for component in "${FAILED_COMPONENTS[@]}"; do
    echo "  ❌ ${component}"
  done
  echo ""
  exit 1
fi

echo "✓ All iOS Swift components validated successfully"
exit 0
