#!/bin/bash
#
# XCTestService Create IPA Script
# Builds XCTestService and packages it as a distributable ZIP (named XCTestService.ipa)
#
# Usage:
#   ./scripts/ios/xctestservice-create-ipa.sh [--output <path>]
#
# Options:
#   --output <path>   Output path for the IPA file (default: ./XCTestService.ipa)
#
# Environment Variables:
#   GITHUB_OUTPUT   If set, outputs ipa_path and ipa_sha256 for GitHub Actions
#
# Outputs:
#   ipa_path    - Path to the generated IPA file
#   ipa_sha256  - SHA256 checksum of the IPA file

set -euo pipefail

# Parse arguments
OUTPUT_PATH="./XCTestService.ipa"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --output)
            OUTPUT_PATH="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Resolve to absolute path (create parent directory if needed)
OUTPUT_DIR="$(dirname "$OUTPUT_PATH")"
mkdir -p "$OUTPUT_DIR"
OUTPUT_PATH="$(cd "$OUTPUT_DIR" && pwd)/$(basename "$OUTPUT_PATH")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
XCTESTSERVICE_DIR="${PROJECT_ROOT}/ios/XCTestService"
XCODEPROJ="${XCTESTSERVICE_DIR}/XCTestService.xcodeproj"

# Use a temporary derived data path for clean builds
DERIVED_DATA="$(mktemp -d)/automobile-xctestservice"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  XCTestService Create IPA${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Check prerequisites
if ! command -v xcodebuild &> /dev/null; then
    echo -e "${RED}Error: xcodebuild not found. Please install Xcode.${NC}"
    exit 1
fi

if ! command -v xcodegen &> /dev/null; then
    echo -e "${YELLOW}Warning: xcodegen not found. Attempting to install via brew...${NC}"
    if command -v brew &> /dev/null; then
        brew install xcodegen
    else
        echo -e "${RED}Error: xcodegen not found and brew not available.${NC}"
        echo -e "${RED}Please install xcodegen: brew install xcodegen${NC}"
        exit 1
    fi
fi

XCODE_VERSION=$(xcodebuild -version)
XCODE_VERSION=${XCODE_VERSION%%$'\n'*}
echo -e "${BLUE}Xcode version:${NC} ${XCODE_VERSION}"
echo -e "${BLUE}Derived data:${NC} ${DERIVED_DATA}"
echo -e "${BLUE}Output path:${NC} ${OUTPUT_PATH}"
echo ""

# Generate Xcode project if needed
if [ ! -d "${XCODEPROJ}" ]; then
    echo -e "${BLUE}Generating Xcode project...${NC}"
    cd "${XCTESTSERVICE_DIR}"
    xcodegen generate
    cd "${PROJECT_ROOT}"
fi

# Build for testing
echo -e "${BLUE}Building XCTestService for testing...${NC}"
echo ""

BUILD_START=$(date +%s)

xcodebuild build-for-testing \
    -project "${XCODEPROJ}" \
    -scheme "XCTestServiceApp" \
    -destination 'generic/platform=iOS Simulator' \
    -derivedDataPath "${DERIVED_DATA}" \
    -configuration Debug \
    CODE_SIGN_IDENTITY="-" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO \
    | xcpretty --color 2>/dev/null || true

BUILD_END=$(date +%s)
BUILD_DURATION=$((BUILD_END - BUILD_START))

# Verify build products
PRODUCTS_DIR="${DERIVED_DATA}/Build/Products"
SIM_DIR="${PRODUCTS_DIR}/Debug-iphonesimulator"

echo ""
echo -e "${BLUE}Verifying build products...${NC}"

XCTESTRUN_FILE=$(find "${PRODUCTS_DIR}" -name "*.xctestrun" -type f 2>/dev/null | head -1)

if [ -z "${XCTESTRUN_FILE}" ]; then
    echo -e "${RED}Error: No .xctestrun file found in ${PRODUCTS_DIR}${NC}"
    exit 1
fi

REQUIRED_ARTIFACTS=(
    "${SIM_DIR}/XCTestServiceApp.app"
    "${SIM_DIR}/XCTestServiceUITests-Runner.app"
    "${SIM_DIR}/XCTestServiceTests.xctest"
)

ALL_FOUND=true
for artifact in "${REQUIRED_ARTIFACTS[@]}"; do
    if [ -e "${artifact}" ]; then
        echo -e "  ${GREEN}✓${NC} $(basename "${artifact}")"
    else
        echo -e "  ${RED}✗${NC} $(basename "${artifact}") - MISSING"
        ALL_FOUND=false
    fi
done

echo -e "  ${GREEN}✓${NC} $(basename "${XCTESTRUN_FILE}")"

if [ "${ALL_FOUND}" = false ]; then
    echo ""
    echo -e "${RED}Error: Some required artifacts are missing${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Build completed in ${BUILD_DURATION}s${NC}"

# Create ZIP (named as .ipa)
echo ""
echo -e "${BLUE}Creating IPA archive...${NC}"

# Ensure output directory exists
mkdir -p "$(dirname "${OUTPUT_PATH}")"

# Remove existing output file if present
rm -f "${OUTPUT_PATH}"

# Create ZIP from the Build/Products directory
cd "${DERIVED_DATA}"
zip -r "${OUTPUT_PATH}" Build/Products/
cd "${PROJECT_ROOT}"

# Compute SHA256 of IPA
IPA_SHA256=$(shasum -a 256 "${OUTPUT_PATH}" | cut -d' ' -f1)
IPA_SIZE=$(stat -f%z "${OUTPUT_PATH}" 2>/dev/null || stat -c%s "${OUTPUT_PATH}" 2>/dev/null)

# Compute SHA256 of runner binary
RUNNER_BINARY="${SIM_DIR}/XCTestServiceUITests-Runner.app/XCTestServiceUITests-Runner"
RUNNER_SHA256=$(shasum -a 256 "${RUNNER_BINARY}" | cut -d' ' -f1)

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  IPA Summary${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "  ${BLUE}Path:${NC}          ${OUTPUT_PATH}"
echo -e "  ${BLUE}Size:${NC}          ${IPA_SIZE} bytes"
echo -e "  ${BLUE}SHA256:${NC}        ${IPA_SHA256}"
echo -e "  ${BLUE}Runner SHA256:${NC} ${RUNNER_SHA256}"
echo ""

# Output for scripts and CI
echo "ipa_path=${OUTPUT_PATH}"
echo "ipa_sha256=${IPA_SHA256}"
echo "runner_sha256=${RUNNER_SHA256}"

# Output for GitHub Actions
if [ -n "${GITHUB_OUTPUT:-}" ]; then
    {
        echo "ipa_path=${OUTPUT_PATH}"
        echo "ipa_sha256=${IPA_SHA256}"
        echo "runner_sha256=${RUNNER_SHA256}"
    } >> "${GITHUB_OUTPUT}"
fi

# Clean up temporary derived data
rm -rf "${DERIVED_DATA}"
