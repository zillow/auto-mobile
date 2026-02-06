#!/bin/bash
#
# iOS Simulator Setup Script
# Ensures an iOS Simulator runtime is available for the current Xcode version.
#
# This script is designed for CI environments (GitHub Actions) where:
# - Xcode is pre-installed but simulator runtimes may be missing or mismatched
# - The runner may have different simulator runtimes than what Xcode expects
# - Downloads may be required to get a compatible runtime
#
# Usage:
#   ./setup-ios-simulator.sh [options]
#
# Options:
#   --dry-run          Show what would be done without making changes
#   --force-download   Force download even if a runtime is available
#   --skip-download    Don't download missing runtimes, just report status
#   --verbose          Show detailed output
#   --min-ios VERSION  Minimum iOS version required (default: from project)
#
# Environment Variables:
#   IOS_SIMULATOR_DESTINATION  Set to override the auto-detected destination
#

set -euo pipefail

# Options
DRY_RUN=false
FORCE_DOWNLOAD=false
SKIP_DOWNLOAD=false
VERBOSE=false
MIN_IOS_VERSION=""

for arg in "$@"; do
    case "$arg" in
        --dry-run)
            DRY_RUN=true
            ;;
        --force-download)
            FORCE_DOWNLOAD=true
            ;;
        --skip-download)
            SKIP_DOWNLOAD=true
            ;;
        --verbose)
            VERBOSE=true
            ;;
        --min-ios=*)
            MIN_IOS_VERSION="${arg#*=}"
            ;;
        *)
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}✓${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1" >&2
}

log_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

log_debug() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${CYAN}→${NC} $1" >&2
    fi
}

run_cmd() {
    if [ "$DRY_RUN" = true ]; then
        echo -e "  ${YELLOW}↳${NC} (dry-run) $*" >&2
        return 0
    fi
    "$@"
}

echo -e "${CYAN}========================================${NC}" >&2
echo -e "${CYAN}  iOS Simulator Setup${NC}" >&2
echo -e "${CYAN}========================================${NC}" >&2
echo "" >&2

# Check required tools
if ! command -v rg &> /dev/null; then
    log_error "ripgrep (rg) not found. Install with: brew install ripgrep"
    exit 1
fi

if ! command -v xcodebuild &> /dev/null; then
    log_error "xcodebuild not found. Please install Xcode."
    exit 1
fi

# Get Xcode version info
XCODE_VERSION_FULL=$(xcodebuild -version)
XCODE_VERSION=$(echo "$XCODE_VERSION_FULL" | head -1 | sed 's/Xcode //')
XCODE_BUILD=$(echo "$XCODE_VERSION_FULL" | tail -1 | sed 's/Build version //')
XCODE_PATH=$(xcode-select -p)

log_info "Xcode version: ${XCODE_VERSION} (${XCODE_BUILD})"
log_info "Xcode path: ${XCODE_PATH}"

# Detect the iOS Simulator SDK version bundled with this Xcode.
# This tells us the maximum iOS runtime version this Xcode can use.
# On CI runners with multiple Xcode versions, runtimes from newer Xcode
# installations are visible but unusable by older Xcode versions.
MAX_IOS_SDK_VERSION=$(xcodebuild -showsdks 2>/dev/null | sed -n 's/.*-sdk iphonesimulator\([0-9.]*\)/\1/p' | sort -V | tail -1)
if [ -n "$MAX_IOS_SDK_VERSION" ]; then
    log_info "iOS Simulator SDK: ${MAX_IOS_SDK_VERSION} (max runtime version)"
else
    log_error "Could not detect iOS Simulator SDK version (no iphonesimulator SDK found)"
    log_error "Ensure Xcode is installed with iOS Simulator support"
    exit 1
fi
echo "" >&2

# Script directory for finding project files
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IOS_DIR="${PROJECT_ROOT}/ios"

