# TalkBack Testing

TalkBack is Android's built-in screen reader. When it is enabled, the navigation model, gesture set, and view hierarchy all change significantly. AutoMobile detects TalkBack automatically and adapts its tool behavior so agents do not need to handle the difference explicitly.

For WCAG contrast and tap target auditing, see [Accessibility Analysis](./a11y.md).

---

## What Changes When TalkBack Is Active

Understanding these differences helps explain why `observe` output may look different and why some element selectors need adjustment.

### Navigation and gesture model

TalkBack takes over single-finger swipes for linear navigation through focusable elements (swipe right = next, swipe left = previous). A single tap announces an element; a double-tap activates it. Two-finger swipes scroll content. Three-finger swipes are reserved for system navigation.

Because standard coordinate-based taps and single-finger swipes conflict with TalkBack gestures, AutoMobile replaces them with accessibility actions internally.

### View hierarchy differences

The accessibility tree that TalkBack exposes can differ from the visual view hierarchy in three important ways:

**Element merging.** When a clickable parent contains multiple text children, TalkBack merges the child content into the parent's `content-desc` and marks the children as not important for accessibility. For example:

```
Visual hierarchy:
  LinearLayout (clickable)
    ImageView (icon)
    TextView "Settings"
    TextView "Manage app preferences"

Accessibility tree:
  LinearLayout (clickable, focusable)
    content-desc: "Settings, Manage app preferences"
    [children hidden from accessibility tree]
```

If a selector targets `text: "Settings"` expecting to match the `TextView` directly, it may not find it. Search instead for the merged `content-desc` on the parent, or use a substring that appears in the merged string.

**Decorative elements hidden.** Views marked `importantForAccessibility="no"` are excluded from the accessibility tree. `observe` returns fewer elements in TalkBack mode, and visual-only selectors may fail. Use semantic selectors — `text`, `content-desc`, or role — rather than layout position.

**Virtual nodes.** Some controls (such as sliders) expose accessibility nodes that do not correspond to real views. Coordinate-based taps fail on virtual nodes; AutoMobile uses accessibility actions (`ACTION_SCROLL_FORWARD`, `ACTION_SCROLL_BACKWARD`) for these.

---

## How AutoMobile Handles TalkBack Automatically

AutoMobile reads the active accessibility services from ADB secure settings when a device session starts and caches the result (refreshed every 60 seconds). When TalkBack is detected, the following adaptations apply transparently:

| Tool | Standard behavior | TalkBack behavior |
|------|------------------|-------------------|
| `tapOn` | Coordinate-based tap | `ACTION_CLICK` on the target element |
| `swipeOn` / scroll | Single-finger swipe | `ACTION_SCROLL_FORWARD`/`BACKWARD` or two-finger swipe |
| `inputText` / `clearText` | `ACTION_SET_TEXT` | `ACTION_SET_TEXT` (unchanged) |
| `pressButton` | Hardware keycode | Hardware keycode (unchanged; see note below) |
| `launchApp`, `terminateApp`, `installApp` | Standard | Unchanged |

No tool parameters change. Existing automation scripts work without modification.

**Back button note.** When TalkBack's local context menu is open, the back button closes the menu rather than navigating back in the app. If navigation behaves unexpectedly after a back press, this is the likely cause.

---

## Enabling and Disabling TalkBack via ADB

Use these commands to toggle TalkBack on an emulator or physical device. Validated on API 35.

**Find the TalkBack service name (if unsure):**

```bash
adb -s <device> shell dumpsys accessibility
```

**Enable TalkBack:**

```bash
adb -s <device> shell settings put secure enabled_accessibility_services \
  com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService
adb -s <device> shell settings put secure accessibility_enabled 1
```

**Disable TalkBack:**

```bash
adb -s <device> shell settings delete secure enabled_accessibility_services
adb -s <device> shell settings put secure accessibility_enabled 0
```

**Verify current state:**

