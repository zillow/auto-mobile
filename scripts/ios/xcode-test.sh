#!/bin/bash
#
# Xcode Project Test Script
# Runs tests for Xcode projects (xcodeproj) on iOS simulator
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
echo -e "${CYAN}  Xcode Project Tests${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Track overall status
OVERALL_STATUS=0
TESTED_PROJECTS=()
FAILED_PROJECTS=()
SKIPPED_PROJECTS=()

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

# Check if xcodebuild is available
if ! command -v xcodebuild &> /dev/null; then
    echo -e "${RED}Error: xcodebuild not found. Please install Xcode.${NC}"
    exit 1
fi

XCODE_VERSION=$(xcodebuild -version | head -1)
print_info "Xcode version: ${XCODE_VERSION}"

# Find an available iOS simulator
# First try to find a booted one, then fall back to any available iPhone simulator
find_simulator() {
    # Look for a booted iPhone simulator
    local booted_sim=$(xcrun simctl list devices booted 2>/dev/null | grep -E "iPhone.*Booted" | head -1 | sed -E 's/.*\(([A-F0-9-]+)\).*/\1/')
    if [ -n "${booted_sim}" ]; then
        echo "${booted_sim}"
        return
    fi

    # No booted simulator - look for any available iPhone simulator
    local available_sim=$(xcrun simctl list devices available 2>/dev/null | grep -E "iPhone 16[^e]" | head -1 | sed -E 's/.*\(([A-F0-9-]+)\).*/\1/')
    if [ -n "${available_sim}" ]; then
        echo "${available_sim}"
        return
    fi

    # Fall back to any iPhone
    available_sim=$(xcrun simctl list devices available 2>/dev/null | grep -E "iPhone" | head -1 | sed -E 's/.*\(([A-F0-9-]+)\).*/\1/')
    echo "${available_sim}"
}

SIMULATOR_ID=$(find_simulator)
if [ -z "${SIMULATOR_ID}" ]; then
    echo -e "${YELLOW}Warning: No iOS simulator available. Xcode tests will be skipped.${NC}"
    echo -e "${YELLOW}To run tests, create a simulator: xcrun simctl create 'iPhone 16' 'iPhone 16'${NC}"
    echo ""
    exit 0
fi

# Get simulator name for display
SIMULATOR_NAME=$(xcrun simctl list devices 2>/dev/null | grep "${SIMULATOR_ID}" | sed -E 's/^[[:space:]]+([^(]+).*/\1/' | sed 's/[[:space:]]*$//')
print_info "Using simulator: ${SIMULATOR_NAME} (${SIMULATOR_ID})"
echo ""

# Build destination string
DESTINATION="platform=iOS Simulator,id=${SIMULATOR_ID}"

# Find all xcodeproj directories
echo -e "${BLUE}Searching for Xcode projects...${NC}"
XCODEPROJ_DIRS=$(find "${IOS_DIR}" -name "*.xcodeproj" -type d 2>/dev/null || true)

if [ -z "${XCODEPROJ_DIRS}" ]; then
    echo -e "${YELLOW}No Xcode projects found in ${IOS_DIR}${NC}"
    exit 0
fi

# Test each project
for xcodeproj in ${XCODEPROJ_DIRS}; do
    PROJECT_DIR=$(dirname "${xcodeproj}")
    PROJECT_NAME=$(basename "${xcodeproj}" .xcodeproj)

    echo -e "  Testing ${PROJECT_NAME}..."

    # Get available schemes
    SCHEMES=$(xcodebuild -project "${xcodeproj}" -list 2>/dev/null | sed -n '/Schemes:/,/^$/p' | grep -v "Schemes:" | sed 's/^[[:space:]]*//' | grep -v '^$' || true)

    if [ -z "${SCHEMES}" ]; then
        print_warning "${PROJECT_NAME} has no schemes, skipping"
        SKIPPED_PROJECTS+=("${PROJECT_NAME} (no schemes)")
        continue
    fi

    # Run tests for the first scheme (usually the main app scheme)
    TEST_SUCCESS=true
    TESTS_RAN=false
    FIRST_SCHEME=$(echo "${SCHEMES}" | head -1)

    if [ -n "${FIRST_SCHEME}" ]; then
        echo -e "    Testing scheme: ${FIRST_SCHEME}..."

        # Try to run tests
        if xcodebuild \
            -project "${xcodeproj}" \
            -scheme "${FIRST_SCHEME}" \
            -destination "${DESTINATION}" \
            -configuration Debug \
            -quiet \
            test 2>&1; then
            echo -e "    ${GREEN}✓${NC} ${FIRST_SCHEME} tests passed"
            TESTS_RAN=true
        else
            echo -e "    ${RED}✗${NC} ${FIRST_SCHEME} tests failed"
            TEST_SUCCESS=false
            TESTS_RAN=true
        fi
    fi

    if [ "${TESTS_RAN}" = false ]; then
        print_warning "${PROJECT_NAME} has no test targets"
        SKIPPED_PROJECTS+=("${PROJECT_NAME} (no tests)")
    elif [ "${TEST_SUCCESS}" = true ]; then
        print_status 0 "${PROJECT_NAME} tests passed"
        TESTED_PROJECTS+=("${PROJECT_NAME}")
    else
        print_status 1 "${PROJECT_NAME} tests failed"
        FAILED_PROJECTS+=("${PROJECT_NAME}")
    fi
done
echo ""

# Summary
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Test Summary${NC}"
echo -e "${CYAN}========================================${NC}"

if [ ${#TESTED_PROJECTS[@]} -gt 0 ]; then
    echo -e "${GREEN}Passed:${NC}"
    for proj in "${TESTED_PROJECTS[@]}"; do
        echo -e "  ${GREEN}✓${NC} ${proj}"
    done
fi

if [ ${#SKIPPED_PROJECTS[@]} -gt 0 ]; then
    echo -e "${YELLOW}Skipped:${NC}"
    for proj in "${SKIPPED_PROJECTS[@]}"; do
        echo -e "  ${YELLOW}⚠${NC} ${proj}"
    done
fi

if [ ${#FAILED_PROJECTS[@]} -gt 0 ]; then
    echo -e "${RED}Failed:${NC}"
    for proj in "${FAILED_PROJECTS[@]}"; do
        echo -e "  ${RED}✗${NC} ${proj}"
    done
fi

echo ""
if [ $OVERALL_STATUS -eq 0 ]; then
    echo -e "${GREEN}All Xcode tests passed!${NC}"
else
    echo -e "${RED}Some tests failed!${NC}"
fi

exit $OVERALL_STATUS
