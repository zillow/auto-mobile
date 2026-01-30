# Real-Time Screen Streaming Architecture

Research and design for real-time screen streaming from Android devices to the IDE plugin, enabling interactive device mirroring at up to 60fps with <100ms latency.

## Goals

- Continuous live streaming for device mirroring in the IDE
- Up to 60fps frame rate
- <100ms end-to-end latency for interactive use
- Integrate with existing WebSocket-based architecture
- Support USB-connected physical devices and emulators

## Background

### Current Screenshot Approach

The current implementation captures screenshots on-demand:

1. **Device (AccessibilityService)**: `AccessibilityService.takeScreenshot()` → Hardware Bitmap → JPEG → Base64
2. **Transport**: Base64-encoded JPEG sent via WebSocket JSON message
3. **MCP Server**: Receives JSON, forwards to observation stream socket
4. **IDE Plugin**: Receives JSON, decodes Base64 → JPEG → `ImageBitmap` via Skia

**Problems with current approach:**
- On-demand capture can catch mid-transition frames during animations
- Base64 encoding adds ~33% overhead to payload size
- JPEG encoding/decoding adds latency at both ends
- No frame synchronization or timing control

### How scrcpy Works

scrcpy achieves 30-120fps with 35-70ms latency using:

1. **Screen Capture**: VirtualDisplay + SurfaceControl (not MediaProjection)
   - Runs as shell user via `adb shell` which bypasses permission dialogs
   - Uses `DisplayManager.createVirtualDisplay()` or `SurfaceControl.createDisplay()`
   - Renders screen content to a Surface owned by MediaCodec

2. **Encoding**: MediaCodec hardware encoder
   - H.264 Baseline profile (or H.265/AV1)
   - Surface input (zero-copy from GPU)
   - Variable frame rate (only encodes when content changes)
   - `KEY_REPEAT_PREVIOUS_FRAME_AFTER` for idle frames

3. **Transport**: LocalSocket via ADB tunnel
   - Separate sockets for video, audio, and control
   - Binary protocol: 12-byte header + raw codec packets
   - Frame metadata: 8-byte PTS + 4-byte size per packet

4. **Decoding**: FFmpeg on desktop (C/C++)
   - Hardware-accelerated decoding when available

## Architecture Options

### Option A: scrcpy-style Binary Stream (Recommended)

Add a separate binary video channel alongside the existing WebSocket connection.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Android Device                                                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐     ┌───────────────────────────────────┐ │
│  │ Accessibility Service│     │ Video Streaming Server (shell)    │ │
│  │                      │     │                                   │ │
│  │ - View hierarchy     │     │ VirtualDisplay → MediaCodec       │ │
│  │ - Gestures           │     │         ↓                         │ │
│  │ - WebSocket (JSON)   │     │ LocalSocket (binary H.264 stream) │ │
│  │   port 8765          │     │   "automobile_video"              │ │
│  └──────────────────────┘     └───────────────────────────────────┘ │
│           ↓                              ↓                          │
│    adb forward tcp:8765           adb forward tcp:8766              │
└─────────────────────────────────────────────────────────────────────┘
           ↓                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ MCP Server (Node.js)                                                │
├─────────────────────────────────────────────────────────────────────┤
│  WebSocket client                  TCP socket to video stream       │
│       ↓                                   ↓                         │
│  Unix socket:                      Unix socket:                     │
│  observation-stream.sock           video-stream.sock                │
│  (hierarchy, navigation)           (raw H.264 packets)              │
└─────────────────────────────────────────────────────────────────────┘
           ↓                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│ IDE Plugin (Kotlin/JVM)                                             │
