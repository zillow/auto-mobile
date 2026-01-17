#!/bin/bash
#
# Swift Package Test Script
# Runs tests for all Swift packages that support macOS
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IOS_DIR="${PROJECT_ROOT}/ios"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Swift Package Tests${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Track overall status
OVERALL_STATUS=0
FAILED_PACKAGES=()
SKIPPED_PACKAGES=()
PASSED_PACKAGES=()

# Helper function to print status
print_status() {
    local status=$1
    local message=$2
    if [ "$status" -eq 0 ]; then
        echo -e "  ${GREEN}✓${NC} $message"
    else
        echo -e "  ${RED}✗${NC} $message"
        OVERALL_STATUS=1
    fi
}

print_warning() {
    echo -e "  ${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "  ${BLUE}ℹ${NC} $1"
}

# Check if swift is available
if ! command -v swift &> /dev/null; then
    echo -e "${RED}Error: swift command not found${NC}"
    exit 1
fi

SWIFT_VERSION=$(swift --version | head -1)
print_info "Swift version: ${SWIFT_VERSION}"
echo ""

# Packages that can be tested on macOS (either macOS-only or cross-platform)
# Note: iOS-only packages cannot run tests on macOS without a simulator
# XCTestService has unit tests that can run on macOS
TESTABLE_PACKAGES=(
    "AXeAutomation"
    "XcodeCompanion"
    "XcodeExtension"
    "XCTestService"
)

# iOS-only packages (tests require iOS simulator - skip in basic test run)
# XCTestRunner UI tests require iOS simulator
IOS_ONLY_PACKAGES=(
    "AccessibilityService"
    "XCTestRunner"
)

# Run tests for macOS-compatible packages
echo -e "${BLUE}Running tests for macOS-compatible packages...${NC}"
for package in "${TESTABLE_PACKAGES[@]}"; do
    PACKAGE_DIR="${IOS_DIR}/${package}"
    if [ -f "${PACKAGE_DIR}/Package.swift" ]; then
        echo -e "  Testing ${package}..."

        # Check if the package has test targets
        if grep -q "testTarget" "${PACKAGE_DIR}/Package.swift"; then
            if (cd "${PACKAGE_DIR}" && swift test 2>&1); then
                print_status 0 "${package} tests passed"
                PASSED_PACKAGES+=("${package}")
            else
                print_status 1 "${package} tests failed"
                FAILED_PACKAGES+=("${package}")
            fi
        else
            print_warning "${package} has no test targets"
            SKIPPED_PACKAGES+=("${package} (no tests)")
        fi
    else
        print_info "Skipping ${package} (no Package.swift)"
        SKIPPED_PACKAGES+=("${package} (no Package.swift)")
    fi
done
echo ""

# Note about iOS-only packages
echo -e "${BLUE}iOS-only packages (tests skipped - require simulator):${NC}"
for package in "${IOS_ONLY_PACKAGES[@]}"; do
    print_warning "${package} - tests require iOS simulator"
    SKIPPED_PACKAGES+=("${package} (iOS-only)")
done
echo ""

# Summary
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Test Summary${NC}"
echo -e "${CYAN}========================================${NC}"

if [ ${#PASSED_PACKAGES[@]} -gt 0 ]; then
    echo -e "${GREEN}Passed:${NC}"
    for pkg in "${PASSED_PACKAGES[@]}"; do
        echo -e "  ${GREEN}✓${NC} ${pkg}"
    done
fi

if [ ${#SKIPPED_PACKAGES[@]} -gt 0 ]; then
    echo -e "${YELLOW}Skipped:${NC}"
    for pkg in "${SKIPPED_PACKAGES[@]}"; do
        echo -e "  ${YELLOW}⚠${NC} ${pkg}"
    done
fi

if [ ${#FAILED_PACKAGES[@]} -gt 0 ]; then
    echo -e "${RED}Failed:${NC}"
    for pkg in "${FAILED_PACKAGES[@]}"; do
        echo -e "  ${RED}✗${NC} ${pkg}"
    done
fi

echo ""
if [ $OVERALL_STATUS -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
else
    echo -e "${RED}Some tests failed!${NC}"
fi

exit $OVERALL_STATUS
