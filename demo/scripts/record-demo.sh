#!/usr/bin/env bash
set -euo pipefail

# AutoMobile + CLI Demo Recording Script
# Records both terminal interaction and Android device screen simultaneously

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$DEMO_DIR/output"
PROJECT_ROOT="$(dirname "$DEMO_DIR")"

# Configuration
DEMO_NAME="${1:-alarm-demo}"
DEVICE_VIDEO="$OUTPUT_DIR/${DEMO_NAME}-device.mp4"
CLI_VIDEO="$OUTPUT_DIR/${DEMO_NAME}-cli.mp4"
FINAL_VIDEO="$OUTPUT_DIR/${DEMO_NAME}-final.mp4"

echo "🎬 AutoMobile Demo Recorder"
echo "================================"
echo "Demo name: $DEMO_NAME"
echo "Output dir: $OUTPUT_DIR"
echo ""

# Clean previous outputs
rm -f "$DEVICE_VIDEO" "$CLI_VIDEO" "$FINAL_VIDEO"

# Step 0: Stop any existing device recordings
echo "🧹 Cleaning up any existing recordings..."
bun run "$PROJECT_ROOT/src/index.ts" --cli videoRecording \
  --action stop \
  --platform android > /dev/null 2>&1 || true || echo "   No existing recordings"
echo ""

# Step 1: Start device video recording
echo "📱 Starting device screen recording..."
RECORDING_ID=$(bun run "$PROJECT_ROOT/src/index.ts" --cli videoRecording \
  --action start \
  --platform android \
  --outputName "$DEMO_NAME" \
  --qualityPreset high \
  --maxDuration 120 | jq -r '.content[0].text | fromjson | .recordings[0].recordingId')

echo "   Recording ID: $RECORDING_ID"
echo ""

# Step 2: Record terminal interaction with asciinema
echo "🖥️  Recording terminal interaction..."
CAST_FILE="$OUTPUT_DIR/${DEMO_NAME}.cast"
asciinema rec "$CAST_FILE" \
  --command "$SCRIPT_DIR/simulate-claude-code.sh" \
  --overwrite \
  --title "Claude Code + AutoMobile Demo" \
  --idle-time-limit 2

# Convert cast to gif with agg
CLI_GIF="$OUTPUT_DIR/${DEMO_NAME}-cli.gif"
agg "$CAST_FILE" "$CLI_GIF" --cols 120 --rows 30 --font-size 14 --theme dracula --font-family "SF Mono,Menlo,DejaVu Sans Mono" --renderer resvg > /dev/null 2>&1 || true

# Convert GIF to MP4
ffmpeg -i "$CLI_GIF" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -y "$CLI_VIDEO" > /dev/null 2>&1 || true || true

# Step 3: Stop device recording
echo "📱 Stopping device screen recording..."
STOP_RESULT=$(bun run "$PROJECT_ROOT/src/index.ts" --cli videoRecording \
  --action stop \
  --platform android \
  --recordingId "$RECORDING_ID")

# Extract device video path
DEVICE_VIDEO_PATH=$(echo "$STOP_RESULT" | jq -r '.content[0].text | fromjson | .recordings[0].filePath')

# Wait for file to be fully written and finalized
sleep 1

# Verify the file exists and is valid
if [ ! -f "$DEVICE_VIDEO_PATH" ]; then
  echo "   ❌ Error: Device video file not found!"
  exit 1
fi

# Check if file is readable
FILE_SIZE=$(stat -f%z "$DEVICE_VIDEO_PATH" 2>/dev/null || echo "0")

if [ "$FILE_SIZE" -lt 1000 ]; then
  echo "   ❌ Error: Device video file is too small or empty!"
  exit 1
fi

# Fix moov atom by re-encoding (ensuring proper MP4 structure)
TEMP_VIDEO="${DEVICE_VIDEO}.temp.mp4"

# Try to fix the MP4 structure
if ffmpeg -i "$DEVICE_VIDEO_PATH" -c copy -movflags +faststart "$TEMP_VIDEO" -y > /dev/null 2>&1; then

  mv "$TEMP_VIDEO" "$DEVICE_VIDEO"
else

  # Full re-encode as fallback
  if ffmpeg -i "$DEVICE_VIDEO_PATH" -c:v libx264 -crf 23 -preset fast -movflags +faststart "$TEMP_VIDEO" -y > /dev/null 2>&1; then
  
    mv "$TEMP_VIDEO" "$DEVICE_VIDEO"
  else
  
    cp "$DEVICE_VIDEO_PATH" "$DEVICE_VIDEO"
  fi
fi
echo ""

# Step 4: VHS already output MP4 directly, verify it exists
echo "📹 Verifying CLI video..."
if [ ! -f "$CLI_VIDEO" ]; then
  echo "   ❌ Error: CLI video file not found at $CLI_VIDEO"
  exit 1
fi
echo "   ✓ CLI video ready: $CLI_VIDEO"
echo ""

# Step 5: Merge videos side-by-side
echo "🎞️  Merging videos side-by-side..."

# Get video durations
DEVICE_DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$DEVICE_VIDEO")
CLI_DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$CLI_VIDEO")

# echo "   Device video: ${DEVICE_DURATION}s"
# echo "   CLI video: ${CLI_DURATION}s"

# Calculate offset - device recording starts before terminal recording
# Account for startup time between device recording start and first action
DEVICE_OFFSET=0  # Skip first 2 seconds of device video where nothing is happening yet

# Determine shortest duration (use CLI duration since it's typically shorter)
SHORTEST_DURATION=$CLI_DURATION

# echo "   Using duration: ${SHORTEST_DURATION}s (with ${DEVICE_OFFSET}s device offset)"

# Scale both videos to fit within target dimensions, place side-by-side
# Use trim filter to skip initial idle time in device video and sync both videos
ffmpeg \
  -i "$CLI_VIDEO" \
  -i "$DEVICE_VIDEO" \
  -filter_complex "\
    [0:v]trim=start=0:duration=${SHORTEST_DURATION},setpts=PTS-STARTPTS,scale=960:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=960:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[left];\
    [1:v]trim=start=0:duration=${SHORTEST_DURATION},setpts=PTS-STARTPTS,scale=540:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=540:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[right];\
    [left][right]hstack=inputs=2[v]" \
  -map "[v]" \
  -c:v libx264 \
  -crf 23 \
  -preset medium \
  -pix_fmt yuv420p \
  -y "$FINAL_VIDEO" > /dev/null 2>&1 || true || true

echo ""
echo "✅ Demo recording complete!"
echo ""
echo "🎥 Play final video:"
echo "   $FINAL_VIDEO"
