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

## Architecture

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

## Decisions

| Question | Decision |
|----------|----------|
| Audio streaming | Include audio for complete mirroring |
| Touch input | Plan for it, implement later |
| Quality auto-adjustment | Automatically lower quality on frame drops |
| Multiple devices | Single device streaming at a time |
| Android decoder | Klarity only, no FFmpeg subprocess fallback |
| iOS Swift integration | Swift-to-Node bridge |
| macOS permissions | User handles permission prompts |
| macOS entitlements | No special entitlements needed for iOS capture |

## References

- [Android Screen Streaming](../../plat/android/screen-streaming.md)
- [iOS Screen Streaming](../../plat/ios/screen-streaming.md)
- [Video Recording Design](./video-recording.md)
