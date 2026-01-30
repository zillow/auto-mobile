# iOS Real-Time Screen Streaming Architecture

Research and design for real-time screen streaming from iOS devices/simulators to the IDE plugin.

## Goals

- Continuous live streaming for device mirroring in the IDE
- Up to 60fps frame rate
- <100ms end-to-end latency for interactive use
- Support USB-connected physical devices and simulators
- macOS only (iOS development requires macOS)

## Key Difference from Android

Unlike Android (which requires a shell-user JAR running on device), iOS devices expose their screen as a **video capture source** accessible from macOS via AVFoundation. No app or daemon needs to run on the iOS device itself.

| Aspect | Android | iOS |
|--------|---------|-----|
| Capture location | On device (shell JAR) | On Mac (AVFoundation) |
| Requires app on device | Yes (video server) | No |
| Transport | ADB socket → MCP server | Direct macOS API |
| Encoding | MediaCodec H.264 on device | Already decoded frames from macOS |
| Decoding | Klarity in IDE plugin | Not needed (raw frames) |

## Physical iOS Devices (USB)

### How It Works

iOS devices connected via USB appear as external video capture devices on macOS. This is the same mechanism QuickTime Player uses for screen mirroring.

```
┌─────────────────────────────────────────────────────────────────┐
│ macOS                                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐     ┌──────────────────────────────────────┐   │
│  │ iOS Device  │     │ MCP Server (Node.js)                 │   │
│  │ via USB     │────▶│                                      │   │
│  │             │     │ AVFoundation capture                 │   │
│  └─────────────┘     │     ↓                                │   │
│                      │ Raw frames (CVPixelBuffer)           │   │
│                      │     ↓                                │   │
│                      │ Unix socket: video-stream.sock       │   │
│                      └──────────────────────────────────────┘   │
│                                    ↓                            │
│                      ┌──────────────────────────────────────┐   │
│                      │ IDE Plugin (Kotlin/JVM)              │   │
│                      │                                      │   │
│                      │ Unix socket client                   │   │
│                      │     ↓                                │   │
│                      │ Raw frame → ImageBitmap              │   │
│                      │     ↓                                │   │
│                      │ DeviceScreenView (Compose Desktop)   │   │
│                      └──────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
         ▲
         │ USB
         │
┌─────────────────┐
│ iPhone/iPad     │
│ (no app needed) │
└─────────────────┘
```

### Implementation

#### Step 1: Enable Screen Capture Devices

```swift
import CoreMediaIO
import AVFoundation

func enableScreenCaptureDevices() {
    var prop = CMIOObjectPropertyAddress(
        mSelector: CMIOObjectPropertySelector(kCMIOHardwarePropertyAllowScreenCaptureDevices),
        mScope: CMIOObjectPropertyScope(kCMIOObjectPropertyScopeGlobal),
        mElement: CMIOObjectPropertyElement(kCMIOObjectPropertyElementMain)
    )
    var allow: UInt32 = 1
    CMIOObjectSetPropertyData(
        CMIOObjectID(kCMIOObjectSystemObject),
        &prop,
        0,
        nil,
        UInt32(MemoryLayout<UInt32>.size),
        &allow
    )
}
```

#### Step 2: Discover iOS Devices

```swift
// Warmup required - without this, notifications won't fire
let _ = AVCaptureDevice.devices()

// Listen for device connections
NotificationCenter.default.addObserver(
    forName: .AVCaptureDeviceWasConnected,
    object: nil,
    queue: nil
) { notification in
    guard let device = notification.object as? AVCaptureDevice else { return }
    if device.deviceType == .external && device.hasMediaType(.muxed) {
        // This is a USB-connected iOS device
        startCapture(from: device)
    }
}

// Or discover immediately
let devices = AVCaptureDevice.DiscoverySession(
    deviceTypes: [.external],
    mediaType: .muxed,
    position: .unspecified
).devices
```

#### Step 3: Capture Frames

```swift
class iOSScreenCapture: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    private let session = AVCaptureSession()
    private let output = AVCaptureVideoDataOutput()

    func start(device: AVCaptureDevice) throws {
        let input = try AVCaptureDeviceInput(device: device)

        session.beginConfiguration()
        session.addInput(input)

        output.setSampleBufferDelegate(self, queue: DispatchQueue(label: "capture"))
        output.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
        session.addOutput(output)

        session.commitConfiguration()
        session.startRunning()
    }

    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        // Convert to raw bytes and send to Unix socket
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)

        let data = Data(bytes: baseAddress!, count: bytesPerRow * height)
        sendToSocket(data)
    }
}
```

### Considerations

1. **Initialization delay**: After enabling `kCMIOHardwarePropertyAllowScreenCaptureDevices`, devices take a few seconds to appear
2. **Rate limiting**: Rapidly toggling the property can cause delays up to 60 seconds
3. **No encoding needed**: Frames come as raw `CVPixelBuffer` (BGRA), no H.264 decoding required
4. **macOS only**: This API is not available on other platforms