├─────────────────────────────────────────────────────────────────────┤
│  Unix socket client                Unix socket client               │
│  (existing)                        (new video stream client)        │
│       ↓                                   ↓                         │
│  Hierarchy updates                 Klarity (FFmpeg + Skiko)         │
│                                           ↓                         │
│                                    H.264 → Pixmap → Compose Canvas  │
│                                           ↓                         │
│                              DeviceScreenView (Compose Desktop)     │
└─────────────────────────────────────────────────────────────────────┘
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
   - Composables can overlay on video content

**Advantages:**
- Lowest latency (direct binary stream)
- Highest frame rate (up to 60fps)
- Most similar to proven scrcpy architecture
- No Base64/JSON overhead for video data
- Native Compose integration via Klarity

**Disadvantages:**
- Requires separate server component (JAR pushed via ADB)
- Adds Klarity/FFmpeg native dependency to IDE plugin (~20-30MB per platform)
- More complex multi-socket architecture

### Option B: WebSocket Binary Frames

Use WebSocket binary frames for video, keeping single connection.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Android Device - Accessibility Service                              │
├─────────────────────────────────────────────────────────────────────┤
│  VirtualDisplay → MediaCodec → WebSocket binary frames              │
│                        ↓                                            │
│           Interleaved with JSON text frames (hierarchy, etc.)       │
└─────────────────────────────────────────────────────────────────────┘
```

**Problems:**
- MediaProjection required in-process (needs permission dialog each session)
- Foreground service required on Android 14+ (`FOREGROUND_SERVICE_MEDIA_PROJECTION`)
- Permission cannot be persisted across sessions
- Ktor WebSocket may not handle high-throughput binary efficiently

**Verdict:** Not recommended due to permission friction and architecture limitations.

### Option C: MJPEG Streaming (Simpler Alternative)

Stream compressed JPEG frames instead of H.264 encoded video.

```
AccessibilityService.takeScreenshot() → JPEG bytes → WebSocket binary
```

**Advantages:**
- Simpler: no MediaCodec, no video decoder needed
- No additional dependencies (Skia already decodes JPEG)
- Works within existing accessibility service

**Disadvantages:**
- Higher bandwidth (JPEG less efficient than H.264)
- Higher CPU usage (JPEG compression per frame)
- Probably limited to ~15-20fps realistically
- Still requires foreground service for continuous capture

**Verdict:** Viable for 15fps "inspector" use case, but won't achieve 60fps/<100ms goal.

## Recommended Architecture: Option A

### Phase 1: Video Streaming Server (Android)

Create a minimal JAR similar to scrcpy-server:

```kotlin
// automobile-video-server/src/main/kotlin/VideoServer.kt

class VideoServer(private val socketName: String) {
    private lateinit var virtualDisplay: VirtualDisplay
    private lateinit var mediaCodec: MediaCodec
    private lateinit var serverSocket: LocalServerSocket

    fun start(width: Int, height: Int, bitrate: Int, fps: Int) {
        // 1. Create MediaCodec encoder
        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height)
        format.setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
        format.setInteger(MediaFormat.KEY_FRAME_RATE, fps)
        format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 10)
        format.setInteger(MediaFormat.KEY_COLOR_FORMAT,
            MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
        format.setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 100_000) // 100ms

        mediaCodec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        mediaCodec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)

        val inputSurface = mediaCodec.createInputSurface()

        // 2. Create VirtualDisplay rendering to encoder's surface
        virtualDisplay = DisplayManager.createVirtualDisplay(
            "automobile-mirror",
            width, height,
            displayId = 0,
            surface = inputSurface
        )

        // 3. Start encoding and streaming
        mediaCodec.start()
        streamLoop()
    }

    private fun streamLoop() {
        serverSocket = LocalServerSocket(socketName)
        val client = serverSocket.accept()
        val fd = client.fileDescriptor

        // Write video header: codec_id (4) + width (4) + height (4)
        writeHeader(fd, codecId, width, height)

        val bufferInfo = MediaCodec.BufferInfo()
        while (!stopped) {
            val index = mediaCodec.dequeueOutputBuffer(bufferInfo, -1)
            if (index >= 0) {
                val buffer = mediaCodec.getOutputBuffer(index)
                writePacket(fd, buffer, bufferInfo)
                mediaCodec.releaseOutputBuffer(index, false)
            }
        }
    }
}
```

**Launch via ADB:**
```bash
# Push the JAR
adb push automobile-video.jar /data/local/tmp/

