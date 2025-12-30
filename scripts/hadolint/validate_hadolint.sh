#!/usr/bin/env bash

set -euo pipefail

INSTALL_HADOLINT_WHEN_MISSING=${INSTALL_HADOLINT_WHEN_MISSING:-false}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Get project root (parent directory of scripts)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Check for required commands and install missing commands if allowed
echo -e "${YELLOW}Checking for required commands...${NC}"

# Check if hadolint is installed
if ! command_exists hadolint; then
    echo -e "${RED}hadolint is not installed${NC}"
    if [[ "${INSTALL_HADOLINT_WHEN_MISSING}" == "true" ]]; then
        echo -e "${YELLOW}Installing hadolint...${NC}"
        if [[ -f "$PROJECT_ROOT/scripts/hadolint/install_hadolint.sh" ]]; then
            if ! bash "$PROJECT_ROOT/scripts/hadolint/install_hadolint.sh"; then
                echo -e "${RED}Failed to install hadolint${NC}"
                exit 1
            fi
        else
            echo -e "${RED}hadolint installation script not found${NC}"
            exit 1
        fi
    else
        echo -e "${RED}hadolint is required. Set INSTALL_HADOLINT_WHEN_MISSING=true to auto-install or install manually${NC}"
        exit 1
    fi
fi

# Verify hadolint is available
if ! command_exists hadolint; then
    echo -e "${RED}hadolint is still not available after installation attempt${NC}"
    exit 1
fi

echo -e "${GREEN}hadolint is available${NC}"

# Verify hadolint works with --version
echo -e "${YELLOW}Verifying hadolint version...${NC}"
if hadolint --version; then
    echo -e "${GREEN}hadolint version check passed${NC}"
else
    echo -e "${RED}hadolint version check failed${NC}"
    exit 1
fi

# Run hadolint on the Dockerfile as a validation test
echo -e "${YELLOW}Running hadolint on Dockerfile as validation test...${NC}"

# Check if Dockerfile exists
if [[ ! -f "$PROJECT_ROOT/Dockerfile" ]]; then
    echo -e "${YELLOW}No Dockerfile found at $PROJECT_ROOT/Dockerfile${NC}"
    echo -e "${GREEN}Skipping Dockerfile validation test${NC}"
    exit 0
fi

# Check if .hadolint.yaml config exists
config_args=()
if [[ -f "$PROJECT_ROOT/.hadolint.yaml" ]]; then
    config_args=(--config "$PROJECT_ROOT/.hadolint.yaml")
    echo -e "${GREEN}Using hadolint config: $PROJECT_ROOT/.hadolint.yaml${NC}"
fi

# Run hadolint on Dockerfile
hadolint_result=0
if [[ ${#config_args[@]} -gt 0 ]]; then
    hadolint "${config_args[@]}" "$PROJECT_ROOT/Dockerfile" || hadolint_result=$?
else
    hadolint "$PROJECT_ROOT/Dockerfile" || hadolint_result=$?
fi

if [[ $hadolint_result -eq 0 ]]; then
    echo -e "${GREEN}Dockerfile validation passed${NC}"
    echo -e "${GREEN}hadolint is correctly installed and working${NC}"
    exit 0
else
    echo -e "${RED}Dockerfile validation failed${NC}"
    echo -e "${YELLOW}Note: This may indicate linting issues in the Dockerfile, not a problem with hadolint itself${NC}"
    exit 1
fi
