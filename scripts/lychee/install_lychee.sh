#!/usr/bin/env bash

LYCHEE_VERSION="0.19.1" # Change this to the desired version

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
            echo "aarch64"
            ;;
        armv7l)
            echo "armv7"
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

# Install lychee on macOS
install_macos() {
    echo -e "${YELLOW}Installing lychee on macOS...${NC}"

    if command_exists brew; then
        echo -e "${GREEN}Using Homebrew to install lychee${NC}"
        brew install lychee
    elif command_exists port; then
        echo -e "${GREEN}Using MacPorts to install lychee${NC}"
        sudo port install lychee
    else
        echo -e "${YELLOW}No package manager found. Using manual installation...${NC}"
        install_manual
    fi
}

# Install lychee on Linux
install_linux() {
    echo -e "${YELLOW}Installing lychee on Linux...${NC}"

    # Check for package managers in order of preference
    if command_exists pacman; then
        echo -e "${GREEN}Using pacman to install lychee${NC}"
        sudo pacman -S lychee
    elif command_exists zypper; then
        echo -e "${GREEN}Using zypper to install lychee${NC}"
        sudo zypper in lychee
    elif command_exists apk; then
        echo -e "${GREEN}Using apk to install lychee${NC}"
        sudo apk add lychee
    elif command_exists pkg; then
        echo -e "${GREEN}Using pkg to install lychee${NC}"
        sudo pkg install lychee
    elif command_exists nix-env; then
        echo -e "${GREEN}Using nix to install lychee${NC}"
        nix-env -iA nixos.lychee
    elif command_exists apt-get; then
        echo -e "${YELLOW}APT package manager detected, but lychee may not be available in default repositories.${NC}"
        echo -e "${YELLOW}Falling back to manual installation...${NC}"
        install_manual
    elif command_exists yum; then
        echo -e "${YELLOW}YUM package manager detected, but lychee may not be available in default repositories.${NC}"
        echo -e "${YELLOW}Falling back to manual installation...${NC}"
        install_manual
    elif command_exists dnf; then
        echo -e "${YELLOW}DNF package manager detected, but lychee may not be available in default repositories.${NC}"
        echo -e "${YELLOW}Falling back to manual installation...${NC}"
        install_manual
    else
        echo -e "${YELLOW}No supported package manager found. Using manual installation...${NC}"
        install_manual
    fi
}

# Install lychee on Windows
install_windows() {
    echo -e "${YELLOW}Installing lychee on Windows...${NC}"

    if command_exists scoop; then
        echo -e "${GREEN}Using Scoop to install lychee${NC}"
        scoop install lychee
    elif command_exists choco; then
        echo -e "${GREEN}Using Chocolatey to install lychee${NC}"
        choco install lychee
    elif command_exists winget; then
        echo -e "${YELLOW}Winget detected, but lychee may not be available. Falling back to manual installation...${NC}"
        install_manual
    else
        echo -e "${YELLOW}No supported package manager found. Using manual installation...${NC}"
        echo -e "${YELLOW}Consider installing Scoop for easier package management: https://scoop.sh/${NC}"
        install_manual
    fi
}

# Manual installation by downloading binary
install_manual() {
    echo -e "${YELLOW}Installing lychee manually...${NC}"

    local os
    os=$(detect_os)
    local arch
    arch=$(detect_arch)

    # Map OS and architecture to GitHub release naming
    case "$os" in
        macos)
            case "$arch" in
                x86_64)
                    binary_name="lychee-lychee-v${LYCHEE_VERSION}-x86_64-apple-darwin.tar.gz"
                    ;;
                aarch64)
                    binary_name="lychee-lychee-v${LYCHEE_VERSION}-aarch64-apple-darwin.tar.gz"
                    ;;
                *)
                    echo -e "${RED}Unsupported architecture: $arch${NC}"
                    return 1
                    ;;
            esac
            ;;
        linux)
            case "$arch" in
                x86_64)
                    binary_name="lychee-lychee-v${LYCHEE_VERSION}-x86_64-unknown-linux-gnu.tar.gz"
                    ;;
                aarch64)
                    binary_name="lychee-lychee-v${LYCHEE_VERSION}-aarch64-unknown-linux-gnu.tar.gz"
                    ;;
                armv7)
                    binary_name="lychee-lychee-v${LYCHEE_VERSION}-armv7-unknown-linux-gnueabihf.tar.gz"
                    ;;
                *)
                    echo -e "${RED}Unsupported architecture: $arch${NC}"
                    return 1
                    ;;
            esac
            ;;
        windows)
            case "$arch" in
                x86_64)
                    binary_name="lychee-lychee-v${LYCHEE_VERSION}-x86_64-pc-windows-msvc.zip"
                    ;;
                *)
                    echo -e "${RED}Unsupported architecture: $arch${NC}"
                    return 1
                    ;;
            esac
            ;;
        *)
            echo -e "${RED}Unsupported operating system: $os${NC}"
            return 1
            ;;
    esac

    # Create installation directory
    install_dir="$HOME/.local/bin"
    mkdir -p "$install_dir"

    # Download URL
    download_url="https://github.com/lycheeverse/lychee/releases/download/lychee-v${LYCHEE_VERSION}/${binary_name}"

    echo -e "${GREEN}Downloading lychee binary from GitHub releases...${NC}"
    echo "URL: $download_url"

    # Create temporary directory
    temp_dir=$(mktemp -d)
    trap 'rm -rf "$temp_dir"' EXIT

    # Download the archive
    if command_exists curl; then
        if ! curl -L -o "$temp_dir/$binary_name" "$download_url"; then
            echo -e "${RED}Failed to download lychee binary${NC}"
            return 1
        fi
    elif command_exists wget; then
        if ! wget -O "$temp_dir/$binary_name" "$download_url"; then
            echo -e "${RED}Failed to download lychee binary${NC}"
            return 1
        fi
    else
        echo -e "${RED}Neither curl nor wget found. Please install one of them or download manually from:${NC}"
        echo "$download_url"
        return 1
    fi

    # Extract the archive
    cd "$temp_dir" || exit
    case "$binary_name" in
        *.tar.gz)
            tar -xzf "$binary_name"
            ;;
        *.zip)
            if command_exists unzip; then
                unzip "$binary_name"
            else
                echo -e "${RED}unzip command not found. Please install unzip or extract manually.${NC}"
                return 1
            fi
            ;;
        *)
            echo -e "${RED}Unsupported archive format${NC}"
            return 1
            ;;
    esac

    # Find the lychee binary and move it to install directory
    lychee_binary=$(find . -name "lychee" -type f | head -1)
    if [[ -z "$lychee_binary" ]]; then
        echo -e "${RED}Could not find lychee binary in extracted archive${NC}"
        return 1
    fi

    # Make executable and move to install directory
    chmod +x "$lychee_binary"
    mv "$lychee_binary" "$install_dir/lychee"

    echo -e "${GREEN}lychee installed successfully to $install_dir${NC}"
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
    echo -e "${YELLOW}Verifying lychee installation...${NC}"

    if command_exists lychee; then
        echo -e "${GREEN}lychee is installed and available in PATH${NC}"
        lychee --version
        return 0
    else
        echo -e "${RED}lychee is not available in PATH${NC}"
        return 1
    fi
}

# Main installation function
main() {
    echo -e "${GREEN}Lychee Installation Script${NC}"
    echo -e "${GREEN}==========================${NC}"

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

    if install_manual; then
        echo -e "${GREEN}Installation completed successfully!${NC}"
        verify_installation
    else
        echo -e "${RED}Installation failed!${NC}"
        exit 1
    fi
}

# Run main function
main "$@"
