# Android Feature Ideas (Draft)

This page summarizes Android-specific MCP feature ideas and links to the
per-feature design notes.

## Current scope decisions

- Emulator images: API 29 and API 35.
- Helper APKs are allowed and preferred when faster or more reliable.
- Use the AccessibilityService whenever it is the lowest-latency option.
- Biometrics: support any available modality (fingerprint first).
- Notifications must appear as the app-under-test (use AutoMobile SDK hooks).
- Network controls should include all toggles plus shaping profiles.
- executePlan failures should halt immediately (JUnitRunner may override).
- Multi-device tests should support true parallel steps plus critical sections.

## Feature docs

- [takeScreenshot fallback](take-screenshot.md)
- [Biometrics stubbing](biometrics.md)
- [Network state control](network-state.md)
- [Extended accessibility testing](accessibility-testing.md)
- [Notification triggering](notifications.md)
- [System tray lookFor notifications](system-tray-lookfor.md)
- [executePlan assertions and await](executeplan-assertions.md)
- [TalkBack simulation/enablement](talkback.md)
- [Multi-device and critical sections](multi-device.md)
- [Clipboard tool](clipboard.md)