# Detect minimum iOS version from project files if not specified
detect_min_ios_version() {
    local min_version="15.0"  # Default fallback

    # Use ripgrep to find all iOS deployment targets in one pass
    # Pattern matches: iOS: "16.0" or iOS: 16.0
    local versions
    versions=$(rg -o --no-filename 'iOS:\s*"?([0-9.]+)"?' -r '$1' "${IOS_DIR}"/*/project.yml 2>/dev/null || echo "")
    if [ -n "$versions" ]; then
        # Get the highest version found
        min_version=$(echo "$versions" | sort -V | tail -1)
        log_debug "Found deployment targets via ripgrep, highest: ${min_version}"
    fi

    echo "$min_version"
}

if [ -z "$MIN_IOS_VERSION" ]; then
    MIN_IOS_VERSION=$(detect_min_ios_version)
fi
log_info "Minimum iOS deployment target: ${MIN_IOS_VERSION}"

# List available simulator runtimes
echo "" >&2
echo -e "${BLUE}Available Simulator Runtimes:${NC}" >&2
RUNTIMES_OUTPUT=$(xcrun simctl list runtimes 2>/dev/null || echo "")
if [ -z "$RUNTIMES_OUTPUT" ]; then
    log_warn "No simulator runtimes found"
else
    echo "$RUNTIMES_OUTPUT" | grep -E "iOS|watchOS|tvOS|visionOS" | head -10 | while read -r line; do
        echo "  $line" >&2
    done
fi

# Parse available iOS runtimes and find the best one
IOS_RUNTIMES=$(echo "$RUNTIMES_OUTPUT" | grep "^iOS" || echo "")
log_debug "iOS runtimes: $IOS_RUNTIMES"

# Extract version numbers from runtimes (e.g., "iOS 18.5" -> "18.5")
get_available_ios_versions() {
    echo "$IOS_RUNTIMES" | sed -n 's/^iOS \([0-9.]*\).*/\1/p' | sort -V
}

# Check if a version meets the minimum requirement
version_gte() {
    local version=$1
    local min=$2
    [ "$(printf '%s\n' "$min" "$version" | sort -V | head -1)" = "$min" ]
}

# Find the best available iOS runtime (highest version >= minimum, <= max SDK)
find_best_ios_runtime() {
    local min_version=$1
    local max_version=$2
    local best_version=""

    while IFS= read -r version; do
        if [ -n "$version" ] && version_gte "$version" "$min_version"; then
            # Skip runtimes newer than what this Xcode supports
            if ! version_gte "$max_version" "$version"; then
                log_debug "Skipping iOS ${version} (exceeds SDK ${max_version})"
                continue
            fi
            best_version="$version"
        fi
    done < <(get_available_ios_versions)

    echo "$best_version"
}

BEST_IOS_VERSION=$(find_best_ios_runtime "$MIN_IOS_VERSION" "$MAX_IOS_SDK_VERSION")

if [ -n "$BEST_IOS_VERSION" ]; then
    log_success "Found compatible iOS runtime: iOS ${BEST_IOS_VERSION}"
else
    log_warn "No compatible iOS runtime found (need >= ${MIN_IOS_VERSION}, <= ${MAX_IOS_SDK_VERSION})"
fi
echo "" >&2

# Find available simulator devices for the best runtime
find_simulator_device() {
    local ios_version=$1

    if [ -z "$ios_version" ]; then
        echo ""
        return
    fi

    # Get devices for this iOS version
    local devices
    devices=$(xcrun simctl list devices "iOS ${ios_version}" 2>/dev/null | grep -E "iPhone|iPad" | grep -v "unavailable" | head -5 || echo "")

    if [ -z "$devices" ]; then
        log_debug "No devices found for iOS ${ios_version}"
        echo ""
        return
    fi

    log_debug "Available devices for iOS ${ios_version}:"
    log_debug "$devices"

    # Prefer iPhone 16, then iPhone 15, then any iPhone
    local device_name=""
    if echo "$devices" | grep -q "iPhone 16[^0-9]"; then
        device_name=$(echo "$devices" | grep "iPhone 16[^0-9]" | head -1 | sed 's/^[[:space:]]*//' | cut -d'(' -f1 | sed 's/[[:space:]]*$//')
    elif echo "$devices" | grep -q "iPhone 15[^0-9]"; then
        device_name=$(echo "$devices" | grep "iPhone 15[^0-9]" | head -1 | sed 's/^[[:space:]]*//' | cut -d'(' -f1 | sed 's/[[:space:]]*$//')
    elif echo "$devices" | grep -q "iPhone"; then
        device_name=$(echo "$devices" | grep "iPhone" | head -1 | sed 's/^[[:space:]]*//' | cut -d'(' -f1 | sed 's/[[:space:]]*$//')
    fi

    echo "$device_name"
}

SIMULATOR_DEVICE=$(find_simulator_device "$BEST_IOS_VERSION")

# Build the destination string
build_destination() {
    local ios_version=$1
    local device_name=$2

    if [ -n "$device_name" ] && [ -n "$ios_version" ]; then
        echo "platform=iOS Simulator,name=${device_name},OS=${ios_version}"
    elif [ -n "$ios_version" ]; then
        echo "platform=iOS Simulator,OS=${ios_version}"
    else
        echo "generic/platform=iOS Simulator"
    fi
}

# Check if we need to download
NEEDS_DOWNLOAD=false

if [ -z "$BEST_IOS_VERSION" ]; then
    NEEDS_DOWNLOAD=true
fi

if [ "$FORCE_DOWNLOAD" = true ]; then
    log_info "Force download flag set"
    NEEDS_DOWNLOAD=true
fi

# Handle download if needed
if [ "$NEEDS_DOWNLOAD" = true ]; then
    if [ "$SKIP_DOWNLOAD" = true ]; then
        log_warn "Download skipped (--skip-download flag)"
        log_error "No compatible iOS Simulator runtime available"
        exit 1
    fi

    echo "" >&2
    log_info "Downloading iOS platform for Xcode ${XCODE_VERSION}..."
    log_info "This may take several minutes..."
    echo "" >&2

    DOWNLOAD_START=$(date +%s)

    if [ "$DRY_RUN" = true ]; then
        run_cmd xcodebuild -downloadPlatform iOS
        DOWNLOAD_EXIT_CODE=0
    else
        set +e
        xcodebuild -downloadPlatform iOS 2>&1 | while IFS= read -r line; do
            if [ "$VERBOSE" = true ]; then
                echo "  $line" >&2
            else
                if echo "$line" | grep -qE "Downloading|Installing|Progress|%"; then
                    printf "\r  %s" "$line" >&2
                fi
            fi
        done
        DOWNLOAD_EXIT_CODE=${PIPESTATUS[0]}
        set -e
        echo "" >&2
    fi

    DOWNLOAD_END=$(date +%s)
    DOWNLOAD_DURATION=$((DOWNLOAD_END - DOWNLOAD_START))

    if [ "$DOWNLOAD_EXIT_CODE" -ne 0 ]; then
        log_error "Failed to download iOS platform (exit code: ${DOWNLOAD_EXIT_CODE})"
        exit 1
    fi

    log_success "Download completed in ${DOWNLOAD_DURATION}s"
    echo "" >&2

    # Refresh runtime list
    sleep 2
    RUNTIMES_OUTPUT=$(xcrun simctl list runtimes 2>/dev/null || echo "")
    IOS_RUNTIMES=$(echo "$RUNTIMES_OUTPUT" | grep "^iOS" || echo "")
    BEST_IOS_VERSION=$(find_best_ios_runtime "$MIN_IOS_VERSION" "$MAX_IOS_SDK_VERSION")
    SIMULATOR_DEVICE=$(find_simulator_device "$BEST_IOS_VERSION")
fi

# Final destination
DESTINATION=$(build_destination "$BEST_IOS_VERSION" "$SIMULATOR_DEVICE")

# Export for use by other scripts
export IOS_SIMULATOR_RUNTIME="$BEST_IOS_VERSION"
export IOS_SIMULATOR_DEVICE="$SIMULATOR_DEVICE"
export IOS_SIMULATOR_DESTINATION="$DESTINATION"

# Write to GitHub Actions output if available
if [ -n "${GITHUB_OUTPUT:-}" ]; then
    {
        echo "ios-runtime=${BEST_IOS_VERSION}"
        echo "ios-device=${SIMULATOR_DEVICE}"
        echo "ios-destination=${DESTINATION}"
    } >> "$GITHUB_OUTPUT"
fi

# Also write to a file for non-GitHub environments
DEST_FILE="${PROJECT_ROOT}/.ios-simulator-destination"
if [ "$DRY_RUN" = false ]; then
    cat > "$DEST_FILE" << EOF
# Auto-generated by setup-ios-simulator.sh
# Source this file or read these values for xcodebuild commands
IOS_SIMULATOR_RUNTIME="${BEST_IOS_VERSION}"
IOS_SIMULATOR_DEVICE="${SIMULATOR_DEVICE}"
IOS_SIMULATOR_DESTINATION="${DESTINATION}"
EOF
    log_debug "Wrote destination config to ${DEST_FILE}"
fi

# Summary
echo "" >&2
echo -e "${CYAN}========================================${NC}" >&2
echo -e "${CYAN}  Setup Complete${NC}" >&2
echo -e "${CYAN}========================================${NC}" >&2
echo "" >&2
echo "  Xcode version:     ${XCODE_VERSION}" >&2
echo "  Min iOS target:    ${MIN_IOS_VERSION}" >&2
echo "  iOS runtime:       ${BEST_IOS_VERSION:-none}" >&2
echo "  Simulator device:  ${SIMULATOR_DEVICE:-auto}" >&2
echo "  Destination:       ${DESTINATION}" >&2
echo "" >&2

if [ -n "$BEST_IOS_VERSION" ]; then
    log_success "iOS Simulator ready"
    echo "" >&2
    echo -e "${BLUE}Use this destination in xcodebuild:${NC}" >&2
    echo "  -destination '${DESTINATION}'" >&2
    exit 0
else
    log_error "No compatible iOS Simulator runtime available"
    exit 1
fi
