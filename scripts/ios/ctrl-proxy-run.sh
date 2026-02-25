#!/bin/bash
#
# CtrlProxy iOS Run Script
# Builds (if needed) and runs CtrlProxy iOS on a booted iOS Simulator
#
# Usage:
#   ./scripts/ios/ctrl-proxy-run.sh [--rebuild]
#
# Options:
#   --rebuild    Force rebuild even if artifacts exist
#
# Environment Variables:
#   CTRL_PROXY_IOS_PORT    Port for CtrlProxy iOS (default: 8765)
#   CTRL_PROXY_IOS_TIMEOUT Timeout in seconds (default: 3600)

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

# Default paths and settings
DERIVED_DATA="/tmp/automobile-ctrl-proxy"
PORT="${CTRL_PROXY_IOS_PORT:-8765}"
TIMEOUT="${CTRL_PROXY_IOS_TIMEOUT:-3600}"
RUNNER_BINARY="${DERIVED_DATA}/Build/Products/Debug-iphonesimulator/CtrlProxyUITests-Runner.app/CtrlProxyUITests-Runner"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  CtrlProxy iOS Run${NC}"
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
if [ "${FORCE_REBUILD}" = true ] || [ ! -f "${RUNNER_BINARY}" ]; then
    echo -e "${BLUE}Building CtrlProxy iOS...${NC}"
    "${SCRIPT_DIR}/ctrl-proxy-build-for-testing.sh"
fi

if [ ! -f "${RUNNER_BINARY}" ]; then
    echo -e "${RED}Error: Runner binary not found: ${RUNNER_BINARY}${NC}"
    exit 1
fi

echo -e "${GREEN}Using runner binary:${NC} ${RUNNER_BINARY}"
echo ""

# Run CtrlProxy iOS via simctl spawn (lighter than xcodebuild test-without-building)
echo -e "${BLUE}Starting CtrlProxy iOS...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

xcrun simctl spawn "${SIMULATOR_ID}" \
    --setenv CTRL_PROXY_IOS_PORT="${PORT}" \
    --setenv CTRL_PROXY_IOS_TIMEOUT="${TIMEOUT}" \
    "${RUNNER_BINARY}"
