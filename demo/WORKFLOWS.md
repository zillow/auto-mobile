# Demo Recording Workflows

Quick reference for all possible recording and merging workflows.

## Recording Phase

### Terminal (CLI)

```bash
# Option A: asciicinema (recommended)
asciicinema rec demo.cast --command "./simulate-claude-code.sh"

# Option B: termtosvg (SVG output)
termtosvg demo.svg

# Option C: vhs (direct to video)
vhs demo.tape  # Creates demo.mp4

# Option D: ttyd + ffmpeg (live video)
ttyd bash &
ffmpeg -f avfoundation -i "1" terminal.mp4
```

### Device (Android)

```bash
# Option A: AutoMobile videoRecording (recommended)
bun run src/index.ts --cli videoRecording \
  --action start --platform android --outputName demo
# ... perform actions ...
bun run src/index.ts --cli videoRecording \
  --action stop --platform android --recordingId <id>

# Option B: Direct ADB screen recording
adb shell screenrecord /sdcard/demo.mp4
# ... perform actions ...
adb shell pkill -2 screenrecord
adb pull /sdcard/demo.mp4

# Option C: scrcpy + screen capture
scrcpy &
ffmpeg -f avfoundation -i "2" device.mp4
```

## Conversion Phase

### Terminal Formats

```bash
# cast → gif
agg demo.cast demo.gif

# cast → gif (alternative)
asciicast2gif -s 2 demo.cast demo.gif

# cast → svg
svg-term --in demo.cast --out demo.svg

# gif → mp4
ffmpeg -i demo.gif -movflags faststart -pix_fmt yuv420p demo.mp4

# svg → mp4
# (requires rendering svg frames first)
```

### Device Formats

```bash
# mp4 → gif
ffmpeg -i device.mp4 -vf "fps=10,scale=540:-1:flags=lanczos" device.gif

# mp4 optimization
ffmpeg -i device.mp4 -c:v libx264 -crf 23 device-optimized.mp4

# Extract frames
ffmpeg -i device.mp4 frames/frame_%04d.png
```

## Merging Phase

### Timing Options

| When to Merge | Method |
|---------------|--------|
| **Before conversion** | Merge .cast + device video, convert together |
| **After conversion** | Convert separately, merge MP4s (recommended) |
| **During recording** | Use OBS with multiple sources |

### Layout Options

#### 1. Side-by-Side (Horizontal)

```bash
ffmpeg -i cli.mp4 -i device.mp4 \
  -filter_complex "[0:v]scale=960:-1[left];[1:v]scale=960:-1[right];[left][right]hstack" \
  -c:v libx264 -crf 23 output.mp4
```

#### 2. Vertical Stack

```bash
ffmpeg -i cli.mp4 -i device.mp4 \
  -filter_complex "[0:v]scale=-1:540[top];[1:v]scale=-1:540[bottom];[top][bottom]vstack" \
  -c:v libx264 -crf 23 output.mp4
```

#### 3. Picture-in-Picture

```bash
ffmpeg -i cli.mp4 -i device.mp4 \
  -filter_complex "[0:v][1:v]overlay=W-w-10:H-h-10" \
  -c:v libx264 -crf 23 output.mp4
```

#### 4. Grid (4 videos)

```bash
ffmpeg -i v1.mp4 -i v2.mp4 -i v3.mp4 -i v4.mp4 \
  -filter_complex "\
    [0:v]scale=960:540[v0];\
    [1:v]scale=960:540[v1];\
    [2:v]scale=960:540[v2];\
    [3:v]scale=960:540[v3];\
    [v0][v1]hstack[top];\
    [v2][v3]hstack[bottom];\
    [top][bottom]vstack" \
  -c:v libx264 -crf 23 output.mp4
```

## Complete Workflows

### Workflow 1: Full Auto (Recommended)

```bash
./demo/scripts/record-demo.sh my-demo
```

**Process**:
1. Start device recording (AutoMobile)
2. Record terminal (asciicinema)
3. Stop device recording
4. Convert: cast → gif → mp4
5. Merge: cli.mp4 + device.mp4 → final.mp4

**Pros**: One command, synchronized
**Cons**: Two-step terminal conversion

---

### Workflow 2: Direct Video Recording

```bash
# Start device recording
RECORDING_ID=$(bun run src/index.ts --cli videoRecording \
  --action start --platform android --outputName demo | jq -r '.recordingId')

# Record terminal as video (macOS)
ffmpeg -f avfoundation -i "1" -t 60 terminal.mp4 &
FFMPEG_PID=$!

# Run demo
./simulate-claude-code.sh

# Stop both
kill $FFMPEG_PID
bun run src/index.ts --cli videoRecording --action stop --recordingId $RECORDING_ID

# Merge
./demo/scripts/merge-videos.sh terminal.mp4 device.mp4 final.mp4
```

**Pros**: Skip cast conversion
**Cons**: Platform-specific, larger files

---

### Workflow 3: GIF-Only Output

```bash
# Record terminal
asciicinema rec demo.cast --command "./simulate-claude-code.sh"

# Record device
adb shell screenrecord /sdcard/demo.mp4
adb pull /sdcard/demo.mp4

# Convert both to GIF
agg demo.cast cli.gif
ffmpeg -i demo.mp4 -vf "fps=10,scale=540:-1:flags=lanczos" device.gif

# Merge GIFs
ffmpeg -i cli.gif -i device.gif -filter_complex "[0][1]hstack" final.gif
```

