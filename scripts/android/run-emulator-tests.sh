#!/bin/bash
#
# Run emulator tests with APK installation
#
# This script:
# 1. Logs comprehensive debug information about the environment
# 2. Validates and installs the accessibility service APK
# 3. Runs the test script
#
# Usage:
#   ./scripts/android/run-emulator-tests.sh <apk-path> <test-script>
#
# Example:
#   ./scripts/android/run-emulator-tests.sh \
#     "accessibility-service/build/outputs/apk/debug/accessibility-service-debug.apk" \
#     "./gradlew :junit-runner:test"
#
# shellcheck disable=SC2012 # Using ls for readable debug output is appropriate here

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Arguments
APK_PATH="${1:-}"
TEST_SCRIPT="${2:-}"

# Validate arguments
if [ -z "$APK_PATH" ] || [ -z "$TEST_SCRIPT" ]; then
  echo -e "${RED}Error: Missing required arguments${NC}"
  echo "Usage: $0 <apk-path> <test-script>"
  echo "Example: $0 'accessibility-service/build/outputs/apk/debug/accessibility-service-debug.apk' './gradlew :junit-runner:test'"
  exit 1
fi

if [ -n "$APK_PATH" ]; then
  export AUTOMOBILE_ACCESSIBILITY_APK_PATH="$APK_PATH"
  export AUTOMOBILE_SKIP_ACCESSIBILITY_CHECKSUM=1
  export AUTOMOBILE_SKIP_ACCESSIBILITY_DOWNLOAD_IF_INSTALLED=1
fi

# Helper function for section headers
print_section() {
  local title="$1"
  echo ""
  echo -e "${BLUE}==========================================${NC}"
  echo -e "${BLUE}$title${NC}"
  echo -e "${BLUE}==========================================${NC}"
}

# Helper function for success messages
print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

# Helper function for error messages
print_error() {
  echo -e "${RED}✗ $1${NC}"
}

# Helper function for warning messages
print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

# Retry function with exponential backoff for transient failures
# Detects known transient error patterns (403, timeout, connection issues)
retry_with_backoff() {
  local max_attempts="${RETRY_MAX_ATTEMPTS:-3}"
  local initial_delay="${RETRY_INITIAL_DELAY:-10}"
  local delay=$initial_delay
  local attempt=1
  local exit_code=0

  while [ "$attempt" -le "$max_attempts" ]; do
    echo ""
    echo -e "${BLUE}[Attempt $attempt/$max_attempts]${NC} Running: $*"
    echo ""

    # Run the command and capture output and exit code
    set +e
    output=$("$@" 2>&1)
    exit_code=$?
    set -e

    echo "$output"

    if [ $exit_code -eq 0 ]; then
      print_success "Command succeeded on attempt $attempt"
      return 0
    fi

    # Check if this is a transient/retryable error
    if echo "$output" | grep -qE "(status code 403|Forbidden|Could not resolve|timeout|Connection refused|Connection reset|ETIMEDOUT|ECONNRESET|503 Service Unavailable|502 Bad Gateway)"; then
      if [ "$attempt" -lt "$max_attempts" ]; then
        print_warning "Transient error detected (attempt $attempt/$max_attempts)"
        echo "Retrying in ${delay}s with exponential backoff..."
        sleep "$delay"
        delay=$((delay * 2))
        attempt=$((attempt + 1))
      else
        print_error "Command failed after $max_attempts attempts (transient errors)"
        return $exit_code
      fi
    else
      # Not a transient error, fail immediately
      print_error "Command failed with non-transient error (exit code: $exit_code)"
      return $exit_code
    fi
  done

  return $exit_code
}

# Main script starts here
print_section "EMULATOR SETUP DEBUG START"

echo "Current shell: $SHELL"
echo "Current user: $(whoami)"
echo "Current directory: $(pwd)"
echo "APK path: $APK_PATH"
echo "Test script: $TEST_SCRIPT"
echo ""

print_section "ENVIRONMENT INFORMATION"

echo "Shell information:"
echo "  SHELL: $SHELL"
echo "  BASH_VERSION: ${BASH_VERSION:-unknown}"
echo ""

echo "User information:"
echo "  USER: $(whoami)"
echo "  HOME: ${HOME:-unknown}"
echo ""

echo "Android environment variables:"
env | grep -E "(ANDROID|ADB)" | sort || print_warning "No ANDROID/ADB variables found"
echo ""

echo "PATH:"
echo "  $PATH" | tr ':' '\n' | sed 's/^/  /'
echo ""

print_section "ADB AVAILABILITY CHECK"

if command -v adb &> /dev/null; then
  print_success "adb found in PATH"
  echo "adb location: $(which adb)"
  echo "adb version:"
  adb --version
else
  print_error "adb not found in PATH"
  exit 1
fi

echo ""

print_section "EMULATOR CONNECTIVITY CHECK"

if adb devices &> /dev/null; then
  print_success "adb devices command successful"
  echo "Connected devices:"
  adb devices | sed 's/^/  /'
else
  print_error "adb devices command failed"
  exit 1
fi

echo ""

print_section "ACCESSIBILITY APK INSTALLATION"

echo "Expected APK path: $APK_PATH"
echo "Current working directory: $(pwd)"
echo ""

if [ -z "$APK_PATH" ]; then
  print_warning "APK_PATH is empty, skipping APK installation"
