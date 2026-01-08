#!/usr/bin/env bash

SHFMT_VERSION="3.10.0" # Change this to the desired version

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect operating system
detect_os() {
  case "$(uname -s)" in
    Darwin*)
      echo "macos"
      ;;
    Linux*)
      echo "linux"
      ;;
    CYGWIN* | MINGW* | MSYS*)
      echo "windows"
      ;;
    *)
      echo "unknown"
      ;;
  esac
}

# Detect architecture
detect_arch() {
  case "$(uname -m)" in
    x86_64 | amd64)
      echo "amd64"
      ;;
    arm64 | aarch64)
      echo "arm64"
      ;;
    armv7l)
      echo "arm"
      ;;
    i386 | i686)
      echo "386"
      ;;
    *)
      echo "unknown"
      ;;
  esac
}

# Check if command exists
command_exists() {
  command -v "$1" > /dev/null 2>&1
}

# Install shfmt on macOS
install_macos() {
  echo -e "${YELLOW}Installing shfmt on macOS...${NC}"

  if command_exists brew; then
    echo -e "${GREEN}Using Homebrew to install shfmt${NC}"
    brew install shfmt
    return $?
  else
    echo -e "${YELLOW}Homebrew not found. Falling back to binary installation...${NC}"
    install_binary "darwin"
    return $?
  fi
}

# Install shfmt on Linux
install_linux() {
  echo -e "${YELLOW}Installing shfmt on Linux...${NC}"
  install_binary "linux"
  return $?
}

# Install shfmt on Windows
install_windows() {
  echo -e "${YELLOW}Installing shfmt on Windows...${NC}"

  if command_exists scoop; then
    echo -e "${GREEN}Using Scoop to install shfmt${NC}"
    scoop install shfmt
    return $?
  elif command_exists choco; then
    echo -e "${GREEN}Using Chocolatey to install shfmt${NC}"
    choco install shfmt
    return $?
  else
    echo -e "${YELLOW}No supported package manager found. Using binary installation...${NC}"
    install_binary "windows"
    return $?
  fi
}

# Install shfmt by downloading binary
install_binary() {
  local os="$1"
  local arch
  arch=$(detect_arch)

  echo -e "${YELLOW}Installing shfmt binary for $os ($arch)...${NC}"

  if [[ "$arch" == "unknown" ]]; then
    echo -e "${RED}Unsupported architecture: $(uname -m)${NC}"
    return 1
  fi

  # Create installation directory
  install_dir="$HOME/.local/bin"
  mkdir -p "$install_dir"

  # Construct download URL
  # Format: https://github.com/mvdan/sh/releases/download/v3.10.0/shfmt_v3.10.0_darwin_amd64
  local binary_name="shfmt_v${SHFMT_VERSION}_${os}_${arch}"
  if [[ "$os" == "windows" ]]; then
    binary_name="${binary_name}.exe"
  fi

  local download_url="https://github.com/mvdan/sh/releases/download/v${SHFMT_VERSION}/${binary_name}"

  echo -e "${GREEN}Downloading shfmt from GitHub releases...${NC}"
  echo -e "${YELLOW}URL: $download_url${NC}"

  local target_file="$install_dir/shfmt"
  if [[ "$os" == "windows" ]]; then
    target_file="${target_file}.exe"
  fi

  if command_exists curl; then
    curl -L -o "$target_file" "$download_url"
  elif command_exists wget; then
    wget -O "$target_file" "$download_url"
  else
    echo -e "${RED}Neither curl nor wget found. Please install one of them or download manually from:${NC}"
    echo "$download_url"
    return 1
  fi

  # Verify the binary was downloaded correctly
  if [[ ! -f "$target_file" ]]; then
    echo -e "${RED}Failed to download shfmt binary${NC}"
    return 1
  fi

  # Make it executable
  chmod +x "$target_file"

  echo -e "${GREEN}shfmt binary installed successfully to $install_dir${NC}"

  # Check if directory is in PATH
  if [[ ":$PATH:" != *":$install_dir:"* ]]; then
    echo -e "${YELLOW}Make sure $install_dir is in your PATH environment variable.${NC}"
    echo -e "${YELLOW}To add $install_dir to your PATH, add this line to your shell configuration:${NC}"
    echo "export PATH=\"\$PATH:$install_dir\""
  fi

  return 0
}

# Verify installation
verify_installation() {
  echo -e "${YELLOW}Verifying shfmt installation...${NC}"

  if command_exists shfmt; then
    echo -e "${GREEN}shfmt is installed and available in PATH${NC}"
    shfmt --version 2> /dev/null || echo -e "${GREEN}shfmt is ready to use${NC}"
    return 0
  else
    echo -e "${RED}shfmt is not available in PATH${NC}"
    return 1
  fi
}

# Main installation function
main() {
  echo -e "${GREEN}shfmt Installation Script${NC}"
  echo -e "${GREEN}========================${NC}"

  os=$(detect_os)
  echo -e "${YELLOW}Detected OS: $os${NC}"

  case $os in
    macos)
      install_macos
      ;;
    linux)
      install_linux
      ;;
    windows)
      install_windows
      ;;
    *)
      echo -e "${RED}Unsupported operating system: $os${NC}"
      exit 1
      ;;
  esac

  install_result=$?

  if [[ $install_result -eq 0 ]]; then
    echo -e "${GREEN}Installation completed successfully!${NC}"
    verify_installation
  else
    echo -e "${RED}Installation failed!${NC}"
    exit 1
  fi
}

# Run main function
main "$@"
