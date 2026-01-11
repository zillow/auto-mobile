# Features - MCP Server - Video Recording

Optional screen recording for debugging, performance analysis, and CI artifacts. Recording is off by default
and optimized for low overhead with a low-quality default preset.

## Goals

- Provide on-demand device/simulator video recordings via MCP tools.
- Default to low quality to minimize CPU, GPU, and IO overhead.
- Allow explicit configuration of target bitrate and max throughput.
- Enforce a maximum total archive size with automatic eviction.
- Prefer the highest-performance libraries available on both macOS and Linux.

## Non-goals

- Continuous always-on recording.
- High-quality marketing or demo capture (use external tools instead).

## Configuration

Defaults should be conservative and low-quality:

- `qualityPreset`: `low` (default)
- `targetBitrateKbps`: 1000
- `maxThroughputMbps`: 5
- `fps`: 15
- `maxArchiveSizeMb`: 100
- `format`: `mp4` (H.264 baseline)

Example config payload:

```json
{
  "qualityPreset": "low",
  "targetBitrateKbps": 1000,
  "maxThroughputMbps": 5,
  "fps": 15,
  "maxArchiveSizeMb": 100,
  "format": "mp4"
}
```

`maxThroughputMbps` caps encoded throughput (bitrate * fps * resolution) by adjusting capture settings.

## MCP Tools

- `videoRecording`
  - Params:
    - `action`: `start` or `stop`.
    - `platform`: `android` or `ios`.
    - `deviceId`/`sessionUuid`/`device`: optional device targeting. If omitted, the action applies to all devices on the platform.
    - `recordingId`: optional (stop only).
    - Optional overrides for `targetBitrateKbps`, `fps`, `resolution`, `qualityPreset`, `format`,
      `maxDuration` (seconds, default 30, max 300), and `outputName`.
  - Returns: per-device recording metadata and any evictions.

## MCP Resources

- `automobile:video/latest` (metadata + blob)
- `automobile:video/archive` (metadata list)
- `automobile:video/archive/{recordingId}` (single video blob + metadata)

## Architecture

Introduce a `VideoRecorderService` with a pluggable backend interface:

```
interface VideoCaptureBackend {
  start(config): Promise<RecordingHandle>;
  stop(handle): Promise<RecordingResult>;
}
```

### Backend selection

Prefer FFmpeg/libav across macOS and Linux for best cross-platform performance and hardware acceleration:

- macOS: `ffmpeg` + VideoToolbox (H.264 hardware encode)
- Linux: `ffmpeg` + VAAPI/NVENC when available

Platform-specific capture sources:

- Android:
  - Physical devices: `adb exec-out screenrecord` (pipe to ffmpeg when transcoding or resizing).
  - Emulators: FFmpeg screen/window capture for higher throughput when ADB capture is slow.
- iOS (simulator only, macOS):
  - Prefer `simctl io recordVideo` for simulator-native capture.
  - Fallback to FFmpeg capture when available and needed for cross-platform parity.

## Storage and retention

- Archive directory: `~/.auto-mobile/video-archive`.
- Store recording metadata in SQLite (`~/.auto-mobile/auto-mobile.db`).
- Enforce `maxArchiveSizeMb` with LRU eviction (oldest first).
- Provide stable filenames (`recordingId` + timestamp).

## Video recording configuration socket

- Unix socket: `~/.auto-mobile/video-recording.sock`.
- Supports `config/get` and `config/set` requests for live video recording defaults.

## Performance considerations

- Default to low-quality preset to reduce overhead.
- Hardware-accelerated encoding by default when supported.
- Avoid blocking tool calls; stop/start should be asynchronous and cancellable.

## Security and privacy

- Recording is opt-in only (explicit tool call or CLI flag).
- Sensitive metadata must be scrubbed from filenames.
