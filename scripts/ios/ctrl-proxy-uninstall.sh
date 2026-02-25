#!/bin/bash
#
# CtrlProxy iOS Uninstall Script
# Removes CtrlProxy iOS apps from iOS simulator and cleans build artifacts
#
# Usage:
#   ./scripts/ios/ctrl-proxy-uninstall.sh [device-id]
#
# Arguments:
#   device-id    Optional simulator device ID. If not provided, uses first booted simulator.
#
# Environment Variables:
#   AUTOMOBILE_XCTESTSERVICE_DERIVED_DATA  Override the default derived data path
#                                          (default: /tmp/automobile-ctrl-proxy)

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default derived data path
DEFAULT_DERIVED_DATA="/tmp/automobile-ctrl-proxy"
DERIVED_DATA="${AUTOMOBILE_XCTESTSERVICE_DERIVED_DATA:-${DEFAULT_DERIVED_DATA}}"

# CtrlProxy iOS bundle identifiers
CTRL_PROXY_APP_BUNDLE_ID="dev.jasonpearson.automobile.ctrlproxy"
CTRL_PROXY_UITESTS_BUNDLE_ID="dev.jasonpearson.automobile.ctrlproxy.uitests.xctrunner"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  CtrlProxy iOS Uninstall${NC}"
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
    echo -e "${BLUE}Uninstalling CtrlProxy iOS apps...${NC}"

    if xcrun simctl uninstall "$DEVICE_ID" "$CTRL_PROXY_APP_BUNDLE_ID" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Uninstalled CtrlProxyApp"
    else
        echo -e "  ${YELLOW}○${NC} CtrlProxyApp not installed"
    fi

    if xcrun simctl uninstall "$DEVICE_ID" "$CTRL_PROXY_UITESTS_BUNDLE_ID" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Uninstalled CtrlProxyUITests-Runner"
    else
        echo -e "  ${YELLOW}○${NC} CtrlProxyUITests-Runner not installed"
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

# Kill any running CtrlProxy iOS processes
echo ""
echo -e "${BLUE}Stopping CtrlProxy iOS processes...${NC}"
if pkill -f "xcodebuild.*CtrlProxyUITests" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Stopped xcodebuild test processes"
else
    echo -e "  ${YELLOW}○${NC} No xcodebuild test processes running"
fi

echo ""
echo -e "${GREEN}CtrlProxy iOS uninstall complete${NC}"
