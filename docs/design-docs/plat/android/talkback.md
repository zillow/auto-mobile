# TalkBack simulation

For the overall accessibility adaptation design (detection strategy, gesture adaptations, and tool-level changes), see [TalkBack/VoiceOver Adaptation](../../mcp/a11y/talkback-voiceover.md). This document covers Android-specific ADB commands and simulation details.

## Goal

Support TalkBack testing on emulator images (API 29/35) either by
best-effort enabling real TalkBack or by simulating key behaviors via
AutoMobile's AccessibilityService.

## Proposed MCP tools

```typescript
setTalkBackEnabled({ enabled: boolean })
setA11yFocus({ resourceId?: string, text?: string })
announce({ text: string })
```

## Android implementation

Real TalkBack (best-effort, emulator):

- Detect the service name via `adb -s <device> shell dumpsys accessibility`.
- Enable:
  - `adb -s <device> shell settings put secure enabled_accessibility_services <service>`
  - `adb -s <device> shell settings put secure accessibility_enabled 1`
- Disable:
  - `adb -s <device> shell settings delete secure enabled_accessibility_services`
  - `adb -s <device> shell settings put secure accessibility_enabled 0`

Simulated TalkBack (reliable, helper-based):

- Use AccessibilityService to move focus and announce text via TTS.
- `setA11yFocus` searches nodes and requests focus.
- `announce` uses TextToSpeech to emit the same strings an agent would hear.

## ADB validation (API 35)

Status:

- API 29 not validated yet (no local AVD available).

Confirmed commands:

- Read current accessibility state:
  - `adb -s <device> shell dumpsys accessibility`
- Enable TalkBack:
  - `adb -s <device> shell settings put secure enabled_accessibility_services com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService`
  - `adb -s <device> shell settings put secure accessibility_enabled 1`
  - `adb -s <device> shell dumpsys accessibility`
- Disable TalkBack:
  - `adb -s <device> shell settings delete secure enabled_accessibility_services`
  - `adb -s <device> shell settings put secure accessibility_enabled 0`
  - `adb -s <device> shell dumpsys accessibility`

Observed results:

- `dumpsys accessibility` shows TalkBack enabled after the enable commands.
- `dumpsys accessibility` shows no enabled services after disable.

Notes:

- Enabling TalkBack triggers the Android Accessibility Suite permission
  dialog and must be accepted via UI automation.
- `settings put secure enabled_accessibility_services ''` does not clear on
  API 35; use `settings delete` instead.

## Plan

1. Implement simulated focus + announce tools (works on all devices).
2. Add best-effort TalkBack enablement for emulators with the service installed.
3. Report `supported: false` on physical devices without privileges.

## Risks

- Some emulator images do not ship TalkBack; simulated mode remains primary.
- Real TalkBack can interfere with automation timing; gating may be needed.
