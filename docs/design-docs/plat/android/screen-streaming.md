# Real-Time Screen Streaming Architecture

<kbd>⚠️ Partial</kbd>

> **Current state:** The Android `video-server` module (`android/video-server/`) is fully implemented — `VideoServer.kt` captures via VirtualDisplay, encodes H.264 with MediaCodec, and streams over a LocalSocket. The `videoRecording` MCP tool (record-to-file) uses this server and is <kbd>✅ Implemented</kbd> <kbd>🧪 Tested</kbd>.
>
> The **live IDE screen mirroring** pipeline (MCP video-stream relay → IDE DeviceScreenView with Klarity decoder) is in progress. Milestone 1 (video-server JAR) is complete; Milestones 2–5 are ongoing. See implementation plan below.
>
> See the [Status Glossary](../../status-glossary.md) for chip definitions.

Research and design for real-time screen streaming from Android devices to the IDE plugin, enabling interactive device mirroring at up to 60fps with <100ms latency.

See [Screen Streaming Overview](../../mcp/observe/screen-streaming.md) for the cross-platform architecture, video stream socket protocol, and quality presets.

## Goals

- Continuous live streaming for device mirroring in the IDE
- Up to 60fps frame rate
- <100ms end-to-end latency for interactive use
- Integrate with existing WebSocket-based architecture
- Support USB-connected physical devices and emulators

## Why a Separate Video Server?

The accessibility service **cannot** use VirtualDisplay for screen capture. A separate JAR running as shell user is required.

scrcpy achieves permission-less screen capture by running via `adb shell app_process` as **shell user (UID 2000)**, impersonating `com.android.shell`, and accessing hidden `DisplayManagerGlobal.createVirtualDisplay(displayIdToMirror)` via reflection. These privileges are not available to the accessibility service.

| Capability | Accessibility Service | Shell User (adb) |
|------------|----------------------|------------------|
| Hidden `DisplayManagerGlobal` APIs | No | Yes |
| `SurfaceControl.createDisplay()` | No | Yes |
| Screen capture without dialog | No | Yes |
| Impersonate `com.android.shell` | No | Yes |

The accessibility service can only do on-demand `takeScreenshot()` or request `MediaProjection` (which requires a user permission dialog **each session** and foreground service on Android 14+).

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│ Android Device                                                      │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Accessibility Service              Video Server JAR                │
│  (normal app process)               (shell user via adb)            │
│                                                                     │
│  ├─ View hierarchy extraction       ├─ VirtualDisplay capture      │
│  ├─ Gesture injection               ├─ MediaCodec H.264 encoding   │
│  ├─ Text input                      └─ LocalSocket streaming       │
│  └─ WebSocket server (:8765)                                       │
│                                                                     │
│  UID: app-specific                  UID: 2000 (shell)               │
│  Started by: Android system         Started by: adb shell           │
│  Permissions: Accessibility         Permissions: Shell (system)     │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

**Key Components:**

1. **Video Streaming Server** (new Android component)
   - Separate process running via `adb shell` (like scrcpy-server)
   - Small JAR pushed to `/data/local/tmp/automobile-video.jar`
   - Uses SurfaceControl/VirtualDisplay for capture (no permission dialog)
   - MediaCodec H.264 encoder
   - Writes to LocalSocket

2. **Video Stream Proxy** (new MCP server component)
   - Connects to video LocalSocket via ADB forward
   - Streams binary data to new Unix socket
   - Handles reconnection and device switching

3. **Video Stream Client** (new IDE plugin component)
   - Klarity library for H.264 decoding (FFmpeg via JNI)
   - Decodes frames directly to Skia Pixmap
   - Renders to Compose Canvas (no SwingPanel needed)

## Protocol Specification

### Video Stream Header (12 bytes)
```
┌─────────────────┬─────────────────┬─────────────────┐
│ codec_id (4)    │ width (4)       │ height (4)      │
│ big-endian      │ big-endian      │ big-endian      │
└─────────────────┴─────────────────┴─────────────────┘

codec_id values:
  0x68323634 = "h264" (H.264/AVC)
  0x68323635 = "h265" (H.265/HEVC)
```

