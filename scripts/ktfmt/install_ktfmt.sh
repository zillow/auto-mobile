#!/usr/bin/env bash

KTFMT_VERSION="0.55" # Change this to the desired version

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

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install ktfmt on macOS
install_macos() {
    echo -e "${YELLOW}Installing ktfmt on macOS...${NC}"

    if command_exists brew; then
        echo -e "${GREEN}Using Homebrew to install ktfmt${NC}"
        brew install ktfmt
        return $?
    else
        echo -e "${YELLOW}Homebrew not found. Install Homebrew first or use manual installation.${NC}"
        echo "To install Homebrew: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        return 1
    fi
}

# Install ktfmt on Linux
install_linux() {
    echo -e "${YELLOW}Installing ktfmt on Linux...${NC}"

    # Check for package managers in order of preference
    if command_exists apt-get; then
        echo -e "${YELLOW}APT package manager detected, but ktfmt may not be available in default repositories.${NC}"
        echo -e "${YELLOW}Falling back to manual installation...${NC}"
        install_manual
        return $?
    elif command_exists yum; then
        echo -e "${YELLOW}YUM package manager detected, but ktfmt may not be available in default repositories.${NC}"
        echo -e "${YELLOW}Falling back to manual installation...${NC}"
        install_manual
        return $?
    elif command_exists dnf; then
        echo -e "${YELLOW}DNF package manager detected, but ktfmt may not be available in default repositories.${NC}"
        echo -e "${YELLOW}Falling back to manual installation...${NC}"
        install_manual
        return $?
    elif command_exists pacman; then
        echo -e "${YELLOW}Pacman package manager detected, but ktfmt may not be available in default repositories.${NC}"
        echo -e "${YELLOW}Falling back to manual installation...${NC}"
        install_manual
        return $?
    else
        echo -e "${YELLOW}No supported package manager found. Using manual installation...${NC}"
        install_manual
        return $?
    fi
}

# Install ktfmt on Windows
install_windows() {
    echo -e "${YELLOW}Installing ktfmt on Windows...${NC}"

    if command_exists scoop; then
        echo -e "${GREEN}Using Scoop to install ktfmt${NC}"
        scoop install ktfmt
        return $?
    elif command_exists choco; then
        echo -e "${YELLOW}Chocolatey detected, but ktfmt may not be available. Falling back to manual installation...${NC}"
        install_manual
        return $?
    elif command_exists winget; then
        echo -e "${YELLOW}Winget detected, but ktfmt may not be available. Falling back to manual installation...${NC}"
        install_manual
        return $?
    else
        echo -e "${YELLOW}No supported package manager found. Using manual installation...${NC}"
        echo -e "${YELLOW}Consider installing Scoop for easier package management: https://scoop.sh/${NC}"
        install_manual
        return $?
    fi
}

# Manual installation by downloading JAR
install_manual() {
    echo -e "${YELLOW}Installing ktfmt manually...${NC}"

    # Check for Java
    if ! command_exists java; then
        echo -e "${RED}Java is required to run ktfmt. Please install Java 11 or later.${NC}"
        return 1
    fi

    # Check Java version
    java_version=$(java -version 2>&1 | head -1 | cut -d'"' -f2 | sed 's/^1\.//' | cut -d'.' -f1)
    if [ "$java_version" -lt 11 ]; then
        echo -e "${RED}Java 11 or later is required. Current version: $java_version${NC}"
        return 1
    fi

    # Create installation directory
    install_dir="$HOME/.local/bin"
    mkdir -p "$install_dir"

    # Download ktfmt JAR from Maven Central
    jar_file="ktfmt-${KTFMT_VERSION}-jar-with-dependencies.jar"
    jar_url="https://repo1.maven.org/maven2/com/facebook/ktfmt/${KTFMT_VERSION}/${jar_file}"

    echo -e "${GREEN}Downloading ktfmt JAR from Maven Central...${NC}"

    if command_exists curl; then
        curl -L -o "$install_dir/$jar_file" "$jar_url"
    elif command_exists wget; then
        wget -O "$install_dir/$jar_file" "$jar_url"
    else
        echo -e "${RED}Neither curl nor wget found. Please install one of them or download manually from:${NC}"
        echo "$jar_url"
        return 1
    fi

    # Verify the JAR file was downloaded correctly
    if [[ -f "$install_dir/$jar_file" ]]; then
        echo -e "${GREEN}ktfmt JAR downloaded successfully to $install_dir${NC}"
    else
        echo -e "${RED}Failed to download ktfmt JAR${NC}"
        return 1
    fi

    # Create wrapper script
    wrapper_script="$install_dir/ktfmt"
    cat > "$wrapper_script" << EOF
#!/bin/bash
java -jar "$install_dir/$jar_file" "\$@"
EOF

    chmod +x "$wrapper_script"

    echo -e "${GREEN}ktfmt installed successfully to $install_dir${NC}"
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
    echo -e "${YELLOW}Verifying ktfmt installation...${NC}"

    if command_exists ktfmt; then
        echo -e "${GREEN}ktfmt is installed and available in PATH${NC}"
        ktfmt --version 2>/dev/null || echo -e "${GREEN}ktfmt is ready to use${NC}"
        return 0
    else
        echo -e "${RED}ktfmt is not available in PATH${NC}"
        return 1
    fi
}

# Main installation function
main() {
    echo -e "${GREEN}ktfmt Installation Script${NC}"
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
