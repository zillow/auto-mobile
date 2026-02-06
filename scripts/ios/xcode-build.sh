#!/bin/bash
#
# Xcode Project Build Script
# Builds Xcode projects (xcodeproj) for iOS simulator
#

set -e

# Options
DRY_RUN=false
for arg in "$@"; do
    case "$arg" in
        --dry-run)
            DRY_RUN=true
            ;;
        *)
            ;;
    esac
done

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
echo -e "${CYAN}  Xcode Project Build${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Track overall status
OVERALL_STATUS=0
BUILT_PROJECTS=()
FAILED_PROJECTS=()

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

print_info() {
    echo -e "  ${BLUE}ℹ${NC} $1"
}

run_cmd() {
    if [ "$DRY_RUN" = true ]; then
        echo -e "  ${YELLOW}↳${NC} (dry-run) $*"
        return 0
    fi
    "$@"
}

has_simulator_sdk() {
    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}(dry-run) Skipping simulator SDK detection.${NC}"
        return 0
    fi
    xcodebuild -showsdks 2>/dev/null | grep -q "iphonesimulator"
}

# Check if xcodebuild is available
if ! command -v xcodebuild &> /dev/null; then
    echo -e "${RED}Error: xcodebuild not found. Please install Xcode.${NC}"
    exit 1
fi

XCODE_VERSION=$(xcodebuild -version)
XCODE_VERSION=${XCODE_VERSION%%$'\n'*}
print_info "Xcode version: ${XCODE_VERSION}"

DESTINATION="generic/platform=iOS Simulator"
print_info "Using iOS destination: ${DESTINATION}"
echo ""

# Ensure iOS Simulator SDK is installed
if ! has_simulator_sdk; then
    echo -e "${YELLOW}No iOS Simulator SDK detected. Attempting to install iOS platform...${NC}"
    set +e
    run_cmd xcodebuild -downloadPlatform iOS 2>&1
    DOWNLOAD_EXIT_CODE=$?
    set -e

    if [ $DOWNLOAD_EXIT_CODE -ne 0 ]; then
        echo -e "${RED}Failed to download iOS platform (exit ${DOWNLOAD_EXIT_CODE}).${NC}"
    fi

    if ! has_simulator_sdk; then
        echo -e "${RED}iOS Simulator SDK still missing after download attempt.${NC}"
        echo -e "${YELLOW}Install the iOS platform in Xcode or ensure CI has the simulator SDK preinstalled.${NC}"
        exit 1
    fi
fi

# Find all xcodeproj directories using glob (faster than find)
echo -e "${BLUE}Searching for Xcode projects...${NC}"
shopt -s nullglob
XCODEPROJ_ARRAY=("${IOS_DIR}"/*/*.xcodeproj "${IOS_DIR}"/*.xcodeproj)
shopt -u nullglob

if [ ${#XCODEPROJ_ARRAY[@]} -eq 0 ]; then
    echo -e "${YELLOW}No Xcode projects found in ${IOS_DIR}${NC}"
    exit 0
fi

# Build each project
for xcodeproj in "${XCODEPROJ_ARRAY[@]}"; do
    PROJECT_NAME=$(basename "${xcodeproj}" .xcodeproj)

    echo -e "  Building ${PROJECT_NAME}..."

    # Get available schemes
    SCHEMES=$(run_cmd xcodebuild -project "${xcodeproj}" -list 2>/dev/null | sed -n '/Schemes:/,/^$/p' | grep -v "Schemes:" | sed 's/^[[:space:]]*//' | grep -v '^$' || true)

    if [ -z "${SCHEMES}" ]; then
        print_info "No schemes found for ${PROJECT_NAME}, skipping"
        continue
    fi

    # Build each scheme for iOS simulator
    BUILD_SUCCESS=true
    while IFS= read -r scheme; do
        if [ -n "${scheme}" ]; then
            echo -e "    Building scheme: ${scheme}..."
            if run_cmd xcodebuild \
                -project "${xcodeproj}" \
                -scheme "${scheme}" \
                -destination "${DESTINATION}" \
                -configuration Debug \
                -quiet \
                build 2>&1; then
                echo -e "    ${GREEN}✓${NC} ${scheme} built"
            else
                echo -e "    ${RED}✗${NC} ${scheme} failed"
                BUILD_SUCCESS=false
            fi
        fi
    done <<< "${SCHEMES}"

    if [ "${BUILD_SUCCESS}" = true ]; then
        print_status 0 "${PROJECT_NAME} built successfully"
        BUILT_PROJECTS+=("${PROJECT_NAME}")
    else
        print_status 1 "${PROJECT_NAME} build failed"
        FAILED_PROJECTS+=("${PROJECT_NAME}")
    fi
done
echo ""

# Summary
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Build Summary${NC}"
echo -e "${CYAN}========================================${NC}"

if [ ${#BUILT_PROJECTS[@]} -gt 0 ]; then
    echo -e "${GREEN}Built:${NC}"
    for proj in "${BUILT_PROJECTS[@]}"; do
        echo -e "  ${GREEN}✓${NC} ${proj}"
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
    echo -e "${GREEN}All Xcode projects built successfully!${NC}"
else
    echo -e "${RED}Some projects failed to build!${NC}"
fi

exit $OVERALL_STATUS
