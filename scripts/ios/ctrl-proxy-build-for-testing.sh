#!/bin/bash
#
# CtrlProxy iOS Build-for-Testing Script
# Builds CtrlProxy iOS for iOS Simulator testing and installs to expected location
#
# Usage:
#   ./scripts/ios/ctrl-proxy-build-for-testing.sh [--install]
#
# Options:
#   --install    Install to /tmp/automobile-ctrl-proxy after build
#
# Environment Variables:
#   AUTOMOBILE_CTRL_PROXY_DERIVED_DATA  Override the default derived data path
#                                       (default: /tmp/automobile-ctrl-proxy)

set -e

# Options
INSTALL_AFTER_BUILD=false
for arg in "$@"; do
    case "$arg" in
        --install)
            INSTALL_AFTER_BUILD=true
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
CTRL_PROXY_IOS_DIR="${PROJECT_ROOT}/ios/control-proxy"
XCODEPROJ="${CTRL_PROXY_IOS_DIR}/CtrlProxy.xcodeproj"

# Default derived data path (matches IOSCtrlProxyBuilder.ts)
DEFAULT_DERIVED_DATA="/tmp/automobile-ctrl-proxy"
DERIVED_DATA="${AUTOMOBILE_CTRL_PROXY_DERIVED_DATA:-${DEFAULT_DERIVED_DATA}}"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  CtrlProxy iOS Build for Testing${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Check prerequisites
if ! command -v xcodebuild &> /dev/null; then
    echo -e "${RED}Error: xcodebuild not found. Please install Xcode.${NC}"
    exit 1
fi

XCODE_VERSION=$(xcodebuild -version)
XCODE_VERSION=${XCODE_VERSION%%$'\n'*}
echo -e "${BLUE}Xcode version:${NC} ${XCODE_VERSION}"
echo -e "${BLUE}Derived data:${NC} ${DERIVED_DATA}"
echo ""

# Generate Xcode project if needed (xcodeproj is committed to git, so this is
# only triggered in local dev when the project file is missing)
if [ ! -d "${XCODEPROJ}" ]; then
    if ! command -v xcodegen &> /dev/null; then
        echo -e "${YELLOW}Warning: xcodegen not found. Attempting to install via brew...${NC}"
        if command -v brew &> /dev/null; then
            brew install xcodegen
        else
            echo -e "${RED}Error: xcodegen not found and brew not available.${NC}"
            echo -e "${RED}Please install xcodegen: brew install xcodegen${NC}"
            exit 1
        fi
    fi
    echo -e "${BLUE}Generating Xcode project...${NC}"
    cd "${CTRL_PROXY_IOS_DIR}"
    xcodegen generate
    cd "${PROJECT_ROOT}"
fi

# Build for testing
echo -e "${BLUE}Building CtrlProxy iOS for testing...${NC}"
echo ""

BUILD_START=$(date +%s)

xcodebuild build-for-testing \
    -project "${XCODEPROJ}" \
    -scheme "CtrlProxyApp" \
    -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "${DERIVED_DATA}" \
    -configuration Debug \
    CODE_SIGN_IDENTITY="-" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO \
    | xcpretty --color 2>/dev/null || true

BUILD_END=$(date +%s)
BUILD_DURATION=$((BUILD_END - BUILD_START))

# Verify build products
PRODUCTS_DIR="${DERIVED_DATA}/Build/Products"
SIM_DIR="${PRODUCTS_DIR}/Debug-iphonesimulator"

echo ""
echo -e "${BLUE}Verifying build products...${NC}"

XCTESTRUN_FILE=$(find "${PRODUCTS_DIR}" -name "*.xctestrun" -type f 2>/dev/null | head -1)

if [ -z "${XCTESTRUN_FILE}" ]; then
    echo -e "${RED}Error: No .xctestrun file found in ${PRODUCTS_DIR}${NC}"
    exit 1
fi

REQUIRED_ARTIFACTS=(
    "${SIM_DIR}/CtrlProxyApp.app"
    "${SIM_DIR}/CtrlProxyUITests-Runner.app"
    "${SIM_DIR}/CtrlProxyTests.xctest"
)

ALL_FOUND=true
for artifact in "${REQUIRED_ARTIFACTS[@]}"; do
    if [ -e "${artifact}" ]; then
        echo -e "  ${GREEN}✓${NC} $(basename "${artifact}")"
    else
        echo -e "  ${RED}✗${NC} $(basename "${artifact}") - MISSING"
        ALL_FOUND=false
    fi
done

echo -e "  ${GREEN}✓${NC} $(basename "${XCTESTRUN_FILE}")"

if [ "${ALL_FOUND}" = false ]; then
    echo ""
    echo -e "${RED}Error: Some required artifacts are missing${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Build completed in ${BUILD_DURATION}s${NC}"
echo -e "${GREEN}xctestrun: ${XCTESTRUN_FILE}${NC}"

# Install to default location if requested and not already there
if [ "${INSTALL_AFTER_BUILD}" = true ] && [ "${DERIVED_DATA}" != "${DEFAULT_DERIVED_DATA}" ]; then
    echo ""
    echo -e "${BLUE}Installing to ${DEFAULT_DERIVED_DATA}...${NC}"
    rm -rf "${DEFAULT_DERIVED_DATA}"
    mkdir -p "${DEFAULT_DERIVED_DATA}"
    cp -R "${DERIVED_DATA}/Build" "${DEFAULT_DERIVED_DATA}/"
    echo -e "${GREEN}Installed successfully${NC}"
fi

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Build Summary${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "  Products: ${SIM_DIR}"
echo -e "  xctestrun: ${XCTESTRUN_FILE}"
echo ""
echo -e "To run tests manually:"
echo -e "  xcodebuild test-without-building \\"
echo -e "    -xctestrun \"${XCTESTRUN_FILE}\" \\"
echo -e "    -destination 'platform=iOS Simulator,name=iPhone 15' \\"
echo -e "    -only-testing:CtrlProxyUITests/CtrlProxyUITests/testRunService"
echo ""
