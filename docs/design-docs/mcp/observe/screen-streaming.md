# Real-Time Screen Streaming Architecture

Real-time screen streaming from mobile devices to the IDE plugin, enabling interactive device mirroring at up to 60fps with <100ms latency.

## Goals

- Continuous live streaming for device mirroring in the IDE
- Up to 60fps frame rate
- <100ms end-to-end latency for interactive use
- Support USB-connected physical devices and emulators/simulators
- Include audio streaming for complete mirroring
- Integrate with existing observation architecture
- Single device streaming at a time (no multi-device simultaneous streams)

## Current State

Screenshots are captured on-demand when hierarchy updates occur:

1. Device captures screenshot (JPEG)
2. Base64 encoded and sent via WebSocket/JSON
3. MCP server forwards to observation stream socket
4. IDE plugin decodes and displays

**Problems:**
- On-demand capture can catch mid-transition frames during animations
- Base64 encoding adds ~33% payload overhead
- No continuous streaming for live interaction

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Mobile Device                                                        │
│                                                                      │
│  Platform-specific capture mechanism                                 │
│  (see platform docs for details)                                     │
│                                                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ MCP Server (Node.js)                                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Existing sockets:                    New socket:                    │
│  ├─ auto-mobile.sock (MCP proxy)      └─ video-stream.sock          │
│  ├─ observation-stream.sock              (binary frame data)        │
│  └─ performance-push.sock                                           │
│                                                                      │
│  VideoStreamManager                                                  │
│  ├─ Platform detection                                               │
│  ├─ Capture process lifecycle                                        │
│  ├─ Frame forwarding to clients                                      │
│  └─ Fallback to screenshot mode                                      │
│                                                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ IDE Plugin (Kotlin/JVM)                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  VideoStreamClient                                                   │
│  ├─ Unix socket connection to video-stream.sock                      │
│  ├─ Platform-specific frame decoding                                 │
│  └─ Frame → ImageBitmap conversion                                   │
│                                                                      │
│  DeviceScreenView (Compose Desktop)                                  │
│  ├─ Live frame display                                               │
│  ├─ Overlay support (hierarchy highlights, selection)                │
│  ├─ FPS indicator                                                    │
│  └─ Fallback to static screenshots                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Platform-Specific Capture

The capture mechanism differs significantly between platforms:

| Platform | Capture Location | Frame Format | Decoder Needed |
|----------|-----------------|--------------|----------------|
| Android | On device | H.264 encoded | Yes (Klarity) |
| iOS | On Mac | Raw BGRA | No |

See platform-specific documentation for implementation details:
- **[Android Screen Streaming](../../plat/android/screen-streaming.md)** - VirtualDisplay + MediaCodec via shell-user JAR
- **[iOS Screen Streaming](../../plat/ios/screen-streaming.md)** - AVFoundation + ScreenCaptureKit on macOS

## Video Stream Socket Protocol

New Unix socket: `~/.auto-mobile/video-stream.sock`

### Connection Handshake

```
Client → Server: { "command": "subscribe", "deviceId": "<optional>" }
Server → Client: { "type": "stream_started", "deviceId": "...", "platform": "android|ios" }
```

### Frame Data

Binary frames with platform-specific headers:

**Android (H.264):**
```
┌─────────────────┬─────────────────┬─────────────────┐
│ codec_id (4)    │ width (4)       │ height (4)      │
└─────────────────┴─────────────────┴─────────────────┘
Then per-packet: pts_flags (8) + size (4) + H.264 data
```

**iOS (Raw BGRA):**
```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ width (4)       │ height (4)      │ bytesPerRow (4) │ timestamp (4)   │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
Then: height * bytesPerRow bytes of BGRA pixel data
```

### Stream Control

```
Client → Server: { "command": "set_quality", "quality": "low|medium|high" }
Client → Server: { "command": "unsubscribe" }
Server → Client: { "type": "stream_stopped", "reason": "..." }
```

## IDE Plugin Frame Handling

```kotlin
class VideoStreamClient(private val socketPath: Path) {
    private val _frames = MutableSharedFlow<ImageBitmap>(replay = 1)
    val frames: SharedFlow<ImageBitmap> = _frames.asSharedFlow()

    fun start(deviceId: String, platform: Platform) {
        scope.launch(Dispatchers.IO) {
            val socket = connectToSocket(socketPath)
            subscribe(socket, deviceId)

            when (platform) {
                Platform.ANDROID -> decodeH264Frames(socket)  // Uses Klarity
                Platform.IOS -> decodeRawFrames(socket)       // Direct BGRA
            }
        }
    }

    private suspend fun decodeRawFrames(socket: SocketChannel) {
        while (isActive) {
            val header = readFrameHeader(socket)
            val pixels = readPixelData(socket, header)
            val bitmap = createImageBitmap(pixels, header.width, header.height)
            _frames.emit(bitmap)
        }
    }
}
```

## Quality Presets

| Quality | Android Bitrate | Resolution | Target FPS |
|---------|-----------------|------------|------------|
| Low | 2 Mbps | 540p | 30 |
| Medium | 4 Mbps | 720p | 60 |
| High | 8 Mbps | 1080p | 60 |

iOS streams raw frames, so quality is controlled by resolution scaling only.

## Fallback Behavior

When video streaming is unavailable:
1. Detect stream failure or unsupported device
2. Automatically switch to existing screenshot-based observation
3. Display indicator in UI showing "Screenshot mode"
4. Retry video streaming on user request or device reconnection

## Implementation Phases

### Phase 1: Android Video Streaming
- [ ] Video server JAR (VirtualDisplay + MediaCodec)
- [ ] MCP server video socket
- [ ] Klarity integration in IDE plugin
- [ ] Basic DeviceScreenView updates

### Phase 2: iOS Video Streaming
- [ ] Swift helper for AVFoundation capture (via Swift-to-Node bridge)
- [ ] ScreenCaptureKit for simulator
- [ ] Raw frame path in IDE plugin

### Phase 3: Audio Streaming
- [ ] Android audio capture (AudioRecord or AudioPlaybackCapture)
- [ ] iOS audio capture (AVCaptureDevice audio channels)
- [ ] Audio playback in IDE plugin

### Phase 4: Polish
- [ ] Automatic quality adjustment based on frame rate
- [ ] Quality controls UI
- [ ] FPS/latency overlay
- [ ] Graceful fallback handling

### Future: Touch Input (Planned, Not Implemented)
- [ ] Click-to-tap on video view
- [ ] Drag gestures
- [ ] Keyboard input forwarding

## Decisions

| Question | Decision |
|----------|----------|
| Audio streaming | ✅ Include audio for complete mirroring |
| Touch input | ✅ Plan for it, implement later |
| Quality auto-adjustment | ✅ Automatically lower quality on frame drops |
| Multiple devices | ✅ Single device streaming at a time |
| Android decoder | ✅ Klarity only, no FFmpeg subprocess fallback |
| iOS Swift integration | ✅ Swift-to-Node bridge |
| macOS permissions | ✅ User handles permission prompts |
| macOS entitlements | ✅ No special entitlements needed for iOS capture |

## References

- [Android Screen Streaming](../../plat/android/screen-streaming.md)
- [iOS Screen Streaming](../../plat/ios/screen-streaming.md)
- [Video Recording Design](./video-recording.md)