### Packet Header (12 bytes per packet)
```
┌─────────────────────────────────────┬─────────────────┐
│ pts_and_flags (8)                   │ size (4)        │
│ big-endian                          │ big-endian      │
└─────────────────────────────────────┴─────────────────┘

pts_and_flags bit layout:
  bit 63: PACKET_FLAG_CONFIG (codec config data, not a frame)
  bit 62: PACKET_FLAG_KEY_FRAME (I-frame)
  bits 0-61: presentation timestamp in microseconds

Followed by `size` bytes of encoded frame data.
```

## MediaCodec Configuration

Recommended encoder settings for low-latency streaming:

```kotlin
val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
    // Bitrate: 8 Mbps default, adjustable
    setInteger(KEY_BIT_RATE, 8_000_000)

    // Frame rate hint (actual rate is variable)
    setInteger(KEY_FRAME_RATE, 60)

    // I-frame interval: 10 seconds (frequent enough for seeking)
    setInteger(KEY_I_FRAME_INTERVAL, 10)

    // Surface input (zero-copy from GPU)
    setInteger(KEY_COLOR_FORMAT, CodecCapabilities.COLOR_FormatSurface)

    // Repeat frame after 100ms of no changes (reduces idle bandwidth)
    setLong(KEY_REPEAT_PREVIOUS_FRAME_AFTER, 100_000)

    // Optional: request low latency mode (Android 11+)
    if (Build.VERSION.SDK_INT >= 30) {
        setInteger(KEY_LOW_LATENCY, 1)
    }

    // H.264 Baseline profile for maximum compatibility
    setInteger(KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline)
    setInteger(KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel31)

    // CBR for consistent bitrate
    setInteger(KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR)
}
```

## Bandwidth and Quality Tradeoffs

| Quality | Resolution | Bitrate | Bandwidth | Notes |
|---------|------------|---------|-----------|-------|
| Low | 540p | 2 Mbps | ~2.5 MB/s | Good for slow USB |
| Medium | 720p | 4 Mbps | ~5 MB/s | Balanced |
| High | 1080p | 8 Mbps | ~10 MB/s | Full HD |
| Ultra | Native | 16 Mbps | ~20 MB/s | 4K devices |

USB 2.0: ~30 MB/s theoretical, ~20 MB/s practical - all quality levels supported.

## Video Decoder: Klarity

We chose [Klarity](https://github.com/numq/Klarity) for H.264 decoding in the IDE plugin. It renders directly to Skiko Surface (Compose-native, no SwingPanel), supports composable overlays on video content, and bundles at ~20-30MB per platform.

Klarity decodes H.264 via FFmpeg/JNI, interprets frame data directly as Skia Pixmap via pointer (zero-copy), and renders to Compose Canvas.

## Implementation Plan

### Milestone 1: Proof of Concept
- [ ] Create automobile-video-server JAR with basic VirtualDisplay + MediaCodec
- [ ] Test manual execution via `adb shell`
- [ ] Verify H.264 stream output with ffplay

### Milestone 2: MCP Integration
- [ ] Add video stream socket server to daemon
- [ ] Implement ADB forward management
- [ ] Add start/stop video streaming commands

### Milestone 3: IDE Plugin Decoder
- [ ] Add Klarity dependency
- [ ] Implement VideoStreamClient
- [ ] Create frame-to-ImageBitmap pipeline
- [ ] Benchmark decode performance

### Milestone 4: Compose Integration
- [ ] Update DeviceScreenView for live frames
- [ ] Add FPS counter overlay
- [ ] Implement latency measurement
- [ ] Add quality/resolution controls

### Milestone 5: Polish
- [ ] Handle device disconnect/reconnect
- [ ] Add fallback to screenshot mode
- [ ] Automatic quality adjustment on frame drops
- [ ] Optimize memory (double buffering, frame pooling)

## References

### Android Screen Capture
- [scrcpy source code](https://github.com/Genymobile/scrcpy) - Reference implementation
- [Android MediaCodec docs](https://developer.android.com/reference/android/media/MediaCodec)
- [Android VirtualDisplay](https://developer.android.com/reference/android/hardware/display/VirtualDisplay)
- [Low-latency decoding in MediaCodec](https://source.android.com/docs/core/media/low-latency-media)
- [Android 14 MediaProjection requirements](https://developer.android.com/about/versions/14/changes/fgs-types-required)

### Video Decoding (Desktop)
- [Klarity](https://github.com/numq/Klarity) - Compose Desktop video player (chosen solution)
- [JetBrains Skiko](https://github.com/JetBrains/skiko) - Skia bindings for Kotlin
