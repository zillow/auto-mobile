#!/usr/bin/env bash

ACT_VERSION="0.2.68" # Change this to the desired version

# Check if act is not installed
if ! command -v act &>/dev/null; then

  echo "Installing act $ACT_VERSION..."

  # install proper version based on OS and architecture
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "Detected macOS system"
    if command -v brew &>/dev/null; then
      brew install act
    else
      echo "Error: Homebrew is required to install act on macOS"
      exit 1
    fi
  else
    # Linux
    echo "Detected Linux system"

    # Create a temporary directory
    TMP_DIR=$(mktemp -d)

    # Detect architecture
    ARCH=$(uname -m)
    case $ARCH in
      x86_64)
        ARCH="x86_64"
        ;;
      aarch64|arm64)
        ARCH="arm64"
        ;;
      *)
        echo "Error: Unsupported architecture: $ARCH"
        rm -rf "$TMP_DIR"
        exit 1
        ;;
    esac

    # Download act binary with progress and error handling
    echo "Downloading act binary for $ARCH..."
    DOWNLOAD_URL="https://github.com/nektos/act/releases/download/v$ACT_VERSION/act_Linux_$ARCH.tar.gz"
    
    if ! curl -L --fail --show-error -o "$TMP_DIR/act.tar.gz" "$DOWNLOAD_URL"; then
      echo "Error: Failed to download act binary"
      rm -rf "$TMP_DIR"
      exit 1
    fi

    # Extract the binary
    if ! tar -xzf "$TMP_DIR/act.tar.gz" -C "$TMP_DIR"; then
      echo "Error: Failed to extract act binary"
      rm -rf "$TMP_DIR"
      exit 1
    fi

    # Verify the binary exists
    if [ ! -f "$TMP_DIR/act" ]; then
      echo "Error: act binary not found in archive"
      rm -rf "$TMP_DIR"
      exit 1
    fi

    # Create bin directory if it doesn't exist
    mkdir -p "$HOME/bin"

    # Move binary to a permanent location
    if ! mv "$TMP_DIR/act" "$HOME/bin/"; then
      echo "Error: Failed to move act binary to $HOME/bin/"
      rm -rf "$TMP_DIR"
      exit 1
    fi

    # Make binary executable
    if ! chmod +x "$HOME/bin/act"; then
      echo "Error: Failed to make act binary executable"
      rm -rf "$TMP_DIR"
      exit 1
    fi

    # Clean up temporary directory
    rm -rf "$TMP_DIR"

    # Add to PATH if not already there
    if [[ ":$PATH:" != *":$HOME/bin:"* ]]; then
      echo "export PATH=\"\$HOME/bin:\$PATH\"" >> "$HOME/.bashrc"
      echo "export PATH=\"\$HOME/bin:\$PATH\"" >> "$HOME/.bash_profile"
      # Add to current PATH immediately
      export PATH="$HOME/bin:$PATH"
    fi

    # Verify installation
    if ! command -v act &>/dev/null; then
      echo "Error: act installation failed - command not found"
      exit 1
    fi
  fi

  echo "act $ACT_VERSION installed successfully!"
else
  echo "act is already installed"
fi