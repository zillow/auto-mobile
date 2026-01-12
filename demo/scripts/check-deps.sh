#!/usr/bin/env bash
set -euo pipefail

# Dependency checker for AutoMobile demo recording

echo "🔍 Checking Demo Recording Dependencies"
echo "========================================"
echo ""

MISSING_DEPS=()
OPTIONAL_DEPS=()

# Check essential tools
check_required() {
  local cmd="$1"
  local name="$2"
  local install="$3"

  if command -v "$cmd" &> /dev/null; then
    echo "✅ $name: $(command -v "$cmd")"
  else
    echo "❌ $name: NOT FOUND"
    echo "   Install: $install"
    MISSING_DEPS+=("$name")
  fi
}

check_optional() {
  local cmd="$1"
  local name="$2"
  local install="$3"

  if command -v "$cmd" &> /dev/null; then
    echo "✅ $name: $(command -v "$cmd")"
  else
    echo "⚠️  $name: NOT FOUND (optional)"
    echo "   Install: $install"
    OPTIONAL_DEPS+=("$name")
  fi
}

echo "Required Dependencies:"
echo "---------------------"
check_required "bun" "Bun" "curl -fsSL https://bun.sh/install | bash"
check_required "ffmpeg" "FFmpeg" "brew install ffmpeg"
check_required "ffprobe" "FFprobe" "brew install ffmpeg"
check_required "asciinema" "Asciinema" "brew install asciinema"
check_required "agg" "agg" "cargo install --git https://github.com/asciinema/agg"

echo ""
echo "Optional Tools:"
echo "---------------"
check_optional "jq" "jq (JSON processor)" "brew install jq"
check_optional "obs" "OBS Studio" "brew install obs"

echo ""
echo "========================================"
echo ""

if [ ${#MISSING_DEPS[@]} -eq 0 ]; then
  echo "✅ All required dependencies installed!"
  echo ""
  echo "Ready to record demos:"
  echo "  ./demo/scripts/record-demo.sh my-demo"
  exit 0
else
  echo "❌ Missing ${#MISSING_DEPS[@]} required dependencies:"
  printf '   - %s\n' "${MISSING_DEPS[@]}"
  echo ""
  echo "Install missing dependencies before recording demos."
  exit 1
fi
