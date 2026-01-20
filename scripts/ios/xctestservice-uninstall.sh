#!/bin/bash
#
# XCTestService Uninstall Script
# Removes XCTestService apps from iOS simulator and cleans build artifacts
#
# Usage:
#   ./scripts/ios/xctestservice-uninstall.sh [device-id]
#
# Arguments:
#   device-id    Optional simulator device ID. If not provided, uses first booted simulator.
#
# Environment Variables:
#   AUTOMOBILE_XCTESTSERVICE_DERIVED_DATA  Override the default derived data path
#                                          (default: /tmp/automobile-xctestservice)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default derived data path
DEFAULT_DERIVED_DATA="/tmp/automobile-xctestservice"
DERIVED_DATA="${AUTOMOBILE_XCTESTSERVICE_DERIVED_DATA:-${DEFAULT_DERIVED_DATA}}"

# XCTestService bundle identifiers
XCTESTSERVICE_APP_BUNDLE_ID="dev.jasonpearson.automobile.XCTestServiceApp"
XCTESTSERVICE_UITESTS_BUNDLE_ID="dev.jasonpearson.automobile.XCTestServiceUITests.xctrunner"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  XCTestService Uninstall${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Get device ID
DEVICE_ID="$1"
if [ -z "$DEVICE_ID" ]; then
    # Find first booted simulator
    DEVICE_ID=$(xcrun simctl list devices booted -j | grep -o '"udid" : "[^"]*"' | head -1 | sed 's/"udid" : "\(.*\)"/\1/')
    if [ -z "$DEVICE_ID" ]; then
        echo -e "${YELLOW}No booted simulator found. Skipping app uninstall.${NC}"
    else
        echo -e "${BLUE}Using booted simulator:${NC} ${DEVICE_ID}"
    fi
else
    echo -e "${BLUE}Using specified device:${NC} ${DEVICE_ID}"
fi

# Uninstall apps if we have a device
if [ -n "$DEVICE_ID" ]; then
    echo ""
    echo -e "${BLUE}Uninstalling XCTestService apps...${NC}"

    if xcrun simctl uninstall "$DEVICE_ID" "$XCTESTSERVICE_APP_BUNDLE_ID" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Uninstalled XCTestServiceApp"
    else
        echo -e "  ${YELLOW}○${NC} XCTestServiceApp not installed"
    fi

    if xcrun simctl uninstall "$DEVICE_ID" "$XCTESTSERVICE_UITESTS_BUNDLE_ID" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Uninstalled XCTestServiceUITests-Runner"
    else
        echo -e "  ${YELLOW}○${NC} XCTestServiceUITests-Runner not installed"
    fi
fi

# Remove build artifacts
echo ""
echo -e "${BLUE}Removing build artifacts...${NC}"
if [ -d "$DERIVED_DATA" ]; then
    rm -rf "$DERIVED_DATA"
    echo -e "  ${GREEN}✓${NC} Removed ${DERIVED_DATA}"
else
    echo -e "  ${YELLOW}○${NC} ${DERIVED_DATA} does not exist"
fi

# Kill any running XCTestService processes
echo ""
echo -e "${BLUE}Stopping XCTestService processes...${NC}"
if pkill -f "xcodebuild.*XCTestServiceUITests" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Stopped xcodebuild test processes"
else
    echo -e "  ${YELLOW}○${NC} No xcodebuild test processes running"
fi

echo ""
echo -e "${GREEN}XCTestService uninstall complete${NC}"
