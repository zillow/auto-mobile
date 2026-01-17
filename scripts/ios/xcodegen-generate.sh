#!/bin/bash
#
# XcodeGen Project Generation Script
# Generates Xcode projects from project.yml files
#

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
IOS_DIR="${PROJECT_ROOT}/ios"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  XcodeGen Project Generation${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Track overall status
OVERALL_STATUS=0
GENERATED_PROJECTS=()
FAILED_PROJECTS=()

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

print_info() {
    echo -e "  ${BLUE}ℹ${NC} $1"
}

# Check if xcodegen is available
if ! command -v xcodegen &> /dev/null; then
    echo -e "${YELLOW}Warning: xcodegen not found, attempting to install via Homebrew...${NC}"
    if command -v brew &> /dev/null; then
        brew install xcodegen
    else
        echo -e "${RED}Error: Neither xcodegen nor Homebrew is available${NC}"
        echo -e "Install XcodeGen: brew install xcodegen"
        exit 1
    fi
fi

XCODEGEN_VERSION=$(xcodegen --version)
print_info "XcodeGen version: ${XCODEGEN_VERSION}"
echo ""

# Find all project.yml files
echo -e "${BLUE}Searching for project.yml files...${NC}"
PROJECT_YML_FILES=$(find "${IOS_DIR}" -name "project.yml" -type f 2>/dev/null || true)

if [ -z "${PROJECT_YML_FILES}" ]; then
    echo -e "${YELLOW}No project.yml files found in ${IOS_DIR}${NC}"
    exit 0
fi

# Generate projects
for project_yml in ${PROJECT_YML_FILES}; do
    PROJECT_DIR=$(dirname "${project_yml}")
    PROJECT_NAME=$(basename "${PROJECT_DIR}")

    echo -e "  Generating ${PROJECT_NAME}..."

    if (cd "${PROJECT_DIR}" && xcodegen generate 2>&1); then
        print_status 0 "${PROJECT_NAME} project generated"
        GENERATED_PROJECTS+=("${PROJECT_NAME}")
    else
        print_status 1 "${PROJECT_NAME} generation failed"
        FAILED_PROJECTS+=("${PROJECT_NAME}")
    fi
done
echo ""

# Summary
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Generation Summary${NC}"
echo -e "${CYAN}========================================${NC}"

if [ ${#GENERATED_PROJECTS[@]} -gt 0 ]; then
    echo -e "${GREEN}Generated:${NC}"
    for proj in "${GENERATED_PROJECTS[@]}"; do
        echo -e "  ${GREEN}✓${NC} ${proj}"
    done
fi

if [ ${#FAILED_PROJECTS[@]} -gt 0 ]; then
    echo -e "${RED}Failed:${NC}"
    for proj in "${FAILED_PROJECTS[@]}"; do
        echo -e "  ${RED}✗${NC} ${proj}"
    done
fi

echo ""
if [ $OVERALL_STATUS -eq 0 ]; then
    echo -e "${GREEN}All projects generated successfully!${NC}"
else
    echo -e "${RED}Some projects failed to generate!${NC}"
fi

exit $OVERALL_STATUS