# Start the server
adb shell CLASSPATH=/data/local/tmp/automobile-video.jar \
    app_process / dev.jasonpearson.automobile.video.VideoServer \
    --width 1080 --height 2400 --bitrate 8000000 --fps 60
```

### Phase 2: MCP Server Video Proxy

Add video stream handling to the daemon:

```typescript
// src/daemon/videoStreamSocketServer.ts

export class VideoStreamSocketServer {
    private videoSocket: net.Socket | null = null;
    private clients: Set<net.Socket> = new Set();

    async connectToDevice(device: BootedDevice) {
        // Forward video socket from device
        await this.adb.forward(device, 'tcp:8766', 'localabstract:automobile_video');

        // Connect to forwarded port
        this.videoSocket = net.connect(8766, 'localhost');
        this.videoSocket.on('data', (data) => this.broadcast(data));
    }

    private broadcast(data: Buffer) {
        for (const client of this.clients) {
            client.write(data);
        }
    }
}
```

### Phase 3: IDE Plugin Video Decoder

Add Klarity dependency for Compose-native video decoding:

```kotlin
// ide-plugin/build.gradle.kts
repositories {
    maven("https://jitpack.io")
}

dependencies {
    // Klarity - Compose Desktop video player using FFmpeg + Skiko
    implementation("com.github.numq:Klarity:1.1.0")
}
```

Klarity handles H.264 decoding via native FFmpeg and renders directly to Skiko surfaces, eliminating the need for SwingPanel or BufferedImage conversions.

```kotlin
// VideoStreamClient.kt

