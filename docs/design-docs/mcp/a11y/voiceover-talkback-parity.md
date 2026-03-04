# VoiceOver / TalkBack Parity Review

This document compares iOS VoiceOver and Android TalkBack support in AutoMobile as of Phase 4 completion. It identifies gaps and serves as the input for follow-up work.

---

## Feature Coverage Matrix

| Feature | TalkBack (Android) | VoiceOver (iOS) | Notes |
|---------|-------------------|-----------------|-------|
| Auto-detection | ✅ | ✅ | Both use 60s TTL cache |
| Detection overhead <50ms | ✅ | ✅ | Validated by benchmarks |
| Feature flag override | ✅ | ✅ | `force-accessibility-mode` |
| `tapOn` adaptation | ✅ `ACTION_CLICK` | ✅ Accessibility activation | Transparent to agent |
| `swipeOn` / scroll adaptation | ✅ `ACTION_SCROLL_FORWARD/BACKWARD` | ✅ Accessibility scroll action | Fallback differs |
| `inputText` / `clearText` | ✅ Unchanged | ✅ Unchanged | Both use text injection |
| `pressButton` | ✅ Unchanged | ✅ Unchanged | Hardware keycodes |
| `accessibilityState` in observe | ✅ `service: "talkback"` | ✅ `service: "voiceover"` | |
| `accessibilityFocusedElement` | ✅ Reported | ❌ Not tracked | Gap — see below |
| Programmatic enable/disable | ✅ Via ADB | ✅ Simulator only | Physical device support deferred |
| MCP tool to toggle | ✅ `TalkBackToggle` | ✅ `VoiceOverToggle` (Simulator) | Gap — see below |
| Three-finger swipe fallback | N/A | ✅ | VoiceOver-specific |
| Two-finger swipe fallback | ✅ | N/A | TalkBack-specific |
| Boomerang gesture | ✅ | ✅ | Both supported |
| User-facing documentation | ✅ `docs/using/talkback.md` | ✅ `docs/using/voiceover.md` | Added in Phase 4 |
| Example scripts | ✅ 3 scripts | ✅ 3 scripts | Added in Phase 4 |
| Detection performance benchmark | ✅ | ✅ | Added in Phase 4 |

---

## Gaps

### Gap 1: `accessibilityFocusedElement` not reported on iOS

**TalkBack:** The Android CtrlProxy reports `accessibility-focused: true` on the element with TalkBack's cursor. `ObserveResult.accessibilityFocusedElement` is populated on every observation, allowing agents to verify that the screen reader cursor landed on the expected element.

**VoiceOver:** The iOS CtrlProxy does not currently report which element has the VoiceOver cursor. `accessibilityFocusedElement` is absent in iOS observe results.

**Impact:** Agents cannot verify VoiceOver cursor position after interactions. Workaround: check `focusedElement` (input focus) for text fields, and verify element presence in `observe().elements` for other controls.

**Resolution path:** Add VoiceOver cursor tracking to the CtrlProxy Swift runner. The runner already knows the VoiceOver cursor position via `UIAccessibilityElement.accessibilityElementIsFocused`. Add a `voiceoverFocusedElement` field to the hierarchy response and populate `accessibilityFocusedElement` in `CtrlProxyHierarchy.ts`.

---

### Gap 2: No programmatic VoiceOver toggle — RESOLVED (iOS Simulator)

**TalkBack:** AutoMobile provides `TalkBackToggle.ts` — an MCP tool that enables or disables TalkBack via ADB secure settings. Agents can script test sessions that programmatically toggle TalkBack before and after test cases.

**VoiceOver (Simulator):** Resolved via `xcrun simctl spawn <udid> defaults write com.apple.Accessibility VoiceOverTouchEnabled -bool YES/NO` followed by a `notifyutil -p com.apple.accessibility.VoiceOverStatusDidChange` notification. `VoiceOverToggle.ts` implements this and is exposed through the `accessibility` MCP tool (`voiceover: true/false`).

**VoiceOver (Physical device):** No known `idevice` equivalent. Physical device support remains a gap. Enabling VoiceOver on a physical device still requires:
- Manual: Settings > Accessibility > VoiceOver inside the device
- Manual: Triple-click the side button (if Accessibility Shortcut is configured)

