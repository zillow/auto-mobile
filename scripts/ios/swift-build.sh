#!/bin/bash
#
# Swift Package Build Script
# Builds all Swift packages in the ios directory
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IOS_DIR="${PROJECT_ROOT}/ios"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Swift Package Build${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Track overall status
OVERALL_STATUS=0
FAILED_PACKAGES=()

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

# Check if swift is available
if ! command -v swift &> /dev/null; then
    echo -e "${RED}Error: swift command not found${NC}"
    exit 1
fi

SWIFT_VERSION=$(swift --version | head -1)
print_info "Swift version: ${SWIFT_VERSION}"
echo ""

# macOS packages (can be built and tested on macOS)
MACOS_PACKAGES=(
    "AXeAutomation"
    "XcodeCompanion"
    "XcodeExtension"
)

# iOS + macOS packages (have both platform support)
IOS_MACOS_PACKAGES=(
    "control-proxy"
    "XCTestRunner"
)

# iOS-only packages (need to be built for iOS simulator)
IOS_ONLY_PACKAGES=(
    "AccessibilityService"
)

# Build macOS packages
echo -e "${BLUE}Building macOS packages...${NC}"
for package in "${MACOS_PACKAGES[@]}"; do
    PACKAGE_DIR="${IOS_DIR}/${package}"
    if [ -f "${PACKAGE_DIR}/Package.swift" ]; then
        echo -e "  Building ${package}..."
        if (cd "${PACKAGE_DIR}" && swift build 2>&1); then
            print_status 0 "${package} built successfully"
        else
            print_status 1 "${package} build failed"
            FAILED_PACKAGES+=("${package}")
        fi
    else
        print_info "Skipping ${package} (no Package.swift)"
    fi
done
echo ""

# Optional: sign macOS products with Developer ID when credentials are available.
if [[ "${MACOS_SIGNING_ENABLED:-false}" == "true" ]]; then
    echo -e "${BLUE}Signing macOS products for release builds...${NC}"
    if "${SCRIPT_DIR}/sign-macos-products.sh"; then
        print_status 0 "macOS products signed successfully"
    else
        print_status 1 "macOS product signing failed"
        FAILED_PACKAGES+=("macOS product signing")
    fi
    echo ""
fi

# Build iOS + macOS packages (build for macOS platform on CI)
echo -e "${BLUE}Building iOS + macOS packages...${NC}"
for package in "${IOS_MACOS_PACKAGES[@]}"; do
    PACKAGE_DIR="${IOS_DIR}/${package}"
    if [ -f "${PACKAGE_DIR}/Package.swift" ]; then
        echo -e "  Building ${package}..."
        if (cd "${PACKAGE_DIR}" && swift build 2>&1); then
            print_status 0 "${package} built successfully"
        else
            print_status 1 "${package} build failed"
            FAILED_PACKAGES+=("${package}")
        fi
    else
        print_info "Skipping ${package} (no Package.swift)"
    fi
done
echo ""

# Build iOS-only packages for iOS simulator
echo -e "${BLUE}Building iOS-only packages for simulator...${NC}"
for package in "${IOS_ONLY_PACKAGES[@]}"; do
    PACKAGE_DIR="${IOS_DIR}/${package}"
    if [ -f "${PACKAGE_DIR}/Package.swift" ]; then
        echo -e "  Building ${package} for iOS simulator..."
        # Use xcodebuild to build for iOS simulator since swift build doesn't support cross-compilation
        if (cd "${PACKAGE_DIR}" && xcodebuild -scheme "${package}" -destination 'generic/platform=iOS Simulator' -quiet build 2>&1); then
            print_status 0 "${package} built successfully for iOS simulator"
        else
            print_status 1 "${package} build failed for iOS simulator"
            FAILED_PACKAGES+=("${package}")
        fi
    else
        print_info "Skipping ${package} (no Package.swift)"
    fi
done
echo ""

# Optional: sign XCTestRunner for iOS releases when credentials are available.
if [[ "${IOS_SIGNING_ENABLED:-false}" == "true" ]]; then
    echo -e "${BLUE}Signing iOS frameworks for release builds...${NC}"
    if "${SCRIPT_DIR}/sign-ios-frameworks.sh"; then
        print_status 0 "iOS frameworks signed successfully"
    else
        print_status 1 "iOS framework signing failed"
        FAILED_PACKAGES+=("iOS framework signing")
    fi
    echo ""
fi

# Summary
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Build Summary${NC}"
echo -e "${CYAN}========================================${NC}"
if [ ${#FAILED_PACKAGES[@]} -eq 0 ]; then
    echo -e "${GREEN}All packages built successfully!${NC}"
else
    echo -e "${RED}Failed packages:${NC}"
    for pkg in "${FAILED_PACKAGES[@]}"; do
        echo -e "  ${RED}✗${NC} ${pkg}"
    done
fi

exit $OVERALL_STATUS
