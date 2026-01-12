# AutoMobile Demo Recording

Tools and scripts for creating side-by-side demo videos showing CLI + Android emulator interactions.

## Overview

This demo setup records:
- **Terminal**: Claude Code interacting with AutoMobile MCP server (asciicinema)
- **Device**: Android emulator screen during automation (AutoMobile videoRecording)
- **Output**: Side-by-side merged video showing both simultaneously

## Quick Start

```bash
# Make scripts executable
chmod +x demo/scripts/*.sh

# Record a demo (requires running emulator)
./demo/scripts/record-demo.sh my-demo

# Output files will be in demo/output/
```

## Workflow Options

### Option 1: Automated Recording (Recommended)

**Tools**: asciicinema, AutoMobile videoRecording, agg, ffmpeg

```bash
# One command to record everything
./demo/scripts/record-demo.sh clock-demo
```

**Process**:
1. Starts AutoMobile device screen recording
2. Records terminal with asciicinema
3. Stops device recording
4. Converts terminal recording (cast → gif → mp4)
5. Merges videos side-by-side with ffmpeg

**Pros**:
- Fully automated workflow
- Synchronized recordings
- High quality output

**Cons**:
- Requires all tools installed
- Two-step conversion for terminal (cast → gif → mp4)

### Option 2: Manual Recording + Merge

**Record separately**, then merge:

```bash
# 1. Record terminal
asciicinema rec terminal.cast

# 2. Record device (in another terminal)
# Start recording
bun run src/index.ts --cli videoRecording --action start --platform android --outputName demo
# ... perform actions ...
# Stop recording
bun run src/index.ts --cli videoRecording --action stop --platform android --recordingId <id>

# 3. Convert terminal to video
agg terminal.cast terminal.gif
ffmpeg -i terminal.gif -pix_fmt yuv420p terminal.mp4

# 4. Merge
./demo/scripts/merge-videos.sh terminal.mp4 device.mp4 final.mp4
```

**Pros**:
- Full control over timing
- Can re-record either side independently

**Cons**:
- Manual synchronization required
- More steps

### Option 3: Direct Terminal Video Recording

**Tools**: ttyd, ffmpeg (skip asciicinema)

```bash
# Record terminal directly as video
ffmpeg -video_size 1920x1080 -framerate 30 -f avfoundation -i "1" terminal.mp4

# Record device with AutoMobile
# ... same as above ...

# Merge
./demo/scripts/merge-videos.sh terminal.mp4 device.mp4 final.mp4
```

**Pros**:
- Skip cast → gif → mp4 conversion
- Native video quality

**Cons**:
- Larger file sizes
- Platform-specific screen capture

### Option 4: GIF-Only Output

**For lightweight demos**:

```bash
# Record with asciicinema
asciicinema rec demo.cast

# Convert to GIF only
agg demo.cast demo.gif

# Record device
# ... device recording ...

# Convert device to GIF
ffmpeg -i device.mp4 -vf "fps=10,scale=540:-1:flags=lanczos" device.gif

# Merge GIFs (if needed)
ffmpeg -i demo.gif -i device.gif -filter_complex "[0][1]hstack" output.gif
```

**Pros**:
- Smaller file sizes
- Easy to embed in docs

**Cons**:
- Quality loss
- Limited frame rate

## Tool Alternatives

### Terminal Recording

| Tool | Output | Pros | Cons |
|------|--------|------|------|
| **asciicinema** | .cast (JSON) | Editable, small size | Requires conversion |
| **termtosvg** | .svg | Vector graphics | Limited playback |
| **asciinema-automation** | .cast | Scriptable | Extra dependency |
| **vhs** (Charm) | .mp4, .gif | Direct video output | Requires Go |
| **ttyd + ffmpeg** | .mp4 | Native video | Platform-specific |

### Video Conversion

| Tool | Purpose | Notes |
|------|---------|-------|
| **agg** | cast → gif | Fast, good quality |
| **asciicast2gif** | cast → gif | Alternative to agg |
| **ffmpeg** | Universal converter | Swiss army knife |
| **ImageMagick** | gif manipulation | For optimization |

### Video Merging

| Method | Command | Use Case |
|--------|---------|----------|
| **Horizontal stack** | `hstack` | Side-by-side |
| **Vertical stack** | `vstack` | Top/bottom |
| **Picture-in-picture** | `overlay` | Device in corner |
| **Grid layout** | `xstack` | Multiple devices |

## Example Layouts

### Side-by-Side (Current)

```
┌─────────────────┬─────────┐
│                 │         │
│   Terminal      │ Device  │
│   (CLI)         │ Screen  │
│                 │         │
└─────────────────┴─────────┘
     2/3 width    1/3 width
```