class VideoStreamClient(
    private val socketPath: Path,
    private val scope: CoroutineScope
) {
    private val _frames = MutableSharedFlow<ImageBitmap>(replay = 1)
    val frames: SharedFlow<ImageBitmap> = _frames.asSharedFlow()

    private var decoder: Decoder? = null

    fun start() {
        scope.launch(Dispatchers.IO) {
            val socket = SocketChannel.open(UnixDomainSocketAddress.of(socketPath))

            // Read stream header (codec, width, height)
            val header = readHeader(socket)

            // Initialize Klarity decoder
            decoder = Decoder.create(
                codec = Codec.H264,
                width = header.width,
                height = header.height
            )

            // Decode loop
            while (isActive) {
                val packet = readPacket(socket)
                decoder?.decode(packet)?.let { frame ->
                    _frames.emit(frame.toImageBitmap())
                }
            }
        }
    }

    fun stop() {
        decoder?.close()
    }
}
```

### Phase 4: Compose Integration

Update DeviceScreenView to use live video frames. Klarity renders directly to Compose Canvas, allowing UI overlays on the video content.

```kotlin
@Composable
fun DeviceScreenView(
    videoClient: VideoStreamClient?,
    screenshotData: ByteArray?, // Fallback for static screenshots
    hierarchy: UIElementInfo?,
    selectedElementId: String?,
    // ... existing params
) {
    var currentFrame by remember { mutableStateOf<ImageBitmap?>(null) }
    var isStreaming by remember { mutableStateOf(false) }

    // Subscribe to video frames from Klarity
    LaunchedEffect(videoClient) {
        videoClient?.frames?.collect { frame ->
            currentFrame = frame
            isStreaming = true
        }
    }

    // Prefer live frame, fallback to screenshot
    val displayImage = currentFrame ?: screenshotData?.let {
        remember(it) { Image.makeFromEncoded(it).toComposeImageBitmap() }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // Video/screenshot layer
        displayImage?.let { bitmap ->
            Image(
                bitmap = bitmap,
                contentDescription = "Device screen",
                modifier = Modifier.fillMaxSize()
            )
        }

        // Overlay layer (element highlights, selection, etc.)
        // Klarity's direct Skiko rendering means no SwingPanel blocking overlays
        Canvas(modifier = Modifier.fillMaxSize()) {
            // Draw selection rectangles, hover highlights, etc.
            selectedElement?.let { drawSelectionOverlay(it) }
        }

        // FPS indicator when streaming
        if (isStreaming) {
            FpsIndicator(modifier = Modifier.align(Alignment.TopEnd))
        }
    }
}
```

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

USB 2.0: ~30 MB/s theoretical, ~20 MB/s practical → All quality levels supported

## Video Decoding Options Research

We evaluated several options for H.264 decoding in the IDE plugin:

| Option | Size | Pros | Cons |
|--------|------|------|------|
| **Klarity** ✓ | ~20-30MB/platform | Compose-native, Skiko rendering, overlay support | Newer library (v1.1.0) |
| **JavaCV** | ~50-300MB | Proven, well-documented | Large, requires BufferedImage conversion |
| **JCEF + WebCodecs** | 0 (bundled) | Already in IntelliJ | H.264 disabled by default in CEF |
| **VLCJ** | ~100MB + VLC | Full-featured, proven | Requires VLC installed or bundled |
| **FFmpeg subprocess** | 0 in plugin | No native deps | Requires FFmpeg on PATH |
| **ffmpeg4java (FFM API)** | Small | Modern, no JNI | Requires Java 22+ (JBR is Java 21) |
| **JCodec** | ~5MB | Pure Java, no natives | 10x slower than FFmpeg |

### Decision: Klarity

We chose [Klarity](https://github.com/numq/Klarity) for the following reasons:

1. **Compose-native**: Renders directly to Skiko Surface, no SwingPanel needed
2. **Overlay support**: Composables can be drawn on top of video content
3. **Reasonable size**: ~20-30MB per platform (vs 300MB for JavaCV full bundle)
4. **Active development**: v1.1.0 released with rendering optimizations
5. **Platform support**: Windows x64, Linux x64, macOS x64/arm64

#### How Klarity Works

1. **Decoding**: FFmpeg via JNI decodes H.264 to raw frames
2. **Memory**: Decoded frame data is directly interpreted as Skia Pixmap via pointer
3. **Rendering**: Written to Skia Surface and rendered to Compose Canvas
4. **Zero-copy path**: No BufferedImage or intermediate conversions

#### Limitations

- Hardware decoding available but bottlenecked by CPU-bound Skia rendering
- Relatively new library, less battle-tested than JavaCV

### Alternatives Considered

**FFmpeg subprocess + pipe**: Could work as a fallback if Klarity has issues. Run FFmpeg as external process, pipe RGBA frames to JVM. Zero plugin dependencies but requires FFmpeg installed.

**JCEF + WebCodecs**: Interesting future option. JCEF is bundled with IntelliJ, and WebCodecs can decode H.264. However, CEF has proprietary codecs disabled by default (hardware decoding via OS APIs may work on Windows/macOS).

**Java FFM API**: Once JetBrains Runtime upgrades to Java 22+, the Foreign Function & Memory API would provide FFmpeg bindings without JNI overhead. Currently blocked by JBR being Java 21.

## Dependencies

### IDE Plugin (Kotlin/JVM)

**Klarity (Compose Desktop video player):**
```kotlin
// build.gradle.kts
repositories {
    maven("https://jitpack.io")
}

