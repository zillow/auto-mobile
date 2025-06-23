#!/usr/bin/env bash

RIPGREP_VERSION="14.1.0" # Change this to the desired version

# Check if ripgrep is not installed
if ! command -v rg &>/dev/null; then

  # install proper version based on OS and architecture
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if command -v brew &>/dev/null; then
      brew install ripgrep
    else
      echo "Error: Homebrew is required to install ripgrep on macOS"
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
        ARCH="aarch64"
        ;;
      *)
        echo "Error: Unsupported architecture: $ARCH"
        rm -rf "$TMP_DIR"
        exit 1
        ;;
    esac

    # Download ripgrep binary with progress and error handling
    echo "Downloading ripgrep binary for $ARCH..."
    DOWNLOAD_URL="https://github.com/BurntSushi/ripgrep/releases/download/$RIPGREP_VERSION/ripgrep-$RIPGREP_VERSION-$ARCH-unknown-linux-musl.tar.gz"

    if ! curl -L --fail --show-error -o "$TMP_DIR/ripgrep.tar.gz" "$DOWNLOAD_URL"; then
      echo "Error: Failed to download ripgrep binary"
      rm -rf "$TMP_DIR"
      exit 1
    fi

    # Extract the binary
    if ! tar -xzf "$TMP_DIR/ripgrep.tar.gz" -C "$TMP_DIR"; then
      echo "Error: Failed to extract ripgrep binary"
      rm -rf "$TMP_DIR"
      exit 1
    fi

    # Find the extracted directory
    EXTRACTED_DIR=$(find "$TMP_DIR" -maxdepth 1 -type d -name "ripgrep-*" | head -n 1)
    if [ ! -d "$EXTRACTED_DIR" ]; then
      echo "Error: ripgrep directory not found in archive"
      rm -rf "$TMP_DIR"
      exit 1
    fi

    # Verify the binary exists
    if [ ! -f "$EXTRACTED_DIR/rg" ]; then
      echo "Error: rg binary not found in archive"
      rm -rf "$TMP_DIR"
      exit 1
    fi

    # Create bin directory if it doesn't exist
    mkdir -p "$HOME/bin"

    # Move binary to a permanent location
    if ! mv "$EXTRACTED_DIR/rg" "$HOME/bin/"; then
      echo "Error: Failed to move rg binary to $HOME/bin/"
      rm -rf "$TMP_DIR"
      exit 1
    fi

    # Make binary executable
    if ! chmod +x "$HOME/bin/rg"; then
      echo "Error: Failed to make rg binary executable"
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
    if ! command -v rg &>/dev/null; then
      echo "Error: ripgrep installation failed - command not found"
      exit 1
    fi
  fi

  echo "ripgrep $RIPGREP_VERSION installed successfully!"
else
  echo "ripgrep is already installed"
fi