## iOS Simulator

### Current Approach

The existing implementation uses `xcrun simctl` for screenshots:

```bash
xcrun simctl io booted screenshot /path/to/screenshot.png
```

### Streaming Options

#### Option A: Repeated Screenshots (Current)

Poll `simctl io screenshot` at target frame rate. Simple but:
- High overhead (process spawn per frame)
- Limited to ~10-15 fps realistically
- File I/O for each frame

#### Option B: Video Recording + Pipe

```bash
xcrun simctl io booted recordVideo --codec=h264 -
```

Pipe to ffmpeg or Klarity for decoding. However:
- `recordVideo` doesn't support stdout piping well
- Designed for file output, not streaming

#### Option C: SimulatorKit Framework (Private)

Apple's private `SimulatorKit.framework` may have streaming APIs, but:
- Undocumented
- May break between Xcode versions
- App Store restrictions if distributed

#### Option D: Screen Capture API

Use macOS `CGWindowListCreateImage` or `SCStreamOutput` to capture simulator window:

```swift
import ScreenCaptureKit

// Find simulator window
let windows = try await SCShareableContent.current.windows
let simWindow = windows.first { $0.owningApplication?.bundleIdentifier == "com.apple.iphonesimulator" }

// Stream the window
let filter = SCContentFilter(desktopIndependentWindow: simWindow!)
let config = SCStreamConfiguration()
config.width = 1170
config.height = 2532
config.minimumFrameInterval = CMTime(value: 1, timescale: 60)

let stream = SCStream(filter: filter, configuration: config, delegate: self)
try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: .main)
try await stream.startCapture()
```

**Recommended for simulator**: ScreenCaptureKit (macOS 12.3+) provides low-latency window capture.

## Architecture Decision

### Physical iOS Devices

Use **AVFoundation capture** via native macOS helper:

1. **MCP Server spawns Swift helper** (or embeds via Swift/C bridge)
2. Helper uses AVFoundation to capture iOS device screen
3. Raw BGRA frames sent to Unix socket
4. IDE plugin receives frames directly (no decoding needed)

### iOS Simulator

Use **ScreenCaptureKit** to capture simulator window:

1. MCP Server spawns Swift helper
2. Helper uses SCStream to capture simulator window
3. Raw frames sent to Unix socket
4. IDE plugin receives frames directly

### Why Not Klarity for iOS?

Klarity is an H.264 decoder. iOS capture provides **raw frames** (CVPixelBuffer/BGRA), not encoded video. We can send these directly to the IDE plugin without encoding/decoding overhead.

## Protocol

Since iOS provides raw frames (not H.264), use a simpler protocol:

### Frame Header (16 bytes)
```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│ width (4)       │ height (4)      │ bytesPerRow (4) │ timestamp (4)   │
│ uint32 LE       │ uint32 LE       │ uint32 LE       │ uint32 LE (ms)  │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘

Followed by `height * bytesPerRow` bytes of BGRA pixel data.
```

## Implementation Plan

### Milestone 1: Physical Device Capture
- [ ] Create Swift helper for AVFoundation capture
- [ ] Implement Unix socket frame streaming
- [ ] Test with MCP server integration

### Milestone 2: Simulator Capture
- [ ] Create ScreenCaptureKit-based capture for simulator windows
- [ ] Handle simulator window discovery
- [ ] Integrate with same Unix socket protocol

### Milestone 3: IDE Plugin Integration
- [ ] Add raw frame receiver (simpler than Klarity H.264 path)
- [ ] Convert BGRA to ImageBitmap for Compose
- [ ] Unify with Android video stream UI

## Resolved Questions

1. ~~**Swift helper distribution**: Bundle as executable with MCP server? Use Swift-to-Node bridge?~~
   **Resolved**: Swift-to-Node bridge. This allows the MCP server to spawn and communicate with the Swift helper process.

2. ~~**Permissions**: ScreenCaptureKit requires screen recording permission. How to handle permission prompts?~~
   **Resolved**: The end user handles permission prompts. The IDE plugin should display a helpful message when permission is needed.

3. ~~**Multiple devices**: Can we capture multiple iOS devices simultaneously via AVFoundation?~~
   **Resolved**: Single device streaming at a time. This matches the Android approach and simplifies the architecture.

4. ~~**Entitlements**: Does capturing iOS device screen require special macOS entitlements?~~
   **Resolved**: No special entitlements needed for iOS device capture over USB via AVFoundation. Standard code signing and notarization are sufficient.

## References

- [AVCaptureDevice Documentation](https://developer.apple.com/documentation/avfoundation/avcapturedevice)
- [CoreMediaIO - Enabling Screen Capture](https://developer.apple.com/forums/thread/759245)
- [ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit)
- [USB iPhone Screen Recording in Swift](https://www.codejam.info/2025/06/usb-iphone-screen-recording-swift.html)
- [libimobiledevice](https://libimobiledevice.org/)
