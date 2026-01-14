# Android Feature Ideas (Draft)

This page summarizes Android-specific MCP feature ideas and links to the
per-feature design notes.

## Current scope decisions

- Emulator images: API 29 and API 35.
- Helper APKs are allowed and preferred when faster or more reliable.
- Use the AccessibilityService whenever it is the lowest-latency option.
- Network controls should include all toggles plus shaping profiles.
- executePlan failures should halt immediately (JUnitRunner may override).

## Remaining feature docs

- [Network state control](network-state.md)
- [Accessibility testing](accessibility-testing.md)
- [executePlan assertions and await](executeplan-assertions.md)
- [TalkBack simulation/enablement](talkback.md)
