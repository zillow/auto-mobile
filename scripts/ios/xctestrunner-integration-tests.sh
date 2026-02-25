#!/bin/bash
#
# XCTestRunner Integration Tests Script
# Runs the XCTestRunner integration tests against a simulator
#
# Usage:
#   ./scripts/ios/xctestrunner-integration-tests.sh [test-filter]
#
# Arguments:
#   test-filter   Optional test filter (default: RemindersLaunchPlanTests)
#
# Environment Variables:
#   AUTOMOBILE_TEST_PLAN   Test plan file to use (default: Plans/launch-reminders-app.yaml)
#
# Prerequisites:
#   - CtrlProxy iOS artifacts must be built (run ctrl-proxy-build-for-testing.sh)
#   - A simulator must be booted
#   - Bun must be installed (for the MCP daemon)

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
XCTESTRUNNER_DIR="${PROJECT_ROOT}/ios/XCTestRunner"

# Test filter
TEST_FILTER="${1:-RemindersLaunchPlanTests}"

# Test plan
TEST_PLAN="${AUTOMOBILE_TEST_PLAN:-Plans/launch-reminders-app.yaml}"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  XCTestRunner Integration Tests${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${BLUE}Test filter:${NC} ${TEST_FILTER}"
echo -e "${BLUE}Test plan:${NC} ${TEST_PLAN}"
echo ""

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

# Check if CtrlProxy iOS artifacts exist
if ! "${SCRIPT_DIR}/ctrl-proxy-verify-artifacts.sh" >/dev/null 2>&1; then
    echo -e "  ${RED}✗${NC} CtrlProxy iOS artifacts not found"
    echo -e "${YELLOW}Run ./scripts/ios/ctrl-proxy-build-for-testing.sh first${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} CtrlProxy iOS artifacts found"

# Check if simulator is booted
BOOTED_DEVICE=$(xcrun simctl list devices booted -j | grep -o '"udid" : "[^"]*"' | head -1 | sed 's/"udid" : "\(.*\)"/\1/')
if [ -z "$BOOTED_DEVICE" ]; then
    echo -e "  ${RED}✗${NC} No booted simulator found"
    echo -e "${YELLOW}Boot a simulator first: xcrun simctl boot 'iPhone 15'${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Simulator booted: ${BOOTED_DEVICE}"

# Check if bun is available
if ! command -v bun &> /dev/null; then
    echo -e "  ${RED}✗${NC} Bun not found"
    echo -e "${YELLOW}Install bun: curl -fsSL https://bun.sh/install | bash${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} Bun available"

echo ""

# Run tests
echo -e "${BLUE}Running integration tests...${NC}"
echo ""

cd "${XCTESTRUNNER_DIR}"
AUTOMOBILE_TEST_PLAN="${TEST_PLAN}" swift test --filter "${TEST_FILTER}"

echo ""
echo -e "${GREEN}Integration tests completed${NC}"
