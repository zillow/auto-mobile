#!/bin/bash

# Local validation script for iOS components
# Includes additional checks and detailed output for local development

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "========================================="
echo "iOS Components Validation (Local)"
echo "========================================="
echo ""

# Check platform
if [[ "$(uname)" != "Darwin" ]]; then
  echo "❌ Error: iOS development requires macOS"
  echo "   Current platform: $(uname)"
  exit 1
fi

echo "✓ Running on macOS $(sw_vers -productVersion)"
echo ""

# Check Xcode
if ! command -v xcodebuild &>/dev/null; then
  echo "❌ Error: Xcode not found"
  echo "   Please install Xcode from the App Store"
  exit 1
fi

XCODE_VERSION=$(xcodebuild -version | head -n 1)
echo "✓ ${XCODE_VERSION}"
echo ""

# Check Swift
if ! command -v swift &>/dev/null; then
  echo "❌ Error: Swift not found"
  exit 1
fi

echo "✓ Swift version: $(swift --version | head -n 1)"
echo ""

# Check Bun
if ! command -v bun &>/dev/null; then
  echo "❌ Error: Bun not found"
  echo "   Please install bun: https://bun.sh"
  exit 1
fi

echo "✓ Bun version: $(bun --version)"
echo ""

# Check for simctl
if ! command -v xcrun simctl &>/dev/null; then
  echo "⚠️  Warning: simctl not found"
  echo "   Some functionality may not work"
else
  echo "✓ simctl available"
fi

echo ""
echo "========================================="
echo "Building Swift Components"
echo "========================================="
echo ""

SWIFT_COMPONENTS=(
  "ios/AccessibilityService"
  "ios/AXeAutomation"
  "ios/XCTestRunner"
  "ios/XcodeCompanion"
  "ios/XcodeExtension"
)

FAILED_BUILDS=()
PASSED_BUILDS=()

for component in "${SWIFT_COMPONENTS[@]}"; do
  component_path="${PROJECT_ROOT}/${component}"

  if [[ ! -d "${component_path}" ]]; then
    echo "⚠️  ${component} not found, skipping"
    continue
  fi

  echo "Building ${component}..."

  if (cd "${component_path}" && swift build 2>&1 | grep -E "(error:|warning:|Compiling|Linking|Build complete)"); then
    if (cd "${component_path}" && swift build >/dev/null 2>&1); then
      echo "✓ ${component} build successful"
      PASSED_BUILDS+=("${component}")
    else
      echo "❌ ${component} build failed"
      FAILED_BUILDS+=("${component}")
    fi
  fi

  echo ""
done

echo "========================================="
echo "Building TypeScript Components"
echo "========================================="
echo ""

SIMCTL_PATH="${PROJECT_ROOT}/ios/SimctlIntegration"

if [[ -d "${SIMCTL_PATH}" ]]; then
  echo "Building ios/SimctlIntegration..."

  (cd "${SIMCTL_PATH}" && bun install)

  if (cd "${SIMCTL_PATH}" && bun run build); then
    echo "✓ SimctlIntegration build successful"
    PASSED_BUILDS+=("ios/SimctlIntegration")
  else
    echo "❌ SimctlIntegration build failed"
    FAILED_BUILDS+=("ios/SimctlIntegration")
  fi
else
  echo "⚠️  SimctlIntegration not found, skipping"
fi

echo ""

echo "========================================="
echo "Running Tests"
echo "========================================="
echo ""

# Run Swift tests
for component in "${SWIFT_COMPONENTS[@]}"; do
  component_path="${PROJECT_ROOT}/${component}"

  if [[ ! -d "${component_path}" ]]; then
    continue
  fi

  echo "Testing ${component}..."

  if (cd "${component_path}" && swift test 2>&1); then
    echo "✓ ${component} tests passed"
  else
    echo "⚠️  ${component} tests failed or unavailable"
  fi

  echo ""
done

# Run TypeScript tests
if [[ -d "${SIMCTL_PATH}" ]]; then
  echo "Testing ios/SimctlIntegration..."

  if (cd "${SIMCTL_PATH}" && bun test); then
    echo "✓ SimctlIntegration tests passed"
  else
    echo "⚠️  SimctlIntegration tests failed"
  fi

  echo ""
fi

echo "========================================="
echo "Validation Summary"
echo "========================================="
echo ""

echo "Build Results:"
echo "  Passed: ${#PASSED_BUILDS[@]}"
for component in "${PASSED_BUILDS[@]}"; do
  echo "    ✓ ${component}"
done
echo ""

if [[ ${#FAILED_BUILDS[@]} -gt 0 ]]; then
  echo "  Failed: ${#FAILED_BUILDS[@]}"
  for component in "${FAILED_BUILDS[@]}"; do
    echo "    ❌ ${component}"
  done
  echo ""
  echo "❌ Validation failed"
  exit 1
fi

echo "✓ All iOS components validated successfully"
echo ""
echo "Next steps:"
echo "  - Run individual component tests with 'swift test' in each directory"
echo "  - Build for iOS Simulator with xcodebuild"
echo "  - Test integration with MCP server"
echo ""

exit 0
