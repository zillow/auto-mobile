#!/usr/bin/env bash
set -euo pipefail

# AutoMobile + CLI Demo Recording Script (iOS)
# Records both terminal interaction and iOS simulator screen simultaneously
# Uses xcrun simctl io directly for more reliable iOS simulator recording

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$DEMO_DIR/output"

# Configuration
DEMO_NAME="${1:-reminders-ios}"
SCENARIO_SCRIPT="$SCRIPT_DIR/scenarios/${DEMO_NAME}.sh"
RAW_DEVICE_VIDEO="$OUTPUT_DIR/${DEMO_NAME}-device-raw.mov"
DEVICE_VIDEO="$OUTPUT_DIR/${DEMO_NAME}-device.mp4"
CLI_VIDEO="$OUTPUT_DIR/${DEMO_NAME}-cli.mp4"
FINAL_VIDEO="$OUTPUT_DIR/${DEMO_NAME}.mp4"

# Get the booted iOS simulator device ID
DEVICE_ID=$(xcrun simctl list devices booted -j | jq -r '[.devices[][] | select(.state == "Booted")] | .[0].udid')

echo "🎬 AutoMobile iOS Demo Recorder"
echo "================================"
echo "Demo name: $DEMO_NAME"
echo "Scenario: $SCENARIO_SCRIPT"
echo "Device:   $DEVICE_ID"
echo "Output:   $OUTPUT_DIR"
echo ""

if [ "$DEVICE_ID" = "null" ] || [ -z "$DEVICE_ID" ]; then
  echo "❌ Error: No booted iOS simulator found"
  echo "   Start one with: xcrun simctl boot <device-id>"
  exit 1
fi

# Check if scenario exists
if [ ! -f "$SCENARIO_SCRIPT" ]; then
  echo "❌ Error: Scenario not found: $SCENARIO_SCRIPT"
  echo ""
  echo "Available scenarios:"
  find "$SCRIPT_DIR/scenarios" -maxdepth 1 -name "*.sh" -type f -exec basename {} .sh \; | sed 's/^/  - /' | sort
  exit 1
fi

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Clean previous outputs
rm -f "$RAW_DEVICE_VIDEO" "$DEVICE_VIDEO" "$CLI_VIDEO" "$FINAL_VIDEO"

# Track the simctl recording PID so we can clean it up on exit
SIMCTL_PID=""
cleanup() {
  if [ -n "$SIMCTL_PID" ] && kill -0 "$SIMCTL_PID" 2>/dev/null; then
    echo ""
    echo "🧹 Stopping simctl recording (PID $SIMCTL_PID)..."
    kill -INT "$SIMCTL_PID" 2>/dev/null || true
    wait "$SIMCTL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Step 1: Start iOS simulator screen recording in background
echo "📱 Starting iOS simulator screen recording..."
xcrun simctl io "$DEVICE_ID" recordVideo --codec h264 --force "$RAW_DEVICE_VIDEO" &
SIMCTL_PID=$!
# Give simctl a moment to initialize the recording
sleep 2
echo "   Recording PID: $SIMCTL_PID"
echo ""

# Step 2: Record terminal interaction with asciinema
echo "🖥️  Recording terminal interaction..."
CAST_FILE="$OUTPUT_DIR/${DEMO_NAME}.cast"
asciinema rec "$CAST_FILE" \
  --command "$SCENARIO_SCRIPT" \
  --overwrite \
  --title "Claude Code + AutoMobile iOS Demo: ${DEMO_NAME}" \
  --idle-time-limit 2

echo ""

# Step 3: Stop the iOS simulator recording (send SIGINT to simctl)
echo "📱 Stopping iOS simulator screen recording..."
kill -INT "$SIMCTL_PID" 2>/dev/null || true
wait "$SIMCTL_PID" 2>/dev/null || true
SIMCTL_PID=""  # Clear so EXIT trap doesn't double-stop
sleep 1
echo "   ✓ Recording stopped"
echo ""

# Step 4: Verify raw device video
if [ ! -f "$RAW_DEVICE_VIDEO" ]; then
  echo "   ❌ Error: Device video file not found at: $RAW_DEVICE_VIDEO"
  exit 1
fi

FILE_SIZE=$(stat -f%z "$RAW_DEVICE_VIDEO" 2>/dev/null || echo "0")
echo "   Raw device video: $RAW_DEVICE_VIDEO ($FILE_SIZE bytes)"

if [ "$FILE_SIZE" -lt 1000 ]; then
  echo "   ❌ Error: Device video file is too small or empty!"
  exit 1
fi

# Convert raw MOV to MP4 with proper structure
echo "   Converting to MP4..."
if ffmpeg -i "$RAW_DEVICE_VIDEO" -c:v libx264 -crf 23 -preset fast -movflags +faststart -pix_fmt yuv420p -y "$DEVICE_VIDEO" > /dev/null 2>&1; then
  echo "   ✓ Device video ready: $DEVICE_VIDEO"
else
  echo "   ⚠️  H.264 encode failed, trying copy..."
  ffmpeg -i "$RAW_DEVICE_VIDEO" -c copy -movflags +faststart -y "$DEVICE_VIDEO" > /dev/null 2>&1
fi
echo ""

# Step 5: Convert terminal recording to video
echo "📹 Converting terminal recording to video..."
CLI_GIF="$OUTPUT_DIR/${DEMO_NAME}-cli.gif"
agg "$CAST_FILE" "$CLI_GIF" --cols 100 --rows 48 --font-size 24 --theme dracula --font-family "Menlo" --renderer fontdue > /dev/null 2>&1

# Convert GIF to MP4
ffmpeg -i "$CLI_GIF" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -y "$CLI_VIDEO" > /dev/null 2>&1

if [ ! -f "$CLI_VIDEO" ]; then
  echo "   ❌ Error: CLI video file not found at $CLI_VIDEO"
  exit 1
fi
echo "   ✓ CLI video ready: $CLI_VIDEO"
echo ""

# Step 6: Merge videos side-by-side
echo "🎞️  Merging videos side-by-side..."

# Get video durations and use the shorter one
CLI_DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$CLI_VIDEO")
DEVICE_DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$DEVICE_VIDEO")

# Use the shorter duration
SHORTEST_DURATION=$(python3 -c "print(min($CLI_DURATION, $DEVICE_DURATION))")
echo "   CLI duration:    ${CLI_DURATION}s"
echo "   Device duration: ${DEVICE_DURATION}s"
echo "   Using duration:  ${SHORTEST_DURATION}s"

# Terminal on left (960x1080), iOS simulator on right (540x1080)
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
  -y "$FINAL_VIDEO" > /dev/null 2>&1

echo ""
echo "✅ Demo recording complete!"
echo ""

# Step 7: Create GIF from combined video
echo "🖼️  Creating GIF from combined video..."
FINAL_GIF="$OUTPUT_DIR/${DEMO_NAME}.gif"
ffmpeg -i "$FINAL_VIDEO" \
  -vf "fps=10,scale=1500:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
  -loop 0 \
  -y "$FINAL_GIF" > /dev/null 2>&1

echo ""
echo "🎥 Play final video:"
echo "   open $FINAL_VIDEO"
echo ""
echo "🎨 GIF created:"
echo "   $FINAL_GIF"
