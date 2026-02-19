# Status Glossary

This page defines the status chips used throughout the design documentation to reflect the current implementation state of each feature.

## How to Read Status Chips

Each design document may include one or more status chips in the header or inline with specific features. Chips describe whether the feature is implemented, tested, platform-limited, or still in design.

## Status Definitions

| Chip | Meaning |
|------|---------|
| <kbd>✅ Implemented</kbd> | Code exists and is actively used in production builds. |
| <kbd>🧪 Tested</kbd> | Automated unit or integration tests cover the feature. |
| <kbd>⚠️ Partial</kbd> | Feature is partially implemented — some sub-features work, others do not. |
| <kbd>🔒 Internal</kbd> | Exists in code but is not exposed via MCP or CLI by default; requires custom configuration. |
| <kbd>🚧 Design Only</kbd> | Document describes a proposed design; no corresponding implementation exists yet. |
| <kbd>❌ Not Implemented</kbd> | A specific sub-feature or proposed MCP tool is documented but has not been built. |
| <kbd>🤖 Emulator Only</kbd> | Only functional on Android emulators; physical Android devices are not supported. |
| <kbd>📱 Simulator Only</kbd> | Only functional on iOS simulators; physical iOS devices are not supported. |
| <kbd>🤖 Android Only</kbd> | Feature exists on Android but has no iOS equivalent. |
| <kbd>🍎 iOS Only</kbd> | Feature exists on iOS but has no Android equivalent. |

## Master Status List

### Features Not Yet Implemented

The following items are documented as designs or proposals but have **no corresponding implementation** at this time:

#### MCP Tools (Proposed, Not in Tool Registry)

- **`setNetworkState`** — Wi-Fi/cellular/airplane mode toggle. ADB commands validated, MCP tool not built. See [network-state.md](plat/android/network-state.md).
- **`setTalkBackEnabled`** — Enable/disable TalkBack. ADB commands validated, MCP tool not built. See [talkback.md](plat/android/talkback.md).
- **`setA11yFocus`** — Move accessibility focus to element. Not yet implemented. See [talkback.md](plat/android/talkback.md).
- **`announce`** — TTS announcement via AccessibilityService. Not yet implemented. See [talkback.md](plat/android/talkback.md).
- **`takeScreenshot` (standalone with fallback-ticket gating)** — The proposed standalone `takeScreenshot` tool with server-side "fallback ticket" security model is not built. Screenshots are available via `observe`. See [take-screenshot.md](plat/android/take-screenshot.md).
- **Standalone `await`/`assert` YAML steps** — `executePlan` steps named `await` and `assert` (as described in the design doc) are not implemented. `waitFor` params on individual tools and `expectations` in step params are the current approach. See [executeplan-assertions.md](plat/android/executeplan-assertions.md).
- **TalkBack tool adaptations (Phases 2–4)** — ACTION_CLICK routing, two-finger scroll, focus tracking for TalkBack mode are not yet implemented. See [talkback-voiceover.md](mcp/a11y/talkback-voiceover.md).
- **iOS VoiceOver adaptation** — All phases are design-only. See [talkback-voiceover.md](mcp/a11y/talkback-voiceover.md).
- **iOS XcodeExtension feature flag UI** — Not implemented; stubs only. See [ios/ide-plugin/feature-flags.md](plat/ios/ide-plugin/feature-flags.md).
- **iOS XcodeCompanion test recording** — Not implemented; scaffold only. See [ios/ide-plugin/test-recording.md](plat/ios/ide-plugin/test-recording.md).

#### iOS Platform

- **Physical device support** — iOS automation is simulator-only. Physical devices require provisioning and signing work tracked in GitHub issues [#912](https://github.com/jasonpearson/auto-mobile/issues/912), [#913](https://github.com/jasonpearson/auto-mobile/issues/913), [#914](https://github.com/jasonpearson/auto-mobile/issues/914). See [iOS overview](plat/ios/index.md).
- **iOS live screen streaming** — AVFoundation/ScreenCaptureKit pipeline is a design document; no implementation. See [iOS screen streaming](plat/ios/screen-streaming.md).
- **Managed App Configuration** — Guidance for MDM-managed apps; no AutoMobile implementation. See [managed-app-config.md](plat/ios/managed-app-config.md).
- **Managed Apple IDs** — Guidance for managed accounts; no AutoMobile implementation. See [managed-apple-ids.md](plat/ios/managed-apple-ids.md).

#### Android SDK

- **`AutoMobileBiometrics.overrideResult()`** — Optional SDK hook for deterministic biometric bypass in apps under test. Not implemented. See [biometrics.md](plat/android/biometrics.md).

#### Vision

- **Hybrid vision fallback (Tier 1 local models)** — Proposed Florence-2 / PaddleOCR local model layer. Not implemented. See [vision-fallback.md](mcp/observe/vision-fallback.md).
- **Vision fallback in tools other than `tapOn`** — `swipeOn`, `scrollUntil`, etc. integration. Not implemented.

### Features That Are Partial or Internal

- **Vision fallback (Claude)** — Works for `tapOn` on Android only; disabled by default and not exposed via MCP. See [vision-fallback.md](mcp/observe/vision-fallback.md).
- **TalkBack enablement (ADB)** — ADB commands are validated and documented; the MCP tool wrapper is not yet built.
- **Android live screen streaming (IDE mirroring)** — The Android `video-server` JAR (H.264, VirtualDisplay) is built; the full end-to-end IDE mirroring pipeline is in progress. The `videoRecording` MCP tool (record-to-file) is fully implemented. See [Android screen streaming](plat/android/screen-streaming.md).
- **iOS XcodeCompanion** — Scaffolded macOS app with all views and navigation defined; feature completeness is ongoing. See [iOS IDE plugin](plat/ios/ide-plugin/overview.md).
- **iOS XcodeExtension** — Scaffold with 5 registered commands; implementations are minimal stubs.
- **`highlight` tool** — Fully implemented on Android; returns an unsupported error on iOS.
- **`rawViewHierarchy` (accessibility-service source)** — Android only. iOS returns XCUITest JSON.
- **Work profile `userId` override** — Auto-detection works; manual `userId` parameter is not supported in MCP tool schemas.

### Features That Lack Test Coverage

> All TypeScript MCP server features have unit tests. The items below are platform-level features with limited or no automated coverage.

- **iOS XcodeCompanion** — Only scaffold/smoke tests exist.
- **iOS XcodeExtension** — Only scaffold/smoke tests exist.
- **Android IDE plugin** — UI and Compose Desktop views are lightly tested; daemon communication has more coverage.
- **Biometric enrollment flow** — Enrollment steps require real emulator; only capability probing is covered by unit tests.
- **Live screen streaming (IDE mirroring)** — End-to-end streaming is not covered by automated tests.

## See Also

- [Design Documentation Index](index.md)
- [MCP Tools Reference](mcp/tools.md)
- [Android Platform Overview](plat/android/index.md)
- [iOS Platform Overview](plat/ios/index.md)
