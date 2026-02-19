# TalkBack/VoiceOver

<kbd>🚧 Design Only</kbd>

> **Current state:** This document describes the full 4-phase implementation plan. Phase 1 detection infrastructure (TalkBack state via ADB secure settings) is partially implemented. Phases 2–4 (tool adaptations, focus tracking, advanced features) are **not yet implemented**. iOS VoiceOver support is planned. See the [Status Glossary](../../status-glossary.md) for chip definitions.

## Overview

When TalkBack (Android) or VoiceOver (iOS) is enabled, mobile UX fundamentally changes:

- **Navigation Model**: Linear swipe-based navigation through accessibility nodes instead of visual/spatial navigation
- **Interaction Model**: Focus-based actions (e.g., double-tap to activate focused element) instead of direct coordinate-based taps
- **View Hierarchy**: Accessibility tree may differ from visual hierarchy due to content grouping, virtual nodes, hidden decorative elements, and alternative text
- **Gestures**: System reserves gestures (e.g., two-finger swipe for scrolling, single swipe for next/previous item)

**Strategy**: Auto-detect and adapt. MCP tools automatically detect when TalkBack/VoiceOver is enabled and adjust behavior accordingly, without requiring explicit mode parameters from agents.

### Design Principles

1. **Transparency**: Behavior adaptations are invisible to MCP tool consumers (agents)
2. **Backward Compatibility**: All existing tool interfaces remain unchanged
3. **Graceful Degradation**: If detection fails, fall back to standard behavior with appropriate warnings
4. **Performance**: Detection is cached (<50ms overhead) and does not impact tool execution latency
5. **Explicit Override**: Force accessibility mode via feature flags when needed

---

## Accessibility Mode Detection

### Detection Methods

**Android TalkBack** can be detected via multiple approaches:

| Method | Mechanism | Latency | Notes |
|--------|-----------|---------|-------|
| AccessibilityManager (preferred) | `settings get secure enabled_accessibility_services` via ADB | ~20-40ms | Fast, reliable, cacheable |
| AccessibilityService query | In-process `getEnabledAccessibilityServiceList()` | Instant | Requires AutoMobile AccessibilityService context |
| `dumpsys accessibility` (fallback) | Full accessibility configuration dump | ~100-200ms | Useful for debugging, not production |

**iOS VoiceOver** is detected via `UIAccessibility.isVoiceOverRunning` (native iOS API, requires XCTestService integration).

See [Android TalkBack](../../plat/android/talkback.md) for platform-specific ADB commands and simulation details.

### Caching Strategy

- **Tool Initialization**: Check once when device session starts
- **Periodic Refresh**: Re-check every 60 seconds (configurable TTL)
- **Explicit Invalidation**: After `setTalkBackEnabled()` tool calls
- **Feature Flag Override**: Allow manual force-enable for testing

---

## View Hierarchy Differences

The accessibility tree exposed by `AccessibilityNodeInfo` (Android) or `AXUIElement` (iOS) differs from the visual view hierarchy:

### Element Merging

TalkBack merges child text into parent for logical reading units:

```text
Before (Visual Hierarchy):
  LinearLayout (clickable)
    ImageView (icon)
    TextView "Settings"
    TextView "Manage app preferences"

After (Accessibility Tree):
  LinearLayout (clickable, focusable)
    content-desc: "Settings, Manage app preferences"
    [Children marked importantForAccessibility=NO]
```

**Impact**: `tapOn` with `text: "Settings"` may not find the TextView directly. Must search for parent with merged content-desc using substring matching.

### Virtual Nodes

Some accessibility nodes (e.g., slider controls) don't correspond to actual views. Standard coordinate-based taps fail on virtual nodes; must use accessibility actions (`ACTION_SCROLL_FORWARD`, `ACTION_SCROLL_BACKWARD`).

### Hidden Decorative Elements

Elements marked `importantForAccessibility="no"` are excluded from the accessibility tree. `observe` returns fewer elements, and visual selectors may fail. Use semantic selectors (text, content-desc, role) instead.

### Content Description Priority

When both `text` and `contentDescription` exist, TalkBack prioritizes `contentDescription`. Search logic must check both fields, with content-desc taking priority.

### Hierarchy Extraction

AutoMobile's `ViewHierarchyExtractor.kt` already uses `AccessibilityNodeInfo` APIs and captures `text`, `contentDescription`, `isFocusable`, and `isFocused`. No changes needed for basic TalkBack support.

---

## Focus Management

Android has two types of focus:

| Aspect | Input Focus | Accessibility Focus |
|--------|-------------|---------------------|
| Purpose | Text input target | Screen reader cursor position |
| Visibility | Cursor/highlight | TalkBack announces, green outline |
| Movement | Via keyboard (Tab) or touch | Via TalkBack swipe gestures |

