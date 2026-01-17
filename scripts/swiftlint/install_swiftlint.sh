#!/usr/bin/env bash

SWIFTLINT_VERSION="0.57.0" # Change this to the desired version

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
        *)
            echo "unknown"
            ;;
    esac
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install SwiftLint on macOS
install_macos() {
    echo -e "${YELLOW}Installing SwiftLint on macOS...${NC}"

    if command_exists brew; then
        echo -e "${GREEN}Using Homebrew to install SwiftLint${NC}"
        brew install swiftlint
        return $?
    else
        echo -e "${YELLOW}Homebrew not found. Attempting manual installation...${NC}"
        install_manual
        return $?
    fi
}

# Install SwiftLint on Linux
install_linux() {
    echo -e "${YELLOW}Installing SwiftLint on Linux...${NC}"
    echo -e "${YELLOW}SwiftLint requires manual installation on Linux...${NC}"
    install_manual
    return $?
}

# Manual installation by downloading binary
install_manual() {
    echo -e "${YELLOW}Installing SwiftLint manually...${NC}"

    # Create installation directory
    install_dir="$HOME/.local/bin"
    mkdir -p "$install_dir"

    os=$(detect_os)

    if [[ "$os" == "macos" ]]; then
        # Download from GitHub releases
        download_url="https://github.com/realm/SwiftLint/releases/download/${SWIFTLINT_VERSION}/portable_swiftlint.zip"
        temp_dir=$(mktemp -d)
        trap 'rm -rf "$temp_dir"' EXIT

        echo -e "${GREEN}Downloading SwiftLint from GitHub...${NC}"

        if command_exists curl; then
            curl -L -o "$temp_dir/swiftlint.zip" "$download_url"
        elif command_exists wget; then
            wget -O "$temp_dir/swiftlint.zip" "$download_url"
        else
            echo -e "${RED}Neither curl nor wget found. Please install one of them.${NC}"
            return 1
        fi

        # Extract and install
        unzip -o "$temp_dir/swiftlint.zip" -d "$temp_dir"
        mv "$temp_dir/swiftlint" "$install_dir/swiftlint"
        chmod +x "$install_dir/swiftlint"

        echo -e "${GREEN}SwiftLint installed successfully to $install_dir${NC}"
    else
        # For Linux, need to build from source
        echo -e "${YELLOW}On Linux, SwiftLint needs to be built from source.${NC}"
        echo -e "${YELLOW}Please install Swift first, then run:${NC}"
        echo "git clone https://github.com/realm/SwiftLint.git"
        echo "cd SwiftLint"
        echo "swift build -c release"
        echo "cp .build/release/swiftlint $install_dir/"
        return 1
    fi

    # Check if directory is in PATH
    if [[ ":$PATH:" != *":$install_dir:"* ]]; then
        echo -e "${YELLOW}To add $install_dir to your PATH, add this line to your shell configuration:${NC}"
        echo "export PATH=\"\$PATH:$install_dir\""
    fi

    return 0
}

# Verify installation
verify_installation() {
    echo -e "${YELLOW}Verifying SwiftLint installation...${NC}"

    if command_exists swiftlint; then
        echo -e "${GREEN}SwiftLint is installed and available in PATH${NC}"
        swiftlint version 2>/dev/null || echo -e "${GREEN}SwiftLint is ready to use${NC}"
        return 0
    else
        echo -e "${RED}SwiftLint is not available in PATH${NC}"
        return 1
    fi
}

# Main installation function
main() {
    echo -e "${GREEN}SwiftLint Installation Script${NC}"
    echo -e "${GREEN}==============================${NC}"

    os=$(detect_os)
    echo -e "${YELLOW}Detected OS: $os${NC}"

    case $os in
        macos)
            install_macos
            ;;
        linux)
            install_linux
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
