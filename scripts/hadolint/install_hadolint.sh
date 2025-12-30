#!/usr/bin/env bash

set -euo pipefail

HADOLINT_VERSION="2.12.0" # Change this to the desired version

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
        CYGWIN*|MINGW*|MSYS*)
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
        x86_64|amd64)
            echo "x86_64"
            ;;
        aarch64|arm64)
            echo "arm64"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install hadolint on macOS
install_macos() {
    echo -e "${YELLOW}Installing hadolint on macOS...${NC}"

    if command_exists brew; then
        echo -e "${GREEN}Using Homebrew to install hadolint${NC}"
        brew install hadolint
        return $?
    else
        echo -e "${YELLOW}Homebrew not found. Falling back to manual installation...${NC}"
        install_manual
        return $?
    fi
}

# Install hadolint on Linux
install_linux() {
    echo -e "${YELLOW}Installing hadolint on Linux...${NC}"

    # Check for package managers in order of preference
    if command_exists apt-get; then
        echo -e "${YELLOW}APT package manager detected, but hadolint may not be available in default repositories.${NC}"
        echo -e "${YELLOW}Falling back to manual installation...${NC}"
        install_manual
        return $?
    elif command_exists yum; then
        echo -e "${YELLOW}YUM package manager detected, but hadolint may not be available in default repositories.${NC}"
        echo -e "${YELLOW}Falling back to manual installation...${NC}"
        install_manual
        return $?
    elif command_exists dnf; then
        echo -e "${YELLOW}DNF package manager detected, but hadolint may not be available in default repositories.${NC}"
        echo -e "${YELLOW}Falling back to manual installation...${NC}"
        install_manual
        return $?
    elif command_exists pacman; then
        echo -e "${YELLOW}Pacman package manager detected, but hadolint may not be available in default repositories.${NC}"
        echo -e "${YELLOW}Falling back to manual installation...${NC}"
        install_manual
        return $?
    else
        echo -e "${YELLOW}No supported package manager found. Using manual installation...${NC}"
        install_manual
        return $?
    fi
}

# Install hadolint on Windows
install_windows() {
    echo -e "${YELLOW}Installing hadolint on Windows...${NC}"

    if command_exists scoop; then
        echo -e "${GREEN}Using Scoop to install hadolint${NC}"
        scoop install hadolint
        return $?
    elif command_exists choco; then
        echo -e "${YELLOW}Chocolatey detected, but hadolint may not be available. Falling back to manual installation...${NC}"
        install_manual
        return $?
    elif command_exists winget; then
        echo -e "${YELLOW}Winget detected, but hadolint may not be available. Falling back to manual installation...${NC}"
        install_manual
        return $?
    else
        echo -e "${YELLOW}No supported package manager found. Using manual installation...${NC}"
        echo -e "${YELLOW}Consider installing Scoop for easier package management: https://scoop.sh/${NC}"
        install_manual
        return $?
    fi
}

# Manual installation by downloading binary
install_manual() {
    echo -e "${YELLOW}Installing hadolint manually...${NC}"

    local os
    os=$(detect_os)
    local arch
    arch=$(detect_arch)

    # Map OS and architecture to GitHub release naming
    case "$os" in
        macos)
            os_name="Darwin"
            ;;
        linux)
            os_name="Linux"
            ;;
        windows)
            os_name="Windows"
            ;;
        *)
            echo -e "${RED}Unsupported operating system: $os${NC}"
            return 1
            ;;
    esac

    case "$arch" in
        x86_64)
            arch_name="x86_64"
            ;;
        arm64)
            arch_name="arm64"
            ;;
        *)
            echo -e "${RED}Unsupported architecture: $arch${NC}"
            return 1
            ;;
    esac

    # Create installation directory
    install_dir="$HOME/.local/bin"
    mkdir -p "$install_dir"

    # Download URL
    binary_name="hadolint-${os_name}-${arch_name}"
    download_url="https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}/${binary_name}"

    echo -e "${GREEN}Downloading hadolint binary from GitHub releases...${NC}"
    echo "URL: $download_url"

    # Create temporary directory
    temp_dir=$(mktemp -d)
    trap 'rm -rf "$temp_dir"' EXIT

    # Download the binary
    if command_exists curl; then
        if ! curl -sL -o "$temp_dir/hadolint" "$download_url"; then
            echo -e "${RED}Failed to download hadolint binary${NC}"
            return 1
        fi
    elif command_exists wget; then
        if ! wget -q -O "$temp_dir/hadolint" "$download_url"; then
            echo -e "${RED}Failed to download hadolint binary${NC}"
            return 1
        fi
    else
        echo -e "${RED}Neither curl nor wget found. Please install one of them or download manually from:${NC}"
        echo "$download_url"
        return 1
    fi

    # Make executable and move to install directory
    chmod +x "$temp_dir/hadolint"
    mv "$temp_dir/hadolint" "$install_dir/hadolint"

    echo -e "${GREEN}hadolint installed successfully to $install_dir${NC}"
    echo -e "${YELLOW}Make sure $install_dir is in your PATH environment variable.${NC}"

    # Check if directory is in PATH
    if [[ ":$PATH:" != *":$install_dir:"* ]]; then
        echo -e "${YELLOW}To add $install_dir to your PATH, add this line to your shell configuration:${NC}"
        echo "export PATH=\"\$PATH:$install_dir\""
    fi

    return 0
}

# Verify installation
verify_installation() {
    echo -e "${YELLOW}Verifying hadolint installation...${NC}"

    if command_exists hadolint; then
        echo -e "${GREEN}hadolint is installed and available in PATH${NC}"
        hadolint --version
        return 0
    else
        echo -e "${RED}hadolint is not available in PATH${NC}"
        return 1
    fi
}

# Main installation function
main() {
    echo -e "${GREEN}Hadolint Installation Script${NC}"
    echo -e "${GREEN}============================${NC}"

    # Check if hadolint is already installed
    if command_exists hadolint; then
        echo -e "${GREEN}hadolint is already installed${NC}"
        hadolint --version
        echo -e "${YELLOW}To reinstall, remove the existing installation first${NC}"
        exit 0
    fi

    local os
    os=$(detect_os)
    local arch
    arch=$(detect_arch)
    echo -e "${YELLOW}Detected OS: $os${NC}"
    echo -e "${YELLOW}Detected Architecture: $arch${NC}"

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
            echo -e "${YELLOW}Falling back to manual installation...${NC}"
            install_manual
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