**During scrolling**, TalkBack focus may move off-screen, stay on a now-invisible element, or jump to the first visible focusable. The `swipeOn` tool clears accessibility focus before scrolling to avoid focus-follow issues.

---

## Gesture Adaptations

### TalkBack Gesture Conflicts

When TalkBack is active, Android reserves certain gestures:

| Standard Gesture | TalkBack Behavior | Impact on Automation |
|------------------|-------------------|---------------------|
| Single tap | Announces element | Does NOT activate element |
| Double tap (anywhere) | Activates focused element | Alternative to direct tap |
| Single swipe right/left | Next/previous element | Does NOT scroll content |
| Two-finger swipe | Scroll content | Required for scrolling |
| Three-finger swipe | System navigation | Reserved gesture |

### Per-Tool Adaptations

**tapOn**: Use `ACTION_CLICK` on the target element instead of coordinate-based tap. Optionally set accessibility focus first to mimic user behavior and trigger TalkBack announcement. Long press uses `ACTION_LONG_CLICK`.

**swipeOn / scroll**: Three approaches in priority order:
1. **Accessibility scroll actions** (preferred for known scrollable containers) - uses `ACTION_SCROLL_FORWARD`/`ACTION_SCROLL_BACKWARD`
2. **Two-finger swipe** (general-purpose scrolling) - dispatches parallel two-finger gesture via `GestureDescription`
3. **Temporarily suspend TalkBack** (advanced, avoid) - requires extra permissions

For scroll-until-visible (`lookFor`), clear accessibility focus before scrolling, use accessibility scroll actions in a loop, and optionally set focus on the target when found.

**inputText / clearText**: No change needed. Already uses `ACTION_SET_TEXT`, which TalkBack handles correctly.

**pressButton**: Hardware keycodes work the same. Back button may exit TalkBack local context menu instead of navigating back; use `GLOBAL_ACTION_BACK` to bypass when needed.

**launchApp / terminateApp / installApp / startDevice / killDevice**: No change needed. App lifecycle and device management are unaffected by TalkBack state.

---

## Use Cases

### Login Flow

Standard automation script works unchanged with TalkBack enabled:

```typescript
await tapOn({ text: "Username" });      // Uses ACTION_CLICK (not coordinate tap)
await inputText({ text: "user@example.com" }); // Uses ACTION_SET_TEXT (works in both modes)
await tapOn({ text: "Password" });
await inputText({ text: "password123" });
await tapOn({ text: "Log in" });        // ACTION_CLICK on button
```

**Edge case**: If "Username" is a label (not the EditText), search logic checks nearby EditText with matching `content-desc` or `hint`.

### List Scrolling

```typescript
await swipeOn({
  container: { elementId: "item_list" },
  direction: "up",
  lookFor: { text: "Item 50" },
  // Internally uses ACTION_SCROLL_FORWARD or two-finger swipe
});
await tapOn({ text: "Item 50" });  // ACTION_CLICK
```

Scroll-until-visible detects list end by checking if hierarchy changes after scroll. Accessibility focus is cleared before each scroll to prevent focus-follow issues.

---

## Implementation Strategy

- **Phase 1**: Detection infrastructure - `AccessibilityDetector` class with caching, expose TalkBack state in observation results, feature flag override
- **Phase 2**: Core tool adaptations - `tapOn` uses `ACTION_CLICK`, `swipeOn` uses two-finger swipe or scroll actions, multi-touch gesture support
- **Phase 3**: Advanced features - accessibility focus tracking in observations, scroll-until-visible with focus management, optional explicit focus control tools
- **Phase 4**: Documentation and polish - user-facing docs, example scripts, performance benchmarks

### iOS VoiceOver

iOS VoiceOver follows the same phased approach. Key differences:

| Aspect | Android TalkBack | iOS VoiceOver |
|--------|------------------|---------------|
| Detection | `AccessibilityManager` / settings query | `UIAccessibility.isVoiceOverRunning` |
| Scroll Gesture | Two-finger swipe | Three-finger swipe |
| Focus API | `FOCUS_ACCESSIBILITY` | `UIAccessibilityFocus` |
| Rotor | No equivalent | Two-finger rotate for navigation modes |

iOS is secondary priority; initial focus is Android TalkBack validation.

---

## Future Enhancement Ideas

- **Explicit focus control tools**: `setAccessibilityFocus`, `getAccessibilityFocus`, `navigateFocus`
- **Announcement control**: Trigger screen reader announcements for user testing
- **Enhanced scroll-until-visible**: Smart loop detection, bi-directional search, focus tracking
- **Accessibility tree export**: Full node hierarchy with actions for debugging
- **Complex gesture simulation**: TalkBack local/global context menus, rotor navigation
- **Accessibility auditing**: Combine TalkBack support with WCAG auditing
- **iOS VoiceOver parity**: Three-finger swipe, rotor, Magic Tap support
