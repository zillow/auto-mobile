#!/bin/bash
#
# XCTestService Run Script
# Builds (if needed) and runs XCTestService on a booted iOS Simulator
#
# Usage:
#   ./scripts/ios/xctestservice-run.sh [--rebuild]
#
# Options:
#   --rebuild    Force rebuild even if artifacts exist
#
# Environment Variables:
#   XCTESTSERVICE_PORT    Port for XCTestService (default: 8765)
#   XCTESTSERVICE_TIMEOUT Timeout in seconds (default: 3600)

set -e

# Options
FORCE_REBUILD=false
for arg in "$@"; do
    case "$arg" in
        --rebuild)
            FORCE_REBUILD=true
            ;;
        *)
            ;;
    esac
done

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
XCTESTSERVICE_DIR="${PROJECT_ROOT}/ios/XCTestService"

# Default paths and settings
DERIVED_DATA="/tmp/automobile-xctestservice"
PORT="${XCTESTSERVICE_PORT:-8765}"
TIMEOUT="${XCTESTSERVICE_TIMEOUT:-3600}"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  XCTestService Run${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Check for booted simulator
SIMULATOR_ID=$(xcrun simctl list devices booted -j 2>/dev/null | grep -o '"udid" : "[^"]*"' | head -1 | sed 's/"udid" : "//;s/"$//')

if [ -z "${SIMULATOR_ID}" ]; then
    echo -e "${RED}Error: No booted iOS simulator found.${NC}"
    echo -e "${YELLOW}Boot a simulator first:${NC}"
    echo -e "  xcrun simctl boot \"iPhone 16\""
    exit 1
fi

SIMULATOR_NAME=$(xcrun simctl list devices booted | grep "${SIMULATOR_ID}" | sed 's/.*(\(.*\)) (.*/\1/' | head -1)
echo -e "${BLUE}Simulator:${NC} ${SIMULATOR_NAME:-${SIMULATOR_ID}}"
echo -e "${BLUE}Port:${NC} ${PORT}"
echo ""

# Check if build is needed
XCTESTRUN_FILE=$(find "${DERIVED_DATA}/Build/Products" -name "*.xctestrun" -type f 2>/dev/null | head -1)

if [ "${FORCE_REBUILD}" = true ] || [ -z "${XCTESTRUN_FILE}" ]; then
    echo -e "${BLUE}Building XCTestService...${NC}"
    "${SCRIPT_DIR}/xctestservice-build-for-testing.sh"
    XCTESTRUN_FILE=$(find "${DERIVED_DATA}/Build/Products" -name "*.xctestrun" -type f 2>/dev/null | head -1)
fi

if [ -z "${XCTESTRUN_FILE}" ]; then
    echo -e "${RED}Error: No .xctestrun file found after build.${NC}"
    exit 1
fi

echo -e "${GREEN}Using xctestrun:${NC} ${XCTESTRUN_FILE}"
echo ""

# Run XCTestService
echo -e "${BLUE}Starting XCTestService...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

xcodebuild test-without-building \
    -xctestrun "${XCTESTRUN_FILE}" \
    -destination "id=${SIMULATOR_ID}" \
    -only-testing:XCTestServiceUITests/XCTestServiceUITests/testRunService \
    "XCTESTSERVICE_PORT=${PORT}" \
    "XCTESTSERVICE_TIMEOUT=${TIMEOUT}"
