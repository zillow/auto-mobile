# TalkBack simulation / enablement

## Goal

Support TalkBack testing on emulator images (API 29/35) either by
best-effort enabling real TalkBack or by simulating key behaviors via
AutoMobile's AccessibilityService.

## Proposed MCP tools

```
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
  - `adb -s <device> shell settings put secure enabled_accessibility_services ''`
  - `adb -s <device> shell settings put secure accessibility_enabled 0`

Simulated TalkBack (reliable, helper-based):

- Use AccessibilityService to move focus and announce text via TTS.
- `setA11yFocus` searches nodes and requests focus.
- `announce` uses TextToSpeech to emit the same strings an agent would hear.

## Plan

1. Implement simulated focus + announce tools (works on all devices).
2. Add best-effort TalkBack enablement for emulators with the service installed.
3. Report `supported: false` on physical devices without privileges.

## Risks

- Some emulator images do not ship TalkBack; simulated mode remains primary.
- Real TalkBack can interfere with automation timing; gating may be needed.