**Pros**: Small file size
**Cons**: Quality loss, limited FPS

---

### Workflow 4: OBS Live Recording

```bash
# Setup OBS with sources:
# - Terminal window capture
# - Emulator window capture
# - Audio input (optional)

# Start OBS recording
obs --startrecording

# Run demo
./simulate-claude-code.sh

# Stop OBS recording
obs --stoprecording

# Output is ready (no merging needed)
```

**Pros**: Real-time, professional quality
**Cons**: Requires OBS setup, manual control

---

### Workflow 5: Post-Production Editing

```bash
# Record everything separately
asciicinema rec terminal.cast
# ... device recording ...

# Convert with timestamps for sync
agg terminal.cast terminal.gif
ffmpeg -i terminal.gif -pix_fmt yuv420p terminal.mp4

# Edit in video editor (iMovie, Final Cut, Premiere)
# - Import both videos
# - Align timing manually
# - Add transitions, text, audio
# - Export final video
```

**Pros**: Full control, professional edits
**Cons**: Manual work, requires video editor

---

## Tool Comparison Matrix

| Workflow | Tools | Output | Quality | Effort | Use Case |
|----------|-------|--------|---------|--------|----------|
| **Full Auto** | asciicinema, agg, ffmpeg | MP4 | High | Low | Quick demos |
| **Direct Video** | ffmpeg, AutoMobile | MP4 | High | Medium | Skip conversion |
| **GIF Only** | asciicinema, agg | GIF | Medium | Low | Documentation |
| **OBS Live** | OBS Studio | MP4 | Highest | High | Presentations |
| **Post-Production** | Video editor | MP4 | Highest | Highest | Marketing |

## Timing Considerations

### Synchronization Strategies

**Option A: Start Both Simultaneously**
```bash
device_recording_start &
asciicinema rec ... &
wait
```
- Pros: Natural sync
- Cons: Hard to coordinate

**Option B: Device First, Then Terminal**
```bash
# Start device (captures everything)
start_device_recording
sleep 2
# Run terminal (shorter duration)
asciicinema rec ...
# Device continues recording
stop_device_recording
# Trim device video to match terminal
```
- Pros: Easier coordination
- Cons: Need to trim device video

**Option C: Add Delays in Terminal**
```bash
# In simulate-claude-code.sh
show_mcp_call "launchApp" ...
sleep 3  # Wait for device to catch up
```
- Pros: Visual sync in output
- Cons: Artificial delays

### Trimming Videos

```bash
# Trim device video to match terminal
ffmpeg -i device.mp4 -ss 00:00:02 -t 00:01:00 -c copy device-trimmed.mp4

# Trim terminal video
ffmpeg -i terminal.mp4 -ss 00:00:00 -t 00:01:00 -c copy terminal-trimmed.mp4
```

## Quality Settings

### Terminal Recording

```bash
# asciicinema
asciicinema rec demo.cast \
  --idle-time-limit 2      # Limit idle time
  --command "./script.sh"  # Run specific script

# agg (cast → gif)
agg demo.cast demo.gif \
  --cols 120               # Terminal width
  --rows 30                # Terminal height
  --font-size 14           # Font size
  --theme monokai          # Color theme
  --speed 1.5              # Playback speed
```

### Device Recording

```bash
# AutoMobile
--qualityPreset high       # low, medium, high
--targetBitrateKbps 4000   # Custom bitrate
--fps 30                   # Frame rate
--maxDuration 120          # Max seconds
```

### Video Encoding

```bash
# ffmpeg quality settings
-crf 18                    # Very high quality
-crf 23                    # High quality (default)
-crf 28                    # Lower quality
-preset ultrafast          # Fast, larger files
-preset medium             # Balanced (default)
-preset veryslow           # Slow, smaller files
```

## Troubleshooting

### Audio Out of Sync
```bash
# Add audio offset
ffmpeg -i video.mp4 -itsoffset 0.5 -i audio.mp3 \
  -c:v copy -c:a aac output.mp4
```

### Different Frame Rates
```bash
# Force consistent frame rate
ffmpeg -i input.mp4 -r 30 -c:v libx264 output.mp4
```

### Different Resolutions
```bash
# Scale to same height before merging
-filter_complex "[0:v]scale=-1:1080[v0];[1:v]scale=-1:1080[v1];[v0][v1]hstack"
```

### Videos Different Lengths
```bash
# Use shortest video duration
ffmpeg -i v1.mp4 -i v2.mp4 -filter_complex "[0][1]hstack" -shortest output.mp4

# Or loop shorter video
ffmpeg -stream_loop -1 -i short.mp4 -i long.mp4 \
  -filter_complex "[0][1]hstack" -shortest output.mp4
```

## Advanced Techniques

### Add Timestamp Overlay
```bash
ffmpeg -i input.mp4 \
  -vf "drawtext=text='%{pts\\:hms}':x=10:y=10:fontsize=24:fontcolor=white" \
  output.mp4
```

### Add Border Between Videos
```bash
-filter_complex "[0:v]pad=iw+10:ih[left];[left][1:v]hstack"
```

### Fade In/Out
```bash
ffmpeg -i input.mp4 \
  -vf "fade=in:0:30,fade=out:870:30" \
  output.mp4
```

### Speed Up/Slow Down
```bash
# 2x speed
ffmpeg -i input.mp4 -filter:v "setpts=0.5*PTS" output.mp4

# 0.5x speed (slow motion)
ffmpeg -i input.mp4 -filter:v "setpts=2.0*PTS" output.mp4
```
