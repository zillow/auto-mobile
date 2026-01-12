#!/usr/bin/env bash
set -euo pipefail

# Standalone video merger for AutoMobile demos
# Merges CLI terminal recording with Android device screen recording

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$DEMO_DIR/output"

# Parse arguments
if [ $# -lt 2 ]; then
  echo "Usage: $0 <cli-video.mp4> <device-video.mp4> [output-video.mp4]"
  echo ""
  echo "Merges CLI and device videos side-by-side"
  echo ""
  echo "Example:"
  echo "  $0 cli-demo.mp4 device-demo.mp4 final-demo.mp4"
  exit 1
fi

CLI_VIDEO="$1"
DEVICE_VIDEO="$2"
OUTPUT_VIDEO="${3:-$OUTPUT_DIR/merged-demo.mp4}"

if [ ! -f "$CLI_VIDEO" ]; then
  echo "❌ CLI video not found: $CLI_VIDEO"
  exit 1
fi

if [ ! -f "$DEVICE_VIDEO" ]; then
  echo "❌ Device video not found: $DEVICE_VIDEO"
  exit 1
fi

echo "🎞️  Merging Videos"
echo "================================"
echo "CLI video:    $CLI_VIDEO"
echo "Device video: $DEVICE_VIDEO"
echo "Output:       $OUTPUT_VIDEO"
echo ""

# Get video info
echo "📊 Analyzing videos..."
CLI_DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$CLI_VIDEO")
CLI_WIDTH=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=noprint_wrappers=1:nokey=1 "$CLI_VIDEO")
CLI_HEIGHT=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=noprint_wrappers=1:nokey=1 "$CLI_VIDEO")

DEVICE_DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$DEVICE_VIDEO")
DEVICE_WIDTH=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=noprint_wrappers=1:nokey=1 "$DEVICE_VIDEO")
DEVICE_HEIGHT=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=noprint_wrappers=1:nokey=1 "$DEVICE_VIDEO")

echo "   CLI:    ${CLI_WIDTH}x${CLI_HEIGHT} (${CLI_DURATION}s)"
echo "   Device: ${DEVICE_WIDTH}x${DEVICE_HEIGHT} (${DEVICE_DURATION}s)"
echo ""

# Calculate target dimensions
# Target: 1920x1080 total (16:9)
# CLI on left (2/3 width), device on right (1/3 width)
TARGET_HEIGHT=1080
CLI_TARGET_WIDTH=1280
DEVICE_TARGET_WIDTH=640

echo "🎬 Merging with ffmpeg..."
echo "   Target layout: ${CLI_TARGET_WIDTH}x${TARGET_HEIGHT} + ${DEVICE_TARGET_WIDTH}x${TARGET_HEIGHT}"
echo ""

# Create side-by-side video
# CLI on left (scaled to fit), device on right (scaled to fit)
# Use force_original_aspect_ratio=decrease to ensure videos fit within target dimensions
ffmpeg \
  -i "$CLI_VIDEO" \
  -i "$DEVICE_VIDEO" \
  -filter_complex "\
    [0:v]scale=${CLI_TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${CLI_TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1[left];\
    [1:v]scale=${DEVICE_TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${DEVICE_TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1[right];\
    [left][right]hstack=inputs=2[v]" \
  -map "[v]" \
  -c:v libx264 \
  -crf 23 \
  -preset medium \
  -pix_fmt yuv420p \
  -shortest \
  -y "$OUTPUT_VIDEO"

echo ""
echo "✅ Merge complete!"
echo ""
echo "📁 Output: $OUTPUT_VIDEO"
echo ""
echo "🎥 Play video:"
echo "   open '$OUTPUT_VIDEO'"
echo ""
