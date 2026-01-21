#!/usr/bin/env bash
set -euo pipefail

# Interactive Install Demo Recording Script
# Records the interactive installer using asciinema + agg

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$DEMO_DIR/output"
PROJECT_ROOT="$(dirname "$DEMO_DIR")"

DEMO_NAME="install"
DEMO_HOME="$DEMO_DIR/tmp-home/$DEMO_NAME"
CAST_FILE="$OUTPUT_DIR/${DEMO_NAME}.cast"
GIF_OUTPUT="$OUTPUT_DIR/${DEMO_NAME}.gif"
DOC_GIF="$PROJECT_ROOT/docs/img/${DEMO_NAME}.gif"

echo "Recording interactive install demo"
echo "=================================="

# Check dependencies
missing_deps=()
if ! command -v asciinema >/dev/null 2>&1; then
  missing_deps+=("asciinema")
fi
if ! command -v agg >/dev/null 2>&1; then
  missing_deps+=("agg")
fi

if [[ ${#missing_deps[@]} -gt 0 ]]; then
  echo "Missing dependencies: ${missing_deps[*]}"
  echo "Install with: brew install ${missing_deps[*]}"
  exit 1
fi

# Setup clean demo home directory
mkdir -p "$OUTPUT_DIR" "$DEMO_HOME"
rm -rf "${DEMO_HOME:?}"/*

# Clean previous outputs
rm -f "$CAST_FILE" "$GIF_OUTPUT" "$DOC_GIF"

echo "Demo home: $DEMO_HOME"
echo "Output: $GIF_OUTPUT"
echo ""

# Record terminal with asciinema
# Use --record-mode to auto-select defaults and run the actual installation
# Use --dry-run instead to show what would happen without making changes
# Add 3 second pause at end so GIF shows completion message before looping
echo "Recording terminal session..."
asciinema rec "$CAST_FILE" \
  --overwrite \
  --title "AutoMobile Interactive Install" \
  --idle-time-limit 2 \
  --command "HOME='$DEMO_HOME' TERM=xterm-256color '$PROJECT_ROOT/scripts/install.sh' --record-mode && sleep 3"

echo ""
echo "Converting to GIF..."

# Convert cast to GIF with agg
# Use fontdue renderer - works better on macOS for font detection (renders monochrome emoji)
# Reduced cols and increased font-size for a more square, readable output
agg "$CAST_FILE" "$GIF_OUTPUT" \
  --cols 100 \
  --rows 48 \
  --font-size 24 \
  --theme dracula \
  --font-family "Menlo" \
  --renderer fontdue

# Copy to docs
mkdir -p "$(dirname "$DOC_GIF")"
cp "$GIF_OUTPUT" "$DOC_GIF"

echo ""
echo "Recording complete:"
echo "  Cast: $CAST_FILE"
echo "  GIF:  $GIF_OUTPUT"
echo "  Docs: $DOC_GIF"