```bash
adb -s <device> shell dumpsys accessibility
```

> **Note:** Enabling TalkBack on some emulator images triggers an Android Accessibility Suite permission dialog that must be accepted via UI automation before TalkBack is fully active. Some emulator images do not ship TalkBack at all; check `dumpsys accessibility` output to confirm the service is available.
>
> Do not use `settings put secure enabled_accessibility_services ''` to clear the value on API 35 — it does not work. Use `settings delete` instead.

---

## What `observe` Returns When TalkBack Is Active

When TalkBack is enabled, `observe` includes two additional fields in its result:

**`accessibilityState`** — the current screen reader state:

```json
{
  "accessibilityState": {
    "enabled": true,
    "service": "talkback"
  }
}
```

- `enabled`: `true` when any accessibility service with touch exploration is active.
- `service`: `"talkback"` when TalkBack is the active service, `"unknown"` for other accessibility services.

**`accessibilityFocusedElement`** — the element currently holding TalkBack's focus (the element TalkBack would announce and act on), or `null` if no element is focused:

```json
{
  "accessibilityFocusedElement": {
    "resourceId": "com.example.app:id/btn_submit",
    "text": "Submit",
    "contentDescription": "Submit form",
    "bounds": { "left": 32, "top": 640, "right": 320, "bottom": 704 }
  }
}
```

Use `accessibilityFocusedElement` to verify that focus landed on the expected element after an interaction, or to understand what TalkBack would read aloud at any point during a test.

---

## Workflow: Testing an App Under TalkBack

A typical TalkBack test session follows this pattern:

**1. Enable TalkBack.**

```bash
adb -s <device> shell settings put secure enabled_accessibility_services \
  com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService
adb -s <device> shell settings put secure accessibility_enabled 1
```

Accept any permission dialog that appears.

**2. Launch the app and observe initial state.**

```
observe()
```

Check that `accessibilityState.enabled` is `true`. Review the element tree — it will reflect the accessibility tree rather than the full visual hierarchy.

**3. Interact using standard tools.**

AutoMobile adapts internally. Write interactions the same way as without TalkBack:

```
tapOn({ text: "Sign in" })
inputText({ text: "user@example.com" })
tapOn({ text: "Continue" })
```

**4. Verify focus after each interaction.**

```
observe()
```

Confirm `accessibilityFocusedElement` points to the element you expect TalkBack to have focused. This validates both that the interaction succeeded and that the screen reader cursor is in a sensible position for a real user.

**5. Scroll to off-screen content.**

```
swipeOn({ direction: "up", lookFor: { text: "Terms of Service" } })
```

AutoMobile uses accessibility scroll actions internally, so this works correctly under TalkBack without any parameter changes.

**6. Disable TalkBack when the test session is complete.**

```bash
adb -s <device> shell settings delete secure enabled_accessibility_services
adb -s <device> shell settings put secure accessibility_enabled 0
```

---

## Known Edge Cases

**Element merging changes selectors.** When a parent merges child text into its `content-desc`, targeting the individual child text values will not match. Check the merged `content-desc` on the parent instead. `observe` output shows the merged value, so inspect it before writing selectors.

**Decorative elements are invisible.** Icons, dividers, and other purely visual elements marked as not important for accessibility do not appear in the tree. Do not rely on them as anchors for selectors.

**Virtual nodes reject coordinate taps.** Controls like sliders or progress indicators may be represented as virtual nodes. AutoMobile handles these with accessibility actions, but if you observe unexpected failures on such controls, inspect the `observe` output to confirm the node exists and has the expected type.

**Back button may close TalkBack menus.** If `pressButton({ button: "back" })` does not navigate back in the app as expected, TalkBack's local context menu may be intercepting the event. Dismiss the menu first and retry.

**Permission dialog on TalkBack enable.** After enabling TalkBack via ADB, a system dialog may appear. Automate dismissing it (tap "Allow" or "OK") before proceeding with app interactions.
