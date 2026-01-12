#!/usr/bin/env bash
set -euo pipefail

# Video file diagnostic tool
# Helps debug MP4 structure issues

if [ $# -lt 1 ]; then
  echo "Usage: $0 <video-file.mp4>"
  echo ""
  echo "Diagnoses video file issues (moov atom, codecs, etc.)"
  exit 1
fi

VIDEO_FILE="$1"

if [ ! -f "$VIDEO_FILE" ]; then
  echo "❌ File not found: $VIDEO_FILE"
  exit 1
fi

echo "🔍 Video File Diagnostics"
echo "========================"
echo "File: $VIDEO_FILE"
echo ""

# File size
FILE_SIZE=$(stat -f%z "$VIDEO_FILE" 2>/dev/null || stat -c%s "$VIDEO_FILE" 2>/dev/null || echo "unknown")
echo "📦 File Size: $FILE_SIZE bytes"
echo ""

# ffprobe analysis
echo "📊 File Analysis (ffprobe):"
echo "----------------------------"
if ffprobe -v error -show_format -show_streams "$VIDEO_FILE" 2>&1; then
  echo ""
  echo "✅ File is readable by ffprobe"
else
  echo ""
  echo "❌ File cannot be read by ffprobe"
fi
echo ""

# Check for moov atom
echo "🔎 Checking for moov atom..."
if ffmpeg -v error -i "$VIDEO_FILE" -f null - 2>&1 | grep -q "moov atom not found"; then
  echo "❌ MOOV ATOM NOT FOUND - file needs fixing"
  echo ""
  echo "💡 To fix:"
  echo "   ffmpeg -i $VIDEO_FILE -c copy -movflags +faststart fixed.mp4"
else
  if ffmpeg -v error -i "$VIDEO_FILE" -t 0.1 -f null - > /dev/null 2>&1; then
    echo "✅ File structure is OK"
  else
    echo "⚠️  File may have issues (see errors above)"
  fi
fi
echo ""

# Codec info
echo "🎬 Codec Information:"
echo "--------------------"
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate -of default=noprint_wrappers=1 "$VIDEO_FILE" 2>&1 || echo "Cannot read codec info"
echo ""