### Picture-in-Picture

```
┌─────────────────────────┐
│                         │
│      Terminal           │
│      (CLI)        ┌───┐ │
│                   │Dev│ │
│                   └───┘ │
└─────────────────────────┘
```

### Vertical Stack

```
┌─────────────────────────┐
│      Terminal           │
│      (CLI)              │
├─────────────────────────┤
│      Device             │
│      Screen             │
└─────────────────────────┘
```

## Scripts

### `record-demo.sh`

Main orchestration script. Records both terminal and device, then merges.

```bash
./demo/scripts/record-demo.sh [demo-name]
```

**Output**:
- `{demo-name}.cast` - Terminal recording
- `{demo-name}.gif` - Terminal as GIF
- `{demo-name}-cli.mp4` - Terminal as video
- `{demo-name}-device.mp4` - Device recording
- `{demo-name}-final.mp4` - Merged video

### `simulate-claude-code.sh`

Simulates Claude Code interface for terminal recording.

**Features**:
- Animated typing
- MCP tool call display
- Progress indicators
- Color-coded output

### `merge-videos.sh`

Standalone video merger.

```bash
./demo/scripts/merge-videos.sh <cli-video> <device-video> [output]
```

## Requirements

### Essential
- **Bun** - Run AutoMobile
- **ffmpeg** - Video processing
- **asciicinema** - Terminal recording
- **agg** - Cast to GIF conversion

### Installation

```bash
# macOS
brew install ffmpeg asciicinema agg

# Linux
apt install ffmpeg asciicinema
cargo install agg

# Bun (if not installed)
curl -fsSL https://bun.sh/install | bash
```

## Configuration

### Video Quality

Edit `record-demo.sh` to adjust quality:

```bash
# Device recording quality
--qualityPreset high    # Options: low, medium, high
--maxDuration 120       # Max seconds

# Terminal GIF quality
--font-size 14          # Terminal font size
--theme monokai        # Color theme

# Final video encoding
-crf 23                # Quality (lower = better, 18-28 range)
-preset medium         # Speed (ultrafast to veryslow)
```

### Layout Dimensions

Edit `merge-videos.sh` to change layout:

```bash
TARGET_HEIGHT=1080        # Final height
CLI_TARGET_WIDTH=1280     # Terminal width
DEVICE_TARGET_WIDTH=640   # Device width
```

## Advanced Workflows

### Multi-Device Recording

Record multiple devices side-by-side:

```bash
# Start recordings for device A and B
# ... record actions ...
# Merge with xstack filter
ffmpeg -i cli.mp4 -i deviceA.mp4 -i deviceB.mp4 \
  -filter_complex "[1][2]hstack[devices];[0][devices]vstack" \
  output.mp4
```

### Add Narration

Record audio separately and combine:

```bash
# Record video (muted)
./demo/scripts/record-demo.sh demo

# Record audio
arecord -f cd narration.wav

# Combine
ffmpeg -i demo-final.mp4 -i narration.wav \
  -c:v copy -c:a aac -shortest \
  demo-with-audio.mp4
```

### Live Demo Recording

Use OBS Studio for live recording with multiple sources:

```bash
# Install OBS Studio
brew install obs

# Add sources:
# 1. Terminal window capture
# 2. Android emulator window capture
# 3. Webcam (optional)

# Record directly to MP4
```

## Troubleshooting

### "Command not found: agg"

```bash
# Install agg
cargo install --git https://github.com/asciinema/agg
```

### Device video not synchronized

Adjust timing in `simulate-claude-code.sh`:

```bash
# Increase sleep delays between actions
sleep 2  # Wait 2 seconds between interactions
```

### Video quality issues

Increase bitrate and quality:

```bash
# In merge-videos.sh
-crf 18              # Better quality
-preset slower       # Better compression
```

### Videos have different lengths

Use `-shortest` flag (already default) or trim:

```bash
# Trim longer video
ffmpeg -i long.mp4 -t 60 -c copy trimmed.mp4
```

## Examples

See `demo/examples/` for sample outputs:
- `clock-demo-final.mp4` - Full Clock app exploration
- `timer-demo-final.mp4` - Timer interaction
- `alarm-demo-final.mp4` - Alarm setup

## Contributing

To create a new demo:

1. Create scenario script in `demo/scripts/scenarios/`
2. Update `simulate-claude-code.sh` to use scenario
3. Run `record-demo.sh` with scenario name
4. Add output to `demo/examples/`

## License

Part of AutoMobile project. See main repository for license.