dependencies {
    // Klarity - FFmpeg + PortAudio + Skiko integration
    implementation("com.github.numq:Klarity:1.1.0")
}
```

Klarity bundles platform-specific native libraries:
- `klarity-windows-x64.jar` (~20-30MB)
- `klarity-linux-x64.jar` (~20-30MB)
- `klarity-macos-x64.jar` (~20-30MB)
- `klarity-macos-arm64.jar` (~20-30MB)

**Note:** No FFmpeg subprocess fallback is planned. Klarity provides sufficient stability and Compose integration for our needs. If video streaming fails, we fall back to the existing screenshot-based observation mode.

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
- [ ] Add JavaCV dependency
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

## Open Questions

1. ~~**VirtualDisplay vs MediaProjection**: scrcpy uses VirtualDisplay because it runs as shell user. Can we do the same, or do we need MediaProjection within the accessibility service?~~
   **Resolved**: Separate video server JAR is required. See "Why a Separate Video Server?" section below.

2. ~~**Permission persistence**: If we use MediaProjection, can we request permission once at service start and keep it for the session?~~
   **Resolved**: Not using MediaProjection. The video server runs as shell user and doesn't need it.

3. ~~**JavaCV bundle size**: The full javacv-platform is ~300MB. Is that acceptable for an IDE plugin?~~
   **Resolved**: Using Klarity instead (~20-30MB per platform).

4. ~~**Fallback strategy**: When video streaming fails (no encoder, connection issues), how seamlessly should we fall back to screenshot mode?~~
   **Resolved**: Automatically detect stream failure and switch to existing screenshot-based observation. Also automatically lower quality when frame drops are detected.

5. ~~**Klarity stability**: Klarity is relatively new (v1.1.0). Should we implement the FFmpeg subprocess fallback from day one, or wait to see if issues arise?~~
   **Resolved**: Use Klarity only, no FFmpeg subprocess fallback. Klarity provides the Compose-native integration we need.

6. ~~**Multiple devices**: Should video streaming support multiple simultaneous devices from the start, or add that in a later phase?~~
   **Resolved**: Single device streaming at a time. This simplifies the architecture and covers the primary use case.

## Why a Separate Video Server?

The accessibility service **cannot** use VirtualDisplay for screen capture. A separate JAR running as shell user is required.

### The Problem

scrcpy achieves permission-less screen capture by:
1. Running via `adb shell app_process` as **shell user (UID 2000)**
2. Impersonating `com.android.shell` package
3. Accessing hidden `DisplayManagerGlobal.createVirtualDisplay(displayIdToMirror)` via reflection

These privileges are not available to the accessibility service, which runs as a normal app process.

### What the Accessibility Service Cannot Do

| Capability | Accessibility Service | Shell User (adb) |
|------------|----------------------|------------------|
| Hidden `DisplayManagerGlobal` APIs | ❌ No | ✅ Yes |
| `SurfaceControl.createDisplay()` | ❌ No | ✅ Yes |
| Screen capture without dialog | ❌ No | ✅ Yes |
| Impersonate `com.android.shell` | ❌ No | ✅ Yes |

### What the Accessibility Service CAN Do

- `AccessibilityService.takeScreenshot()` - Works but is on-demand, not continuous
- Request `MediaProjection` - Requires user permission dialog **each session** and foreground service on Android 14+

### Confirmed Architecture

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

This matches scrcpy's proven architecture and avoids MediaProjection permission friction entirely.

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
- [Skiko issue #508: AVFrame to Skia Image](https://github.com/JetBrains/skiko/issues/508)
- [JavaCV FFmpeg integration](https://github.com/bytedeco/javacv) - Alternative option
- [VLCJ](https://github.com/caprica/vlcj) - VLC Java bindings

### IntelliJ Platform
- [JCEF Embedded Browser](https://plugins.jetbrains.com/docs/intellij/embedded-browser-jcef.html)
- [JetBrains Runtime](https://github.com/JetBrains/JetBrainsRuntime)
- [Compose Multiplatform VideoPlayer (experimental)](https://github.com/JetBrains/compose-multiplatform/tree/master/experimental/components/VideoPlayer)
