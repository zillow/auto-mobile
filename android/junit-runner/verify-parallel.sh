#!/bin/bash
# Verify both emulators are active during parallel test execution

# Parse arguments
VERBOSE=false
if [[ "$1" == "--verbose" ]]; then
    VERBOSE=true
fi

echo "=== Monitoring both emulators during test execution ==="
echo ""
echo "This script will:"
echo "1. Show current screen state of both devices"
echo "2. Run tests in parallel"
if [ "$VERBOSE" = true ]; then
    echo "3. Monitor which apps are in foreground on each device (verbose mode)"
else
    echo "3. Run silently (use --verbose to see device monitoring)"
fi
echo ""

# Function to get foreground app
get_foreground_app() {
    local device=$1
    adb -s "$device" shell dumpsys window | grep mCurrentFocus | awk '{print $3}' | cut -d'/' -f1
}

# Function to monitor devices
monitor_devices() {
    while true; do
        timestamp=$(date "+%H:%M:%S")
        app_5554=$(get_foreground_app emulator-5554)
        app_5556=$(get_foreground_app emulator-5556)
        echo "[$timestamp] emulator-5554: $app_5554 | emulator-5556: $app_5556"
        sleep 1
    done
}

# Start monitoring in background if verbose mode enabled
MONITOR_PID=""
if [ "$VERBOSE" = true ]; then
    echo "Starting device monitor..."
    monitor_devices &
    MONITOR_PID=$!
    # Give monitor time to start
    sleep 2
fi

# Run the tests
echo ""
echo "Running parallel tests..."
./gradlew :junit-runner:test --tests ClockAppAutoMobileTest --rerun-tasks

# Stop monitoring if it was started
if [ -n "$MONITOR_PID" ]; then
    kill $MONITOR_PID 2>/dev/null
fi

echo ""
echo "=== Test complete! ==="
echo ""
if [ "$VERBOSE" = true ]; then
    echo "Check the output above to verify both emulators were active."
    echo "You should see different apps on emulator-5554 vs emulator-5556."
else
    echo "Tests completed. Run with --verbose to see device monitoring logs."
fi