**Impact (remaining):** VoiceOver test sessions on physical devices cannot be fully automated. CI-level VoiceOver testing on physical hardware requires the device to have VoiceOver pre-enabled.

---

### Gap 3: No VoiceOver MCP toggle tool — RESOLVED (iOS Simulator)

**TalkBack:** The `accessibility` MCP tool (backed by `TalkBackToggle.ts`) enables/disables TalkBack from an agent session.

**VoiceOver (Simulator):** Resolved. The `accessibility` MCP tool now accepts `voiceover: true/false` and delegates to `VoiceOverToggle.ts`. Example usage:
- `accessibility({ voiceover: true })` → `{ voiceover: { supported: true, applied: true, currentState: true } }`
- `accessibility({ voiceover: false })` → `{ voiceover: { supported: true, applied: true, currentState: false } }`
- `accessibility({})` → `{ enabled: true, service: "voiceover" }` (detect-only, unchanged)

**VoiceOver (Physical device):** Returns `{ supported: false, applied: false, reason: "VoiceOver toggle is only supported on iOS Simulator" }`.

---

### Gap 4: VoiceOver Rotor not supported

**TalkBack:** No equivalent.

**VoiceOver:** The Rotor is a two-finger rotate gesture that changes the VoiceOver navigation mode (e.g., navigate by heading, by word, by character). VoiceOver users rely on the Rotor for efficient navigation in text-heavy views. AutoMobile does not implement Rotor interaction.

**Impact:** AutoMobile cannot test apps that depend on Rotor navigation for their expected VoiceOver interaction patterns. Accessibility audits that include heading navigation or character-by-character text editing are incomplete.

**Resolution path:** Add `requestRotor` to the CtrlProxy protocol, with a `mode` parameter for the desired Rotor setting. Expose via an MCP tool or as an adaptation in `swipeOn` when navigating text fields with VoiceOver active.

---

### Gap 5: VoiceOver Magic Tap not supported

**TalkBack:** No equivalent.

**VoiceOver:** Magic Tap is a two-finger double-tap that triggers an app-specific primary action (e.g., play/pause in a media player, answer/end call in a phone app). AutoMobile does not implement Magic Tap.

**Impact:** Agents cannot test the VoiceOver Magic Tap interaction pattern.

**Resolution path:** Add `requestMagicTap` to the CtrlProxy protocol and expose as an `accessibilityAction: "magic_tap"` option in `tapOn` or a dedicated tool.

---

### Gap 6: iOS 17+ RemoteXPC not implemented

**TalkBack:** Not applicable (ADB is consistent across Android versions).

**VoiceOver:** The CtrlProxy uses CtrlProxy WebSocket for VoiceOver state detection. The DTX-based direct testmanagerd connection (Phase 3 snapshot work) covers iOS 14–16. iOS 17+ uses RemoteXPC rather than DTX for testmanagerd communication, and the RemoteXPC path is not yet implemented.

**Impact:** The direct DTX snapshot client is not available on iOS 17+ simulators. The CtrlProxy WebSocket path works on all iOS versions it supports, so VoiceOver detection and tool adaptations are not affected. However, advanced use of the direct DTX path (e.g., snapshot-based focus tracking) is blocked on iOS 17+.

**Resolution path:** Implement RemoteXPC transport for iOS 17+ in a future phase.

---

## Summary

VoiceOver and TalkBack reach parity on the core automation behaviors: detection, tool adaptations, gesture fallbacks, and observe output. The primary gaps are:

1. **Accessibility cursor tracking** (Gap 1) — most impactful for agent validation workflows
2. **Programmatic toggle** (Gaps 2 & 3) — resolved for iOS Simulator; physical device support remains a gap
3. **Rotor and Magic Tap** (Gaps 4 & 5) — advanced VoiceOver interactions not tested
4. **iOS 17+ RemoteXPC** (Gap 6) — blocks direct DTX snapshot path on modern iOS

Gaps 4 and 5 require CtrlProxy Swift changes before they can be addressed on the AutoMobile side.
