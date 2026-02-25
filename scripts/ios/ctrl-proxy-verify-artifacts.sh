#!/bin/bash
#
# CtrlProxy iOS Verify Artifacts Script
# Verifies that CtrlProxy iOS build artifacts exist and are valid
#
# Usage:
#   ./scripts/ios/ctrl-proxy-verify-artifacts.sh
#
# Environment Variables:
#   AUTOMOBILE_CTRL_PROXY_IOS_DERIVED_DATA  Override the default derived data path
#                                       (default: /tmp/automobile-ctrl-proxy)
#
# Exit Codes:
#   0 - All artifacts found
#   1 - One or more artifacts missing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default derived data path
DEFAULT_DERIVED_DATA="/tmp/automobile-ctrl-proxy"
DERIVED_DATA="${AUTOMOBILE_CTRL_PROXY_IOS_DERIVED_DATA:-${DEFAULT_DERIVED_DATA}}"
PRODUCTS_DIR="${DERIVED_DATA}/Build/Products"
SIM_DIR="${PRODUCTS_DIR}/Debug-iphonesimulator"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  CtrlProxy iOS Artifact Verification${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${BLUE}Derived data:${NC} ${DERIVED_DATA}"
echo ""

# Check if products directory exists
if [ ! -d "${PRODUCTS_DIR}" ]; then
    echo -e "${RED}Error: Products directory not found: ${PRODUCTS_DIR}${NC}"
    echo -e "${YELLOW}Run ./scripts/ios/ctrl-proxy-build-for-testing.sh first${NC}"
    exit 1
fi

# Find xctestrun file
XCTESTRUN_FILE=$(find "${PRODUCTS_DIR}" -name "*.xctestrun" -type f 2>/dev/null | head -1)

if [ -z "${XCTESTRUN_FILE}" ]; then
    echo -e "${RED}Error: No .xctestrun file found in ${PRODUCTS_DIR}${NC}"
    exit 1
fi

echo -e "${BLUE}Checking artifacts...${NC}"

# Required artifacts
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

echo ""
if [ "${ALL_FOUND}" = false ]; then
    echo -e "${RED}Error: Some required artifacts are missing${NC}"
    exit 1
fi

echo -e "${GREEN}All artifacts verified${NC}"
echo ""
echo -e "${BLUE}Products directory:${NC}"
ls -la "${PRODUCTS_DIR}/"
echo ""
echo -e "${BLUE}Simulator build directory:${NC}"
ls -la "${SIM_DIR}/"
echo ""
echo -e "${BLUE}xctestrun file:${NC} ${XCTESTRUN_FILE}"