else
  echo "Checking if APK file exists..."
  echo ""

  if [ ! -f "$APK_PATH" ]; then
    print_error "Accessibility APK not found at '$APK_PATH'"
    echo ""
    echo "Directory structure diagnostics:"
    echo ""

    echo "Current directory:"
    ls -la | head -20
    echo ""

    echo "accessibility-service/ directory:"
    if [ -d "accessibility-service" ]; then
      ls -la accessibility-service/ | head -20
    else
      print_warning "(directory not found)"
    fi
    echo ""

    echo "accessibility-service/build/ directory:"
    if [ -d "accessibility-service/build" ]; then
      ls -la accessibility-service/build/ | head -20
    else
      print_warning "(directory not found)"
    fi
    echo ""

    echo "accessibility-service/build/outputs/ directory:"
    if [ -d "accessibility-service/build/outputs" ]; then
      ls -la accessibility-service/build/outputs/ | head -20
    else
      print_warning "(directory not found)"
    fi
    echo ""

    echo "accessibility-service/build/outputs/apk/ directory:"
    if [ -d "accessibility-service/build/outputs/apk" ]; then
      ls -la accessibility-service/build/outputs/apk/ | head -20
    else
      print_warning "(directory not found)"
    fi
    echo ""

    echo "accessibility-service/build/outputs/apk/debug/ directory:"
    if [ -d "accessibility-service/build/outputs/apk/debug" ]; then
      ls -la accessibility-service/build/outputs/apk/debug/ | head -20
    else
      print_warning "(directory not found)"
    fi
    echo ""

    echo "Parent directory of APK: $(dirname "$APK_PATH")"
    if [ -d "$(dirname "$APK_PATH")" ]; then
      ls -la "$(dirname "$APK_PATH")" | head -20
    else
      print_warning "(directory not found)"
    fi
    echo ""

    print_error "Cannot proceed without APK file"
    exit 1
  fi

  print_success "APK file found at $APK_PATH"
  echo ""

  echo "APK file details:"
  ls -lh "$APK_PATH"
  file "$APK_PATH"
  echo ""

  echo "Installing accessibility service APK..."

  # Try to install with -r (replace) first
  # This should work now that we have a shared debug keystore
  echo "Running: adb install -r '$APK_PATH'"
  echo ""

  set +e
  install_output=$(adb install -r "$APK_PATH" 2>&1)
  install_exit=$?
  set -e

  echo "$install_output"

  if [ $install_exit -eq 0 ]; then
    print_success "APK installed successfully (replaced existing)"
  else
    # Check if failure was due to signature mismatch
    if echo "$install_output" | grep -q "INSTALL_FAILED_UPDATE_INCOMPATIBLE"; then
      print_warning "Signature mismatch detected - uninstalling old version and retrying"
      echo ""

      PACKAGE_NAME="dev.jasonpearson.automobile.accessibilityservice"
      echo "Uninstalling existing package..."
      if adb uninstall "$PACKAGE_NAME"; then
        print_success "Old package uninstalled"
      else
        print_warning "Uninstall failed, but proceeding with fresh install"
      fi
      echo ""

      echo "Running: adb install '$APK_PATH'"
      if adb install "$APK_PATH"; then
        print_success "APK installed successfully (clean install)"
      else
        APK_INSTALL_EXIT=$?
        print_error "APK installation failed with exit code $APK_INSTALL_EXIT"
        exit "$APK_INSTALL_EXIT"
      fi
    else
      # Other failure - fail immediately
      print_error "APK installation failed with exit code $install_exit"
      exit "$install_exit"
    fi
  fi
fi

echo ""

print_section "DAEMON WARM-UP"

echo "Starting AutoMobile daemon to avoid first-test timeout..."
echo "This ensures the daemon is fully initialized before tests run."
echo ""

# Go to project root to access the built auto-mobile CLI
cd ..

# Build the TypeScript project if dist doesn't exist
if [ ! -f "dist/src/index.js" ]; then
  echo "Building auto-mobile..."
  bun run build
fi

# Warm up the daemon by calling daemon_available_devices
# This starts the daemon, initializes device pool, and waits for devices to be discovered
# The device pool initialization is async, so we need to wait until devices are actually available
echo "Warming up daemon with device check..."
MAX_RETRIES=30
RETRY_DELAY=2
DAEMON_READY=false

for i in $(seq 1 $MAX_RETRIES); do
  echo "Attempt $i/$MAX_RETRIES: Checking daemon and device pool..."

  # Call daemon_available_devices and capture output (no platform param - it's daemon-level)
  RESULT=$(bun dist/src/index.js --cli daemon_available_devices 2>&1) || true
  echo "$RESULT"

  # Check if we have at least 1 available device (device pool is initialized)
  if echo "$RESULT" | grep -q '"availableDevices":[^0]'; then
    print_success "Daemon is ready and devices are available"
    DAEMON_READY=true
    break
  elif echo "$RESULT" | grep -q '"availableDevices":0'; then
    echo "Device pool not yet initialized (0 devices), waiting ${RETRY_DELAY}s..."
    sleep $RETRY_DELAY
  else
    echo "Daemon not ready yet, waiting ${RETRY_DELAY}s..."
    sleep $RETRY_DELAY
  fi
done

if [ "$DAEMON_READY" = false ]; then
  print_warning "Daemon warm-up: No devices found after $MAX_RETRIES attempts, proceeding anyway..."
fi

# Return to android directory for test execution
cd android

echo ""

print_section "RUNNING TEST SCRIPT"

echo "Working directory: $(pwd)"
echo "About to execute: $TEST_SCRIPT"
echo ""
echo "Retry configuration:"
echo "  Max attempts: ${RETRY_MAX_ATTEMPTS:-3}"
echo "  Initial delay: ${RETRY_INITIAL_DELAY:-10}s (doubles on each retry)"
echo "  Retryable errors: 403, timeout, connection issues"
echo ""

# Use retry_with_backoff to handle transient CI failures (Maven 403, network issues)
# The function will retry up to 3 times with exponential backoff for known transient errors
# but will fail immediately for actual test failures or code issues
retry_with_backoff eval "$TEST_SCRIPT"
