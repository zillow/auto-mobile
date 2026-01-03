#!/bin/bash
# Verify both emulators are active during parallel test execution

echo "=== Monitoring both emulators during test execution ==="
echo ""
echo "This script will:"
echo "1. Show current screen state of both devices"
echo "2. Run tests in parallel"
echo "3. Monitor which apps are in foreground on each device"
echo ""

# Function to get foreground app
get_foreground_app() {
    local device=$1
    adb -s "$device" shell dumpsys window | grep mCurrentFocus | awk '{print $3}' | cut -d'/' -f1
}

# Function to monitor devices
monitor_devices() {
    while true; do
        clear
        echo "=== Device Activity Monitor ==="
        echo ""
        echo "emulator-5554: $(get_foreground_app emulator-5554)"
        echo "emulator-5556: $(get_foreground_app emulator-5556)"
        echo ""
        echo "Press Ctrl+C to stop monitoring"
        sleep 1
    done
}

# Start monitoring in background
echo "Starting device monitor..."
monitor_devices &
MONITOR_PID=$!

# Give monitor time to start
sleep 2

# Run the tests
echo ""
echo "Running parallel tests..."
./gradlew :junit-runner:test --tests ClockAppAutoMobileTest --rerun-tasks

# Stop monitoring
kill $MONITOR_PID 2>/dev/null

echo ""
echo "=== Test complete! ==="
echo ""
echo "Check the output above to verify both emulators were active."
echo "You should see different apps on emulator-5554 vs emulator-5556."
