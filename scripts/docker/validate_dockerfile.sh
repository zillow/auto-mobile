#!/usr/bin/env bash
# Validate Dockerfile using hadolint

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if hadolint is installed
if ! command -v hadolint &>/dev/null; then
  echo -e "${YELLOW}hadolint not found. Installing...${NC}"

  # Detect OS and architecture
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)

  case "${ARCH}" in
    x86_64)
      ARCH="x86_64"
      ;;
    aarch64|arm64)
      ARCH="arm64"
      ;;
    *)
      echo -e "${RED}Unsupported architecture: ${ARCH}${NC}"
      exit 1
      ;;
  esac

  HADOLINT_VERSION="2.12.0"
  DOWNLOAD_URL="https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}/hadolint-${OS^}-${ARCH}"

  echo "Downloading hadolint from: ${DOWNLOAD_URL}"

  # Download to temporary location
  TMP_DIR=$(mktemp -d)
  trap 'rm -rf "${TMP_DIR}"' EXIT

  if curl -sL "${DOWNLOAD_URL}" -o "${TMP_DIR}/hadolint"; then
    # Install to user bin
    mkdir -p "${HOME}/bin"
    mv "${TMP_DIR}/hadolint" "${HOME}/bin/hadolint"
    chmod +x "${HOME}/bin/hadolint"

    # Add to PATH if not already there
    if [[ ":${PATH}:" != *":${HOME}/bin:"* ]]; then
      export PATH="${HOME}/bin:${PATH}"
      echo -e "${YELLOW}Added ${HOME}/bin to PATH${NC}"
      echo -e "${YELLOW}Add 'export PATH=\"\${HOME}/bin:\${PATH}\"' to your shell profile${NC}"
    fi

    echo -e "${GREEN}hadolint installed successfully${NC}"
  else
    echo -e "${RED}Failed to download hadolint${NC}"
    exit 1
  fi
fi

# Validate Dockerfile
echo -e "${GREEN}Validating Dockerfile...${NC}"

if hadolint --config .hadolint.yaml Dockerfile; then
  echo -e "${GREEN}✓ Dockerfile validation passed${NC}"
  exit 0
else
  echo -e "${RED}✗ Dockerfile validation failed${NC}"
  exit 1
fi
