#!/bin/bash
#
# XCTestService Diagnostic Script
# Tests installation, running status, WebSocket connection, and view hierarchy retrieval
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
PORT=${XCTESTSERVICE_PORT:-8765}
HOST="localhost"
HEALTH_URL="http://${HOST}:${PORT}/health"
WS_URL="ws://${HOST}:${PORT}/ws"
TIMEOUT=5

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
XCTEST_SERVICE_DIR="${PROJECT_ROOT}/ios/XCTestService"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  XCTestService Diagnostic Script${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "Port: ${PORT}"
echo -e "Health URL: ${HEALTH_URL}"
echo -e "WebSocket URL: ${WS_URL}"
echo ""

# Track overall status
OVERALL_STATUS=0

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

# =============================================================================
# Test 1: Check if XCTestService project exists and is buildable
# =============================================================================
echo -e "${BLUE}[1/5] Checking XCTestService Installation${NC}"
echo ""

# Check Xcode project exists
if [ -d "${XCTEST_SERVICE_DIR}/XCTestService.xcodeproj" ]; then
    print_status 0 "Xcode project found: ios/XCTestService/XCTestService.xcodeproj"
else
    print_status 1 "Xcode project not found at ios/XCTestService/XCTestService.xcodeproj"
fi

# Check Swift sources exist
if [ -f "${XCTEST_SERVICE_DIR}/Sources/XCTestService/XCTestService.swift" ]; then
    print_status 0 "XCTestService.swift source found"
else
    print_status 1 "XCTestService.swift source not found"
fi

# Check UI Tests exist
if [ -f "${XCTEST_SERVICE_DIR}/Tests/XCTestServiceUITests/XCTestServiceUITests.swift" ]; then
    print_status 0 "XCTestServiceUITests.swift found"
else
    print_status 1 "XCTestServiceUITests.swift not found"
fi

# Check if xcodebuild is available
if command -v xcodebuild &> /dev/null; then
    print_status 0 "xcodebuild is available"
    XCODE_VERSION=$(xcodebuild -version | head -1)
    print_info "Version: ${XCODE_VERSION}"
else
    print_status 1 "xcodebuild not found - Xcode required"
fi

# Check available schemes
echo ""
echo -e "  ${BLUE}Available schemes:${NC}"
if [ -d "${XCTEST_SERVICE_DIR}/XCTestService.xcodeproj" ]; then
    cd "${XCTEST_SERVICE_DIR}"
    xcodebuild -list -json 2>/dev/null | grep -A 20 '"schemes"' | grep '"' | sed 's/[",]//g' | while read scheme; do
        echo "    - $scheme"
    done
    cd - > /dev/null
fi

echo ""

# =============================================================================
# Test 2: Check if XCTestService is running (health endpoint + process check)
# =============================================================================
echo -e "${BLUE}[2/5] Checking if XCTestService is Running${NC}"
echo ""

# First check if xcodebuild test process is running for XCTestService
XCTEST_PROCESS_PID=$(pgrep -f 'xcodebuild.*XCTestService' 2>/dev/null || echo "")
if [ -n "$XCTEST_PROCESS_PID" ]; then
    print_status 0 "XCTestService xcodebuild process found (PID: ${XCTEST_PROCESS_PID})"
    PROCESS_RUNNING=true
else
    print_warning "No XCTestService xcodebuild process found"
    PROCESS_RUNNING=false
fi

HEALTH_RESPONSE=$(curl -s --max-time ${TIMEOUT} "${HEALTH_URL}" 2>/dev/null || echo "FAILED")

if [ "$HEALTH_RESPONSE" == "FAILED" ]; then
    print_status 1 "Health endpoint not responding at ${HEALTH_URL}"
    SERVICE_RUNNING=false

    # Check if we should auto-start the service
    if [ "$PROCESS_RUNNING" = false ]; then
        echo ""
        print_info "XCTestService is not running. Attempting to start it..."

        # Find a booted simulator
        BOOTED_SIMULATOR=$(xcrun simctl list devices booted -j 2>/dev/null | grep -o '"udid" : "[^"]*"' | head -1 | sed 's/"udid" : "//;s/"$//')

        if [ -z "$BOOTED_SIMULATOR" ]; then
            print_warning "No booted simulator found. Trying to find and boot one..."
            # Try to find an available iPhone simulator
            AVAILABLE_SIMULATOR=$(xcrun simctl list devices available -j 2>/dev/null | grep -B2 '"isAvailable" : true' | grep -o '"udid" : "[^"]*"' | head -1 | sed 's/"udid" : "//;s/"$//')

            if [ -n "$AVAILABLE_SIMULATOR" ]; then
                print_info "Booting simulator ${AVAILABLE_SIMULATOR}..."
                xcrun simctl boot "$AVAILABLE_SIMULATOR" 2>/dev/null || true
                sleep 3
                BOOTED_SIMULATOR="$AVAILABLE_SIMULATOR"
            else
                print_status 1 "No available iOS simulators found"
                print_info "Please install iOS Simulators via Xcode"
            fi
        fi

        if [ -n "$BOOTED_SIMULATOR" ]; then
            print_info "Using simulator: ${BOOTED_SIMULATOR}"

            # Create log file for xcodebuild output
            LOG_FILE="/tmp/xctestservice-$(date +%Y%m%d-%H%M%S).log"
            print_info "Log file: ${LOG_FILE}"

            # Start xcodebuild test in background
            echo ""
            print_info "Starting XCTestService in background..."

            cd "${XCTEST_SERVICE_DIR}"
            nohup xcodebuild test \
                -scheme XCTestServiceApp \
                -destination "id=${BOOTED_SIMULATOR}" \
                -only-testing:XCTestServiceUITests/XCTestServiceUITests/testRunService \
                > "$LOG_FILE" 2>&1 &

            XCODEBUILD_PID=$!
            cd - > /dev/null

            print_info "Started xcodebuild with PID: ${XCODEBUILD_PID}"

            # Wait for service to come up
            echo ""
            print_info "Waiting for XCTestService to start (up to 60 seconds)..."

            MAX_WAIT=60
            WAITED=0
            while [ $WAITED -lt $MAX_WAIT ]; do
                HEALTH_CHECK=$(curl -s --max-time 2 "${HEALTH_URL}" 2>/dev/null || echo "")
                if [[ "$HEALTH_CHECK" == *"ok"* ]] || [[ "$HEALTH_CHECK" == *"status"* ]]; then
                    echo ""
                    print_status 0 "XCTestService is now running!"
                    SERVICE_RUNNING=true
                    break
                fi

                # Check if process is still alive
                if ! kill -0 $XCODEBUILD_PID 2>/dev/null; then
                    echo ""
                    print_status 1 "xcodebuild process exited unexpectedly"
                    print_info "Check log file for errors: ${LOG_FILE}"
                    # Show last few lines of log
                    if [ -f "$LOG_FILE" ]; then
                        echo ""
                        echo -e "  ${YELLOW}Last 10 lines of log:${NC}"
                        tail -10 "$LOG_FILE" | sed 's/^/    /'
                    fi
                    break
                fi

                printf "."
                sleep 2
                WAITED=$((WAITED + 2))
            done

            if [ "$SERVICE_RUNNING" = false ] && [ $WAITED -ge $MAX_WAIT ]; then
                echo ""
                print_status 1 "Timeout waiting for XCTestService to start"
                print_info "xcodebuild may still be building. Check: ${LOG_FILE}"
                # Show last few lines of log
                if [ -f "$LOG_FILE" ]; then
                    echo ""
                    echo -e "  ${YELLOW}Last 10 lines of log:${NC}"
                    tail -10 "$LOG_FILE" | sed 's/^/    /'
                fi
            fi
        fi
    else
        print_info "Process is running but health endpoint not responding yet"
        print_info "The service may still be starting up..."
    fi
else
    print_status 0 "Health endpoint responding"
    print_info "Response: ${HEALTH_RESPONSE}"
    SERVICE_RUNNING=true
fi

# Check if port is in use
if command -v lsof &> /dev/null; then
    PORT_PROCESS=$(lsof -i :${PORT} -t 2>/dev/null || echo "")
    if [ -n "$PORT_PROCESS" ]; then
        print_info "Port ${PORT} is in use by PID: ${PORT_PROCESS}"
    else
        if [ "$SERVICE_RUNNING" = false ]; then
            print_warning "Port ${PORT} is not in use"
        fi
    fi
fi

echo ""

# =============================================================================
# Test 3: Test WebSocket Connection
# =============================================================================
echo -e "${BLUE}[3/5] Testing WebSocket Connection${NC}"
echo ""

# Check if we have a WebSocket client available
WS_CLIENT=""
if command -v websocat &> /dev/null; then
    WS_CLIENT="websocat"
    print_status 0 "websocat available for WebSocket testing"
elif command -v wscat &> /dev/null; then
    WS_CLIENT="wscat"
    print_status 0 "wscat available for WebSocket testing"
else
    print_warning "No WebSocket CLI client found (websocat or wscat)"
    print_info "Install with: brew install websocat"
    print_info "Or: npm install -g wscat"
fi

if [ "$SERVICE_RUNNING" = true ] && [ -n "$WS_CLIENT" ]; then
    echo ""
    echo -e "  ${BLUE}Testing WebSocket handshake...${NC}"

    # Test basic WebSocket connection with timeout
    if [ "$WS_CLIENT" = "websocat" ]; then
        WS_TEST=$(timeout 3 websocat -1 "${WS_URL}" 2>&1 || echo "TIMEOUT_OR_ERROR")
    else
        WS_TEST=$(timeout 3 wscat -c "${WS_URL}" -x '{}' 2>&1 || echo "TIMEOUT_OR_ERROR")
    fi

    if [[ "$WS_TEST" == *"connected"* ]] || [[ "$WS_TEST" == *"type"* ]]; then
        print_status 0 "WebSocket connection successful"
        print_info "Received: ${WS_TEST:0:100}..."
    else
        print_status 1 "WebSocket connection failed or timed out"
        print_info "Response: ${WS_TEST:0:200}"
    fi
elif [ "$SERVICE_RUNNING" = false ]; then
    print_warning "Skipping WebSocket test - service not running"
fi

echo ""

# =============================================================================
# Test 4: List Supported WebSocket Endpoints/Commands
# =============================================================================
echo -e "${BLUE}[4/5] Supported WebSocket Commands${NC}"
echo ""

echo -e "  ${CYAN}Request Types (from Models.swift):${NC}"
echo "    View Hierarchy:"
echo "      - request_hierarchy          : Get full view hierarchy"
echo "      - request_hierarchy_if_stale : Get hierarchy only if cached is stale"
echo "      - request_screenshot         : Get screenshot as base64 PNG"
echo ""
echo "    Gestures:"
echo "      - request_tap_coordinates    : Tap at x, y coordinates"
echo "      - request_swipe              : Swipe from (x1,y1) to (x2,y2)"
echo "      - request_two_finger_swipe   : Two-finger swipe (not implemented)"
echo "      - request_drag               : Drag with press/drag/hold durations"
echo "      - request_pinch              : Pinch gesture with scale"
echo ""
echo "    Text Input:"
echo "      - request_set_text           : Set text in focused field"
echo "      - request_ime_action         : Perform IME action (done, next, etc)"
echo "      - request_select_all         : Select all text"
echo ""
echo "    Actions:"
echo "      - request_action             : Perform action on element"
echo "      - request_clipboard          : Clipboard operations (not implemented)"
echo ""
echo "    Accessibility:"
echo "      - get_current_focus          : Get focused element (not implemented)"
echo "      - get_traversal_order        : Get traversal order (not implemented)"
echo "      - add_highlight              : Add highlight overlay (not implemented)"
echo ""

echo -e "  ${CYAN}Response Types:${NC}"
echo "    - connected             : Connection established (push)"
echo "    - hierarchy_update      : View hierarchy data"
echo "    - screenshot            : Screenshot data"
echo "    - tap_coordinates_result: Tap result"
echo "    - swipe_result          : Swipe result"
echo "    - drag_result           : Drag result"
echo "    - pinch_result          : Pinch result"
echo "    - set_text_result       : Text input result"
echo "    - ime_action_result     : IME action result"
echo "    - select_all_result     : Select all result"
echo "    - action_result         : Action result"
echo ""

# =============================================================================
# Test 5: Attempt View Hierarchy Request
# =============================================================================
echo -e "${BLUE}[5/5] Testing View Hierarchy Request${NC}"
echo ""

if [ "$SERVICE_RUNNING" = true ]; then
    # Check if Bun is available (preferred - has native WebSocket support)
    if command -v bun &> /dev/null; then
        print_status 0 "Bun available for WebSocket testing (native WebSocket)"

        # Create Bun-compatible WebSocket test script
        BUN_WS_SCRIPT="/tmp/ws_test_$$.ts"
        rm -f "$BUN_WS_SCRIPT"
        cat > "$BUN_WS_SCRIPT" << 'BUN_SCRIPT'
const WS_URL = process.argv[2] || 'ws://localhost:8765/ws';
const TIMEOUT_MS = parseInt(process.argv[3] || '10000');

console.log(`Connecting to ${WS_URL}...`);

const ws = new WebSocket(WS_URL);
let hierarchyReceived = false;

const timeout = setTimeout(() => {
    console.log('\n❌ Timeout waiting for response');
    ws.close();
    process.exit(1);
}, TIMEOUT_MS);

ws.onopen = () => {
    console.log('✓ WebSocket connected');

    // Send hierarchy request
    const request = {
        type: 'request_hierarchy',
        requestId: 'test-' + Date.now()
    };

    console.log(`\nSending request: ${JSON.stringify(request)}`);
    ws.send(JSON.stringify(request));
};

ws.onmessage = (event) => {
    try {
        const message = JSON.parse(event.data as string);
        console.log(`\nReceived message type: ${message.type}`);

        if (message.type === 'connected') {
            console.log(`  Connection ID: ${message.id}`);
        } else if (message.type === 'hierarchy_update') {
            hierarchyReceived = true;
            console.log('✓ Hierarchy response received');

            if (message.data) {
                console.log(`\n  Package: ${message.data.packageName || 'N/A'}`);
                console.log(`  Updated: ${message.data.updatedAt}`);

                if (message.data.hierarchy) {
                    console.log(`  Root class: ${message.data.hierarchy.className || 'N/A'}`);
                    const childCount = message.data.hierarchy.node?.length || 0;
                    console.log(`  Child nodes: ${childCount}`);

                    // Print first few elements
                    if (childCount > 0) {
                        console.log('\n  Sample elements:');
                        const printNode = (node: any, depth = 0) => {
                            if (depth > 2) return;
                            const indent = '    '.repeat(depth + 1);
                            const text = node.text || node['content-desc'] || node.className || 'Unknown';
                            const id = node['resource-id'] || '';
                            console.log(`${indent}- ${text}${id ? ` (${id})` : ''}`);
                            if (node.node && Array.isArray(node.node)) {
                                node.node.slice(0, 3).forEach((child: any) => printNode(child, depth + 1));
                            }
                        };
                        printNode(message.data.hierarchy);
                    }
                } else if (message.data.error) {
                    console.log(`  Error: ${message.data.error}`);
                }
            } else if (message.error) {
                console.log(`  Error: ${message.error}`);
            }

            if (message.perfTiming) {
                console.log(`\n  Performance timing:`);
                const printTiming = (timing: any, depth = 0) => {
                    const indent = '    '.repeat(depth + 1);
                    console.log(`${indent}${timing.name}: ${timing.durationMs}ms`);
                    if (timing.children) {
                        timing.children.forEach((child: any) => printTiming(child, depth + 1));
                    }
                };
                printTiming(message.perfTiming);
            }

            clearTimeout(timeout);
            ws.close();
            process.exit(0);
        } else if (message.error) {
            console.log(`  Error: ${message.error}`);
        }
    } catch (e) {
        console.log(`  Raw data: ${String(event.data).substring(0, 500)}`);
    }
};

ws.onerror = (error) => {
    console.log(`\n❌ WebSocket error: ${error}`);
    clearTimeout(timeout);
    process.exit(1);
};

ws.onclose = () => {
    console.log('\nWebSocket closed');
    clearTimeout(timeout);
    if (!hierarchyReceived) {
        process.exit(1);
    }
};
BUN_SCRIPT

        print_info "Running WebSocket hierarchy test..."
        echo ""

        # Run the test with Bun
        # Note: Hierarchy extraction can be slow (10-30s) because XCUIElement
        # property accesses communicate with iOS accessibility service
        bun run "$BUN_WS_SCRIPT" "${WS_URL}" 60000
        TEST_RESULT=$?

        rm -f "$BUN_WS_SCRIPT"

        echo ""
        if [ $TEST_RESULT -eq 0 ]; then
            print_status 0 "View hierarchy request successful"
        else
            print_status 1 "View hierarchy request failed"
        fi

    elif command -v node &> /dev/null; then
        print_warning "Node.js available but 'ws' module may not be installed"

        # Fallback: Try with curl for basic HTTP test
        echo ""
        print_info "Attempting raw HTTP WebSocket upgrade..."

        # Generate WebSocket key
        WS_KEY=$(openssl rand -base64 16)

        UPGRADE_RESPONSE=$(curl -s -i --max-time 5 \
            -H "Upgrade: websocket" \
            -H "Connection: Upgrade" \
            -H "Sec-WebSocket-Key: ${WS_KEY}" \
            -H "Sec-WebSocket-Version: 13" \
            "http://${HOST}:${PORT}/ws" 2>/dev/null || echo "FAILED")

        if [[ "$UPGRADE_RESPONSE" == *"101"* ]]; then
            print_status 0 "WebSocket upgrade handshake successful"
            print_info "Server responded with 101 Switching Protocols"
        else
            print_status 1 "WebSocket upgrade failed"
            print_info "Response: ${UPGRADE_RESPONSE:0:200}"
        fi
    else
        print_warning "Neither Bun nor Node.js available for WebSocket testing"
        print_info "Install Bun or Node.js for full WebSocket testing capabilities"
    fi
else
    print_warning "Skipping hierarchy test - service not running"
    echo ""
    print_info "To start the XCTestService:"
    echo ""
    echo "    # List available simulators"
    echo "    xcrun simctl list devices available"
    echo ""
    echo "    # Boot a simulator (if not already running)"
    echo "    xcrun simctl boot 'iPhone 16 Pro'"
    echo ""
    echo "    # Get the booted simulator ID"
    echo "    DEVICE_ID=\$(xcrun simctl list devices booted -j | grep -o '\"udid\" : \"[^\"]*\"' | head -1 | sed 's/\"udid\" : \"//;s/\"\$//')"
    echo ""
    echo "    # Run the XCTestService"
    echo "    cd ${XCTEST_SERVICE_DIR}"
    echo "    xcodebuild test \\"
    echo "        -scheme XCTestServiceApp \\"
    echo "        -destination \"id=\$DEVICE_ID\" \\"
    echo "        -only-testing:XCTestServiceUITests/XCTestServiceUITests/testRunService"
    echo ""
fi

echo ""

# =============================================================================
# Summary
# =============================================================================
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Summary${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

if [ $OVERALL_STATUS -eq 0 ]; then
    echo -e "  ${GREEN}All checks passed!${NC}"
else
    echo -e "  ${RED}Some checks failed${NC}"
fi

echo ""
echo -e "  Service Status: $([ "$SERVICE_RUNNING" = true ] && echo -e "${GREEN}Running${NC}" || echo -e "${RED}Not Running${NC}")"
echo -e "  Port: ${PORT}"
echo ""

if [ "$SERVICE_RUNNING" = false ]; then
    echo -e "${YELLOW}Quick Start:${NC}"
    echo ""
    echo "  # Get booted simulator ID (or boot one first with: xcrun simctl boot 'iPhone 16 Pro')"
    echo "  DEVICE_ID=\$(xcrun simctl list devices booted -j | grep -o '\"udid\" : \"[^\"]*\"' | head -1 | sed 's/\"udid\" : \"//;s/\"\$//')"
    echo ""
    echo "  # Start XCTestService on simulator"
    echo "  cd ios/XCTestService"
    echo "  xcodebuild test -scheme XCTestServiceApp \\"
    echo "      -destination \"id=\$DEVICE_ID\" \\"
    echo "      -only-testing:XCTestServiceUITests/XCTestServiceUITests/testRunService"
    echo ""
fi

exit $OVERALL_STATUS
