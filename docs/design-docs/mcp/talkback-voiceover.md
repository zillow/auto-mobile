# TalkBack/VoiceOver MCP Tool Adaptation Design

## Overview

### Purpose

This document defines how AutoMobile's MCP tools should adapt their behavior when TalkBack (Android) or VoiceOver (iOS) accessibility services are enabled. Screen readers fundamentally alter the user interaction model, navigation patterns, and view hierarchy representation. To support accessibility testing and automation, our MCP tools must automatically detect and adapt to these changes.

### Scope

- **Primary Focus**: Android TalkBack (extensive existing infrastructure)
- **Secondary**: iOS VoiceOver (conceptual design, limited implementation detail)
- **Priority Use Cases**: Login/form filling, list navigation/scrolling, navigation patterns (drawer, modals, dialogs)

### Background

When TalkBack or VoiceOver is enabled, mobile UX fundamentally changes:

- **Navigation Model**: Linear swipe-based navigation through accessibility nodes instead of visual/spatial navigation
- **Interaction Model**: Focus-based actions (e.g., double-tap to activate focused element) instead of direct coordinate-based taps
- **View Hierarchy**: Accessibility tree may differ from visual hierarchy due to:
  - Content grouping (merged elements for logical reading units)
  - Virtual nodes (generated for accessibility but not in view tree)
  - Hidden decorative elements (marked non-important for accessibility)
  - Alternative text (content-desc overrides visible text for screen readers)
- **Gestures**: System reserves gestures (e.g., two-finger swipe for scrolling, single swipe for next/previous item)
- **Audio Feedback**: Screen reader announces element descriptions and state changes

### Strategy

**Auto-detect and adapt**: MCP tools automatically detect when TalkBack/VoiceOver is enabled and adjust behavior accordingly. This provides a seamless experience without requiring explicit mode parameters from agents.

**Key Design Principles**:
1. **Transparency**: Behavior adaptations should be invisible to MCP tool consumers (agents)
2. **Backward Compatibility**: All existing tool interfaces remain unchanged
3. **Graceful Degradation**: If detection fails, fall back to standard behavior with appropriate warnings
4. **Performance**: Detection should be fast (cached, <50ms) and not impact tool execution latency
5. **Explicit Override**: Advanced users can force accessibility mode via feature flags when needed

---

## Accessibility Mode Detection

### Android TalkBack Detection

TalkBack state can be detected via multiple Android APIs:

#### Method 1: AccessibilityManager (Preferred)

```typescript
// TypeScript/Node.js implementation via ADB
async function isTalkBackEnabled(deviceId: string): Promise<boolean> {
  // Query accessibility services state
  const result = await adb.shell(deviceId,
    'settings get secure enabled_accessibility_services'
  );

  return result.includes('com.google.android.marvin.talkback') ||
         result.includes('TalkBackService');
}
```

**Characteristics**:
- Fast: ~20-40ms via ADB shell
- Reliable: Direct system setting query
- Cacheable: State changes infrequently (user explicitly enables/disables)

#### Method 2: AccessibilityService Query (Alternative)

```kotlin
// Android AccessibilityService implementation
fun isTalkBackEnabled(context: Context): Boolean {
  val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
  val enabledServices = am.getEnabledAccessibilityServiceList(
    AccessibilityServiceInfo.FEEDBACK_SPOKEN
  )

  return enabledServices.any { service ->
    service.id.contains("talkback", ignoreCase = true)
  }
}
```

**Characteristics**:
- Instant: In-process Android API call
- More accurate: Checks runtime accessibility service state
- Requires: AutoMobile AccessibilityService context

#### Method 3: dumpsys accessibility (Fallback)

```bash
adb shell dumpsys accessibility | grep -A 20 "enabled services"
```

**Characteristics**:
- Slower: ~100-200ms
- Comprehensive: Full accessibility configuration dump
- Useful for debugging but not production detection

### iOS VoiceOver Detection

VoiceOver state detection on iOS:

```swift
// iOS implementation via XCTest/WebDriverAgent
let isVoiceOverRunning = UIAccessibility.isVoiceOverRunning
```

**Characteristics**:
- Fast: Native iOS API
- Requires: XCTest/WDA integration
- Updates: Observe `UIAccessibilityVoiceOverStatusDidChangeNotification`

### Detection Strategy

**Caching Architecture**:

```typescript
interface AccessibilityState {
  enabled: boolean;
  lastChecked: number;
  ttl: number; // Time-to-live in ms (default: 60000 = 1 minute)
}

class AccessibilityDetector {
  private cache: Map<string, AccessibilityState> = new Map();

  async isAccessibilityEnabled(deviceId: string): Promise<boolean> {
    const cached = this.cache.get(deviceId);
    const now = Date.now();

    // Return cached value if still valid
    if (cached && (now - cached.lastChecked) < cached.ttl) {
      return cached.enabled;
    }

    // Detect current state
    const enabled = await this.detectTalkBackState(deviceId);

    // Update cache
    this.cache.set(deviceId, {
      enabled,
      lastChecked: now,
      ttl: 60000, // 1 minute cache
    });

    return enabled;
  }

  invalidateCache(deviceId: string): void {
    this.cache.delete(deviceId);
  }
}
```

**Detection Points**:
1. **Tool Initialization**: Check once when device session starts
2. **Periodic Refresh**: Re-check every 60 seconds (configurable)
3. **Explicit Invalidation**: After `setTalkBackEnabled()` tool calls
4. **Feature Flag Override**: Allow manual force-enable for testing

**Feature Flag Integration**:

```typescript
// Feature flags for explicit control
type AccessibilityMode = 'auto' | 'force-enabled' | 'force-disabled';

interface AccessibilityConfig {
  mode: AccessibilityMode;
  detectionMethod: 'accessibility-manager' | 'dumpsys' | 'feature-flag';
}
```

---

## View Hierarchy Differences

### Standard vs. Accessibility Tree

The accessibility tree exposed by `AccessibilityNodeInfo` (Android) or `AXUIElement` (iOS) differs from the visual view hierarchy in several key ways:

#### Element Merging

**Before (Visual Hierarchy)**:
```
LinearLayout (clickable)
  ├─ ImageView (icon)
  ├─ TextView "Settings"
  └─ TextView "Manage app preferences"
```

**After (Accessibility Tree with TalkBack)**:
```
LinearLayout (clickable, focusable)
  content-desc: "Settings, Manage app preferences"
  [Children marked importantForAccessibility=NO]
```

**Rationale**: TalkBack merges child text into parent for logical reading units. User hears "Settings, Manage app preferences" as one announcement, not three separate elements.

**Impact on MCP Tools**:
- `tapOn` with `text: "Settings"` may not find TextView directly
- Must search for parent with merged content-desc
- Element search requires fuzzy matching or content-desc substring checks

#### Virtual Nodes

Some accessibility nodes don't correspond to actual views:

**Example: Slider**:
```
SeekBar
  ├─ (Virtual) "Slider, 50 percent"
  ├─ (Virtual) "Decrease value"
  └─ (Virtual) "Increase value"
```

**Impact**:
- Virtual nodes appear in accessibility tree but have no view bounds
- Standard coordinate-based taps fail on virtual nodes
- Must use accessibility actions (`ACTION_SCROLL_FORWARD`, `ACTION_SCROLL_BACKWARD`)

#### Hidden Decorative Elements

Elements marked `android:importantForAccessibility="no"` or `android:focusable="false"` are excluded from the accessibility tree.

**Common Examples**:
- Decorative icons (redundant with adjacent text)
- Spacer views
- Background containers
- Divider lines

**Impact**:
- `observe` tool returns fewer elements in accessibility mode
- Visual selectors (e.g., finding a decorative icon) may fail
- Must rely on semantic selectors (text, content-desc, role)

#### Content Description Priority

When both `text` and `contentDescription` exist, TalkBack prioritizes `contentDescription`:

**View Properties**:
```xml
<Button
  android:text="X"
  android:contentDescription="Close dialog" />
```

**What TalkBack Announces**: "Close dialog, button"

**What User Sees Visually**: "X"

**Impact**:
- Searching by visible text "X" may not work if content-desc is set
- Must check both `text` and `content-desc` fields
- AutoMobile already extracts both, but search logic needs content-desc priority

### AccessibilityNodeInfo Properties

AutoMobile's view hierarchy extractor already captures all relevant AccessibilityNodeInfo properties:

**Current Element Interface** (see `src/models/Element.ts`):
```typescript
interface Element {
  bounds: ElementBounds;
  text?: string;
  "content-desc"?: string;
  "resource-id"?: string;
  "class"?: string;
  "package"?: string;
  checkable?: boolean;
  checked?: boolean;
  clickable?: boolean;
  enabled?: boolean;
  focusable?: boolean;  // ← Key for TalkBack!
  focused?: boolean;    // ← Current accessibility focus
  scrollable?: boolean;
  selected?: boolean;
  // ... additional properties
}
```

**Critical Properties for TalkBack**:
- `focusable`: Element can receive accessibility focus
- `focused`: Element currently has accessibility focus (where TalkBack cursor is)
- `clickable`: Element supports activation (double-tap in TalkBack)
- `content-desc`: Overrides text for screen reader announcements
- `selected`: Element is selected in a list/group (affects announcements)

**Additional Properties to Expose**:

While AutoMobile's extractor captures most properties, these would be beneficial for TalkBack automation:

```typescript
interface Element {
  // ... existing properties ...

  // Accessibility-specific additions:
  "accessibility-focused"?: boolean;     // Explicit TalkBack focus indicator
  "accessibility-actions"?: string[];    // Available actions (click, long-click, scroll, etc.)
  "accessibility-live-region"?: string;  // "polite" | "assertive" | "none"
  "role"?: string;                       // Semantic role (button, heading, link, etc.)
  "heading-level"?: number;              // For heading elements (h1-h6 equivalent)
  "range-info"?: {                       // For sliders, progress bars
    min: number;
    max: number;
    current: number;
  };
}
```

**Note**: These additions are **optional enhancements**. Current properties are sufficient for initial TalkBack support.

### View Hierarchy Extraction Adaptations

The `ViewHierarchyExtractor.kt` already traverses the accessibility tree correctly. Key behaviors that naturally support TalkBack:

1. **Uses AccessibilityNodeInfo API**: Already querying the accessibility tree, not the visual view tree
2. **Captures content-desc**: Both `text` and `contentDescription` are extracted
3. **Respects focusability**: `isFocusable` and `isFocused` properties captured
4. **Handles merged elements**: Parent nodes with merged child content are preserved

**No changes needed** to hierarchy extraction for basic TalkBack support. Future enhancements:
- Add `importantForAccessibility` property to understand why elements are hidden
- Expose `AccessibilityNodeInfo.getActions()` to know available interactions
- Add accessibility focus tracking (detect which element TalkBack cursor is on)

---

## Focus Management

### Accessibility Focus vs. Input Focus

Android has two types of focus:

1. **Input Focus** (`FOCUS_INPUT`): Which EditText has keyboard focus
2. **Accessibility Focus** (`FOCUS_ACCESSIBILITY`): Where TalkBack cursor is located

**Key Differences**:

| Aspect | Input Focus | Accessibility Focus |
|--------|-------------|---------------------|
| Purpose | Text input target | Screen reader cursor position |
| Visibility | Usually visible (e.g., cursor, highlight) | Announced by TalkBack, green outline |
| Movement | Via keyboard (Tab) or touch | Via TalkBack swipe gestures |
| Scope | One per screen | One per screen |
| Clearable | Yes (loses focus) | Yes (moves to another element) |

### Detecting Current Accessibility Focus

**Android API**:
```kotlin
val rootNode = rootInActiveWindow
val accessibilityFocusedNode = rootNode.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)

if (accessibilityFocusedNode != null) {
  Log.d(TAG, "TalkBack focus on: ${accessibilityFocusedNode.text}")
  Log.d(TAG, "Resource ID: ${accessibilityFocusedNode.viewIdResourceName}")
  Log.d(TAG, "Content desc: ${accessibilityFocusedNode.contentDescription}")
}
```

**MCP Integration**:

Add accessibility focus to `observe` tool result:

```typescript
interface ObservationResult {
  // ... existing fields ...
  accessibilityFocusedElement?: Element;  // Element with TalkBack cursor
}
```

**Use Case**: Agents can know where TalkBack focus is and decide whether to move it before interacting.

### Moving Accessibility Focus

TalkBack focus can be moved programmatically:

**Android API**:
```kotlin
// Clear current accessibility focus
val currentFocus = rootNode.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)
currentFocus?.performAction(AccessibilityNodeInfo.ACTION_CLEAR_ACCESSIBILITY_FOCUS)

// Set accessibility focus on target element
targetNode.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)
```

**Proposed MCP Tool** (Future):

```typescript
// New tool for explicit focus control
{
  name: "setAccessibilityFocus",
  description: "Move TalkBack/VoiceOver focus to a specific element",
  parameters: {
    text?: string;
    resourceId?: string;
    contentDesc?: string;
    announce?: boolean;  // Whether to trigger TalkBack announcement
  },
  result: {
    success: boolean;
    focusedElement?: Element;
  }
}
```

**Note**: This tool is **not required** for initial TalkBack support. Most interactions can rely on automatic focus management.

### Focus Movement During Scrolling

**Challenge**: When scrolling, TalkBack focus may:
1. Move off-screen (element scrolled out of view)
2. Stay on the same element (now off-screen), creating confusion
3. Jump to first visible element after scroll

**Android Behavior** (observed):
- If focused element scrolls off-screen, focus typically clears or moves to first on-screen focusable
- Scroll-until-visible patterns require tracking focus position

**MCP Tool Adaptation** (`swipeOn` with `lookFor`):

When TalkBack is enabled and `lookFor` is used:
1. Before scrolling: Clear accessibility focus to avoid focus-follow issues
2. Perform scroll gesture
3. After scrolling: Search for target element
4. If found: Set accessibility focus on target (optional, for user testing)

```typescript
// swipeOn with lookFor in TalkBack mode
async function swipeOnWithLookFor(params: SwipeParams): Promise<SwipeResult> {
  const isTalkBackEnabled = await detector.isAccessibilityEnabled(deviceId);

  if (isTalkBackEnabled) {
    // Clear accessibility focus before scrolling
    await clearAccessibilityFocus(deviceId);
  }

  // Perform scroll (two-finger swipe in TalkBack mode - see Gesture section)
  await performScroll(params);

  // Search for target element
  const found = await searchForElement(params.lookFor);

  if (found && isTalkBackEnabled) {
    // Optionally set accessibility focus on found element
    if (params.focusTarget) {
      await setAccessibilityFocus(deviceId, found.resourceId);
    }
  }

  return { success: !!found, found };
}
```

---

## Gesture Adaptations

### TalkBack Gesture Conflicts

When TalkBack is active, Android reserves certain gestures:

| Standard Gesture | TalkBack Behavior | Impact on Automation |
|------------------|-------------------|---------------------|
| Single tap | Announces element | Does NOT activate element |
| Double tap (anywhere) | Activates focused element | Alternative to direct tap |
| Single swipe right | Next element | Does NOT scroll content |
| Single swipe left | Previous element | Does NOT scroll content |
| Two-finger swipe up/down/left/right | Scroll content | Required for scrolling |
| Two-finger double tap | Pause/resume TalkBack | May interfere if triggered |
| Three-finger swipe | System navigation (Back, Home) | Reserved gesture |

**Critical Insight**: Standard single-finger gestures are **navigation gestures**, not interaction gestures.

### Tool-Specific Gesture Adaptations

#### tapOn Tool

**Standard Behavior** (TalkBack disabled):
```kotlin
// Direct coordinate tap via ADB
adb shell input tap ${x} ${y}

// Or via AccessibilityService dispatchGesture
val path = Path().apply { moveTo(x, y) }
val gesture = GestureDescription.Builder()
  .addStroke(StrokeDescription(path, 0, 1))
  .build()
dispatchGesture(gesture, callback, null)
```

**Adapted Behavior** (TalkBack enabled):

```kotlin
// Method 1: Focus + Activate (Recommended)
// 1. Find target element by text/id/content-desc
val targetNode = findElementBySelector(selector)

// 2. Set accessibility focus
targetNode.performAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS)

// 3. Activate the focused element (equivalent to double-tap)
targetNode.performAction(AccessibilityNodeInfo.ACTION_CLICK)

// Note: ACTION_CLICK works regardless of TalkBack state
// TalkBack intercepts and handles it appropriately
```

```kotlin
// Method 2: Direct ACTION_CLICK (Fallback)
// Skip focus step, directly invoke click action
val targetNode = findElementBySelector(selector)
targetNode.performAction(AccessibilityNodeInfo.ACTION_CLICK)

// This works in both modes but doesn't provide TalkBack announcement
```

**Rationale**:
- Method 1 mimics user behavior (focus → activate), provides TalkBack feedback
- Method 2 is faster, suitable when announcement is not needed
- Both avoid coordinate-based taps, which TalkBack may intercept

**TypeScript Implementation**:

```typescript
async function tapOnElement(params: TapOnParams): Promise<TapResult> {
  const isTalkBackEnabled = await detector.isAccessibilityEnabled(deviceId);

  if (isTalkBackEnabled) {
    // Use AccessibilityService ACTION_CLICK
    await accessibilityClient.performAction(deviceId, {
      selector: { text: params.text, resourceId: params.id },
      action: 'CLICK',
      focusFirst: true,  // Set accessibility focus before clicking
    });
  } else {
    // Use standard coordinate tap
    const element = await findElement(params);
    const { x, y } = getElementCenter(element.bounds);
    await adb.shell(deviceId, `input tap ${x} ${y}`);
  }
}
```

**Long Press Adaptation**:

```kotlin
// Standard: Long press via coordinate
adb shell input swipe ${x} ${y} ${x} ${y} 1000  // 1 second hold

// TalkBack: Use ACTION_LONG_CLICK
targetNode.performAction(AccessibilityNodeInfo.ACTION_LONG_CLICK)
```

#### swipeOn / scroll Tool

**Standard Behavior**:
```kotlin
// Swipe gesture via ADB
adb shell input swipe x1 y1 x2 y2 duration

// Or via AccessibilityService
val path = Path().apply {
  moveTo(x1, y1)
  lineTo(x2, y2)
}
val gesture = GestureDescription.Builder()
  .addStroke(StrokeDescription(path, 0, duration))
  .build()
dispatchGesture(gesture, callback, null)
```

**Adapted Behavior (TalkBack enabled)**:

**Option 1: Two-Finger Swipe** (Recommended for general scrolling)

```kotlin
// Two-finger swipe to scroll content in TalkBack mode
fun scrollWithTwoFingerSwipe(direction: Direction, duration: Long = 300) {
  // Calculate parallel paths for two fingers
  val (x1, y1, x2, y2) = calculateScrollBounds(direction)
  val offset = 100  // Horizontal offset between fingers

  // First finger path
  val path1 = Path().apply {
    moveTo(x1.toFloat(), y1.toFloat())
    lineTo(x2.toFloat(), y2.toFloat())
  }

  // Second finger path (parallel, offset horizontally)
  val path2 = Path().apply {
    moveTo((x1 + offset).toFloat(), y1.toFloat())
    lineTo((x2 + offset).toFloat(), y2.toFloat())
  }

  // Dispatch multi-touch gesture
  val gesture = GestureDescription.Builder()
    .addStroke(StrokeDescription(path1, 0, duration))
    .addStroke(StrokeDescription(path2, 0, duration))
    .build()

  dispatchGesture(gesture, callback, null)
}
```

**Option 2: AccessibilityAction Scroll** (Best for scrollable containers)

```kotlin
// Use accessibility scroll actions instead of gestures
val scrollableNode = findScrollableParent(rootNode)

when (direction) {
  Direction.UP -> scrollableNode.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
  Direction.DOWN -> scrollableNode.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
  Direction.LEFT -> scrollableNode.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
  Direction.RIGHT -> scrollableNode.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
}
```

**Option 3: Temporarily Suspend TalkBack** (Advanced, requires user permission)

```kotlin
// Suspend TalkBack temporarily
suspendTalkBack()

// Perform standard swipe
performStandardSwipe(x1, y1, x2, y2, duration)

// Resume TalkBack
resumeTalkBack()
```

**Recommendation Hierarchy**:
1. **Use Option 2** (Accessibility Actions) when target is a known scrollable container
2. **Use Option 1** (Two-finger swipe) for general-purpose scrolling
3. **Avoid Option 3** unless absolutely necessary (requires extra permissions)

**TypeScript Implementation**:

```typescript
async function swipeOn(params: SwipeParams): Promise<SwipeResult> {
  const isTalkBackEnabled = await detector.isAccessibilityEnabled(deviceId);

  if (isTalkBackEnabled) {
    // Try accessibility action first
    if (params.container) {
      const scrollAction = params.direction === 'up' || params.direction === 'left'
        ? 'SCROLL_BACKWARD'
        : 'SCROLL_FORWARD';

      const success = await accessibilityClient.performAction(deviceId, {
        selector: { resourceId: params.container },
        action: scrollAction,
      });

      if (success) {
        return { success: true };
      }
    }

    // Fallback to two-finger swipe
    await performTwoFingerSwipe(deviceId, params.direction, params.duration);
  } else {
    // Standard single-finger swipe
    await performStandardSwipe(deviceId, params);
  }
}
```

#### inputText Tool

**Standard Behavior**:
```kotlin
// Set text via AccessibilityService (already accessibility-friendly!)
val arguments = Bundle().apply {
  putCharSequence(ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
}
targetNode.performAction(ACTION_SET_TEXT, arguments)
```

**Adapted Behavior**: **No change needed!**

The `inputText` tool already uses `ACTION_SET_TEXT`, which TalkBack handles correctly:
- TalkBack announces character-by-character if echo is enabled
- Input focus is maintained properly
- IME interactions work as expected

**Optional Enhancement**: Announce text input completion

```kotlin
// After setting text, optionally announce completion for TalkBack users
if (isTalkBackEnabled) {
  announceForAccessibility("Text entered: $text")
}
```

#### clearText Tool

**Standard Behavior**:
```kotlin
// Clear text via ACTION_SET_TEXT with empty string
targetNode.performAction(ACTION_SET_TEXT, Bundle().apply {
  putCharSequence(ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
})
```

**Adapted Behavior**: **No change needed!**

Same as `inputText`, `ACTION_SET_TEXT` works correctly with TalkBack.

#### pressButton Tool

**Standard Behavior**:
```bash
# Hardware button presses via ADB
adb shell input keyevent KEYCODE_BACK
adb shell input keyevent KEYCODE_HOME
```

**Adapted Behavior**: **Minimal change**

Hardware buttons work the same way in TalkBack mode. However, some button behaviors differ:

- **Back Button**: May exit TalkBack local context menu instead of navigating back
- **Home Button**: Standard behavior (exits app)
- **Recent Apps**: Standard behavior (app switcher)

**Recommendation**: Add optional `forceGlobalAction` parameter:

```kotlin
// For back button in TalkBack mode, use global action to bypass local menus
if (isTalkBackEnabled && params.button == 'back' && params.forceGlobal) {
  performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
} else {
  // Standard keyevent
  adb shell input keyevent KEYCODE_BACK
}
```

---

## Tool-by-Tool Analysis

### observe Tool

**Current Behavior**:
- Extracts view hierarchy via AccessibilityNodeInfo tree traversal
- Returns elements with text, content-desc, bounds, focusable, clickable, etc.
- Applies occlusion filtering to remove hidden elements
- Detects intent choosers and permission dialogs

**TalkBack Adaptations**:

1. **Add accessibility focus indicator**:
   ```typescript
   interface ObservationResult {
     // ... existing fields ...
     accessibilityFocusedElement?: Element;
     talkBackEnabled?: boolean;  // Explicitly indicate TalkBack state
   }
   ```

2. **Content-desc priority in element representation**:
   - Already captured; no change needed
   - Search logic should prioritize content-desc when present

3. **Expose additional accessibility properties** (optional):
   ```typescript
   interface Element {
     // ... existing ...
     "accessibility-actions"?: string[];  // e.g., ["CLICK", "LONG_CLICK", "SCROLL_FORWARD"]
     "is-accessibility-focused"?: boolean;
   }
   ```

**Implementation Changes**: **Minimal**
- Add accessibility focus detection to `ObserveScreen.ts`
- Add TalkBack state to observation result metadata

**Code Location**:
- `src/features/observe/ObserveScreen.ts:observe()`
- Add call to `AccessibilityDetector.isAccessibilityEnabled()`

### tapOn Tool

**Current Behavior**:
- Finds element by text/id/content-desc
- Calculates element center coordinates
- Performs tap via ADB `input tap` or AccessibilityService gesture
- Supports tap, double-tap, long-press, long-press-drag

**TalkBack Adaptations**:

1. **Use ACTION_CLICK instead of coordinate tap**:
   ```typescript
   if (isTalkBackEnabled) {
     // Use AccessibilityService performAction
     await accessibilityClient.requestClick(element.resourceId);
   } else {
     // Standard coordinate tap
     await adb.shell(`input tap ${x} ${y}`);
   }
   ```

2. **Optional focus-first mode**:
   ```typescript
   if (params.focusFirst && isTalkBackEnabled) {
     // Set accessibility focus, then click
     await accessibilityClient.setAccessibilityFocus(element.resourceId);
     await delay(100);  // Brief delay for TalkBack announcement
   }
   await accessibilityClient.requestClick(element.resourceId);
   ```

3. **Long press**: Use `ACTION_LONG_CLICK` instead of coordinate long-press

4. **Double-tap**: Handle carefully
   - In TalkBack mode, double-tap activates focused element
   - For automation, use two ACTION_CLICK actions with delay:
     ```kotlin
     targetNode.performAction(ACTION_CLICK)
     delay(100)
     targetNode.performAction(ACTION_CLICK)
     ```

**Implementation Changes**: **Moderate**
- Modify `TapOnElement.ts:performTap()` to detect TalkBack
- Add AccessibilityService click action path
- Add optional `focusFirst` parameter

**Code Location**:
- `src/features/action/TapOnElement.ts`
- `src/features/observe/AccessibilityServiceClient.ts` (add `requestClick` method)

### swipeOn / scroll Tool

**Current Behavior**:
- Performs swipe gestures via ADB or AccessibilityService
- Supports directional swipes (up/down/left/right)
- Supports scroll-until-visible (`lookFor` parameter)
- Auto-detects scrollable containers

**TalkBack Adaptations**:

1. **Two-finger swipe for scrolling**:
   ```typescript
   if (isTalkBackEnabled && params.gestureType === 'scroll') {
     // Use two-finger swipe
     await performTwoFingerSwipe(direction, duration);
   }
   ```

2. **Accessibility scroll actions (preferred)**:
   ```typescript
   if (isTalkBackEnabled && params.container) {
     // Try accessibility action first
     const success = await performAccessibilityScroll(
       params.container,
       params.direction
     );

     if (success) return { success: true };
     // Fallback to two-finger swipe
   }
   ```

3. **Clear accessibility focus before scrolling**:
   ```typescript
   if (isTalkBackEnabled) {
     await clearAccessibilityFocus();
   }
   await performScroll();
   ```

4. **Scroll-until-visible adaptation**:
   - Use accessibility scroll actions in a loop
   - Check for element presence after each scroll
   - Set accessibility focus on target when found (optional)

**Implementation Changes**: **Significant**
- Add two-finger swipe gesture support to `ExecuteGesture.ts`
- Add accessibility scroll action support
- Modify `SwipeOn.ts` to branch based on TalkBack state
- Add WebSocket protocol for multi-touch gestures

**Code Location**:
- `src/features/action/SwipeOn.ts`
- `src/features/action/ExecuteGesture.ts`
- `android/accessibility-service/.../WebSocketServer.kt` (add multi-touch gesture endpoint)

### inputText Tool

**Current Behavior**:
- Uses AccessibilityService `ACTION_SET_TEXT`
- Finds focused EditText or searches by resource-id
- Triggers UI stability wait and fresh hierarchy extraction

**TalkBack Adaptations**: **None required!**

`ACTION_SET_TEXT` already works correctly with TalkBack:
- TalkBack announces text input character-by-character (if echo enabled)
- Input focus is maintained
- No gesture conflicts

**Optional Enhancement**:
- Add completion announcement for better user testing experience:
  ```kotlin
  if (isTalkBackEnabled) {
    announceForAccessibility("Text entered")
  }
  ```

**Implementation Changes**: **None** (optional announcement only)

### clearText Tool

**Current Behavior**:
- Uses `ACTION_SET_TEXT` with empty string
- Or uses select-all + delete via ADB

**TalkBack Adaptations**: **None required!**

Same as `inputText`, already uses accessibility-friendly ACTION_SET_TEXT.

**Implementation Changes**: **None**

### pressButton Tool

**Current Behavior**:
- Sends hardware key events via ADB
- Supports back, home, menu, recent apps, volume, power

**TalkBack Adaptations**:

1. **Back button**: May need global action override
   ```typescript
   if (isTalkBackEnabled && button === 'back' && params.forceGlobal) {
     // Use GLOBAL_ACTION_BACK to bypass TalkBack local menus
     await accessibilityClient.performGlobalAction('BACK');
   } else {
     await adb.shell(`input keyevent KEYCODE_BACK`);
   }
   ```

2. **Other buttons**: No changes needed (hardware keycodes work the same)

**Implementation Changes**: **Minimal**
- Add optional `forceGlobal` parameter
- Add AccessibilityService global action support

**Code Location**:
- `src/features/action/PressButton.ts`
- Add `performGlobalAction` to AccessibilityServiceClient

### launchApp / terminateApp / installApp Tools

**Current Behavior**:
- Launch via `am start` or `monkey`
- Terminate via `am force-stop`
- Install via `pm install`

**TalkBack Adaptations**: **None required**

App lifecycle management is unaffected by TalkBack state.

**Implementation Changes**: **None**

### listDevices / startDevice / killDevice Tools

**Current Behavior**:
- Device management via ADB
- Emulator lifecycle control

**TalkBack Adaptations**: **None required**

Device management is independent of accessibility services.

**Implementation Changes**: **None**

---

## Use Case Scenarios

### Use Case 1: Login Flow

**Scenario**: Automate login with username, password, and submit button.

**Standard Automation**:
```typescript
await tapOn({ text: "Username" });
await inputText({ text: "testuser@example.com" });
await tapOn({ text: "Password" });
await inputText({ text: "password123" });
await tapOn({ text: "Log in" });
```

**TalkBack Challenges**:
1. **Tap on fields**: Direct taps may be intercepted by TalkBack
2. **Input focus**: Must ensure EditText has input focus, not just accessibility focus
3. **Submit button**: Double-tap activation required

**Adapted Automation** (with auto-detection):
```typescript
// Auto-detection handles TalkBack transparently
await tapOn({ text: "Username" });
// ↳ Uses ACTION_CLICK on EditText node, sets input focus

await inputText({ text: "testuser@example.com" });
// ↳ Uses ACTION_SET_TEXT, works in both modes

await tapOn({ text: "Password" });
// ↳ ACTION_CLICK on password EditText

await inputText({ text: "password123" });
// ↳ ACTION_SET_TEXT

await tapOn({ text: "Log in" });
// ↳ ACTION_CLICK on button (not coordinate tap)
```

**Result**: No changes needed to automation script! Auto-detection and tool adaptations handle TalkBack transparently.

**Edge Cases**:
- **Field labels vs. EditText**: If "Username" is a TextView label, not the EditText itself:
  - Search for nearby EditText with content-desc="Username"
  - Or search for EditText with hint="Username"
  - Element search logic must check EditText neighbors

### Use Case 2: List Navigation & Scrolling

**Scenario**: Scroll through a list of items until "Item 50" is found, then tap it.

**Standard Automation**:
```typescript
await swipeOn({
  container: "item_list",
  direction: "up",
  lookFor: { text: "Item 50" },
});
await tapOn({ text: "Item 50" });
```

**TalkBack Challenges**:
1. **Swipe gesture**: Single-finger swipe navigates TalkBack focus, doesn't scroll content
2. **Scroll detection**: Must use two-finger swipe or accessibility scroll actions
3. **Focus retention**: Accessibility focus may move unpredictably during scroll

**Adapted Automation**:
```typescript
// Auto-detection enables two-finger swipe or accessibility actions
await swipeOn({
  container: "item_list",
  direction: "up",
  lookFor: { text: "Item 50" },
  // Internal: Uses ACTION_SCROLL_FORWARD or two-finger swipe
});

// Tap uses ACTION_CLICK
await tapOn({ text: "Item 50" });
```

**Implementation Details**:
```typescript
// Inside swipeOn() implementation
async function swipeOn(params: SwipeParams) {
  const isTalkBackEnabled = await detector.isAccessibilityEnabled(deviceId);

  if (isTalkBackEnabled && params.lookFor) {
    // Use accessibility scroll action loop
    let found = false;
    let iterations = 0;
    const maxIterations = 20;

    while (!found && iterations < maxIterations) {
      // Try accessibility scroll
      const scrollSuccess = await accessibilityClient.performAction({
        selector: { resourceId: params.container },
        action: params.direction === 'up' ? 'SCROLL_FORWARD' : 'SCROLL_BACKWARD',
      });

      if (!scrollSuccess) {
        // Fallback to two-finger swipe
        await performTwoFingerSwipe(params.direction);
      }

      // Check if target element is now visible
      const observation = await observe();
      found = observation.elements.some(el =>
        el.text === params.lookFor.text || el['content-desc'] === params.lookFor.text
      );

      iterations++;
      await delay(100);  // Brief stability wait
    }

    return { success: found, scrollIterations: iterations };
  } else {
    // Standard swipe logic
    // ...
  }
}
```

**Edge Cases**:
- **Infinite scroll**: Detect scroll end by checking if hierarchy changes after scroll action
- **Focus management**: Clear accessibility focus before scrolling to avoid focus-follow
- **Performance**: Accessibility scroll actions may be slower than gestures (measure and optimize)

### Use Case 3: Navigation Drawer

**Scenario**: Open navigation drawer, select "Settings", verify navigation.

**Standard Automation**:
```typescript
await swipeOn({ direction: "right", distance: "50%" });  // Swipe from left edge
await tapOn({ text: "Settings" });
await observe();  // Verify settings screen
```

**TalkBack Challenges**:
1. **Drawer gesture**: Edge swipe may conflict with TalkBack gestures
2. **Menu item tap**: Drawer items must be accessible and focusable
3. **Drawer closure**: TalkBack back gesture may close drawer unexpectedly

**Adapted Automation**:
```typescript
// Option 1: Use drawer toggle button (preferred)
await tapOn({ resourceId: "drawer_toggle" });  // Hamburger menu button
await tapOn({ text: "Settings" });

// Option 2: Programmatic drawer opening (if app supports)
await openDrawer();  // Custom action via app instrumentation
await tapOn({ text: "Settings" });

// Option 3: Edge swipe (fallback, may require two-finger swipe)
if (isTalkBackEnabled) {
  // Two-finger swipe from left edge
  await performTwoFingerEdgeSwipe("right");
} else {
  await swipeOn({ direction: "right", distance: "50%" });
}
await tapOn({ text: "Settings" });
```

**Recommendation**: Prefer explicit UI controls (hamburger menu) over edge gestures when TalkBack is enabled.

**Implementation Note**: Edge swipes are challenging with TalkBack. If app provides a visible drawer toggle button, use that instead.

### Use Case 4: Modal Dialog Handling

**Scenario**: Detect modal dialog, read message, dismiss.

**Standard Automation**:
```typescript
const observation = await observe();
const dialog = observation.elements.find(el => el.class?.includes("AlertDialog"));

if (dialog) {
  const message = dialog.text || dialog['content-desc'];
  console.log("Dialog message:", message);

  await tapOn({ text: "OK" });
}
```

**TalkBack Challenges**:
1. **Dialog detection**: Same as standard (no change)
2. **Focus scoping**: TalkBack limits focus to dialog when modal
3. **Dismissal**: Back button or tap outside may not work in TalkBack mode

**Adapted Automation**: **No changes needed!**

Dialog handling works the same:
- `observe` detects dialog elements
- `tapOn({ text: "OK" })` uses ACTION_CLICK, works in TalkBack mode
- Back button (`pressButton({ button: "back" })`) dismisses dialog in both modes

**Edge Case**:
- **Tap outside to dismiss**: If dialog dismisses on outside tap:
  ```typescript
  if (!isTalkBackEnabled) {
    // Tap outside dialog bounds
    await tap({ x: 50, y: 50 });  // Outside dialog
  } else {
    // Use back button or explicit dismiss button
    await pressButton({ button: "back" });
  }
  ```

### Use Case 5: Form Filling with Dropdowns

**Scenario**: Fill a form with text fields, dropdown selectors, and checkboxes.

**Standard Automation**:
```typescript
// Text field
await tapOn({ text: "Full Name" });
await inputText({ text: "John Doe" });

// Dropdown (Spinner)
await tapOn({ resourceId: "country_spinner" });
await tapOn({ text: "United States" });

// Checkbox
await tapOn({ resourceId: "terms_checkbox" });

// Submit
await tapOn({ text: "Submit" });
```

**TalkBack Challenges**:
1. **Spinner activation**: May require double-tap or special handling
2. **Spinner item selection**: Popup list must be accessible
3. **Checkbox state**: TalkBack announces "checked" or "not checked"

**Adapted Automation**: **Minimal changes**

```typescript
// Text field - no changes
await tapOn({ text: "Full Name" });
await inputText({ text: "John Doe" });

// Dropdown - ACTION_CLICK works for spinner
await tapOn({ resourceId: "country_spinner" });
// ↳ Opens spinner popup (TalkBack announces options)

await tapOn({ text: "United States" });
// ↳ Selects item (ACTION_CLICK)

// Checkbox - ACTION_CLICK toggles state
await tapOn({ resourceId: "terms_checkbox" });
// ↳ Toggles checkbox (TalkBack announces new state)

// Submit - no changes
await tapOn({ text: "Submit" });
```

**Verification**:
```typescript
// After checkbox tap, verify state via observe
const observation = await observe();
const checkbox = observation.elements.find(el => el['resource-id'] === 'terms_checkbox');
assert(checkbox.checked === true);
```

**Edge Case**: **Custom Dropdown** (not using Spinner)
- Some apps use custom dropdown implementations
- May require `swipeOn` to scroll dropdown options
- Verify dropdown opened by checking for popup window in observation

### Use Case 6: Search Flow

**Scenario**: Open search, enter query, select result.

**Standard Automation**:
```typescript
await tapOn({ resourceId: "search_button" });
await inputText({ text: "TalkBack testing" });
await pressButton({ button: "enter" });  // Or ime action
await tapOn({ text: "TalkBack testing guide" });  // First result
```

**TalkBack Adaptations**: **No changes needed!**

- Search button: `tapOn` uses ACTION_CLICK
- Text input: `inputText` uses ACTION_SET_TEXT
- Enter key: `pressButton` sends keyevent (works in both modes)
- Result tap: `tapOn` uses ACTION_CLICK

**Alternative IME Action**:
```typescript
await tapOn({ resourceId: "search_button" });
await inputText({ text: "TalkBack testing", imeAction: "search" });
// ↳ imeAction triggers search without separate enter key press
await tapOn({ text: "TalkBack testing guide" });
```

**Note**: `imeAction` uses `ACTION_IME_ENTER` internally, which works correctly with TalkBack.

---

## Implementation Strategy

### Phase 1: Detection & Infrastructure (Weeks 1-2)

**Goals**:
- Implement TalkBack detection with caching
- Add detection to observation flow
- Expose TalkBack state in observation results

**Deliverables**:
1. **AccessibilityDetector Class** (`src/utils/AccessibilityDetector.ts`):
   ```typescript
   class AccessibilityDetector {
     async isAccessibilityEnabled(deviceId: string): Promise<boolean>;
     invalidateCache(deviceId: string): void;
     async detectMethod(deviceId: string): Promise<'talkback' | 'voiceover' | 'none'>;
   }
   ```

2. **Detection Integration** (`src/features/observe/ObserveScreen.ts`):
   ```typescript
   interface ObservationResult {
     // ... existing fields ...
     accessibilityState?: {
       enabled: boolean;
       service: 'talkback' | 'voiceover' | 'unknown';
     };
   }
   ```

3. **Feature Flag** (`src/models/FeatureFlags.ts`):
   ```typescript
   enum FeatureFlag {
     // ... existing flags ...
     FORCE_ACCESSIBILITY_MODE = 'force-accessibility-mode',
     ACCESSIBILITY_AUTO_DETECT = 'accessibility-auto-detect',  // Default: true
   }
   ```

4. **Tests**:
   - Unit tests for detection caching
   - Integration tests with emulator (TalkBack enabled/disabled)
   - Performance benchmarks (detection latency < 50ms)

**Acceptance Criteria**:
- [ ] TalkBack detection works on Android API 29+ emulators
- [ ] Detection cached with 60-second TTL
- [ ] Observation result includes TalkBack state
- [ ] Feature flag can force-enable for testing

### Phase 2: Tool Adaptations - Core Interactions (Weeks 3-4)

**Goals**:
- Adapt `tapOn` to use ACTION_CLICK in TalkBack mode
- Adapt `swipeOn` to use two-finger swipe or scroll actions
- Add accessibility focus management (optional)

**Deliverables**:
1. **TapOnElement Adaptation** (`src/features/action/TapOnElement.ts`):
   - Add `performClickAction()` method using AccessibilityService
   - Branch logic based on TalkBack detection
   - Add optional `focusFirst` parameter

2. **AccessibilityServiceClient Extensions** (`src/features/observe/AccessibilityServiceClient.ts`):
   ```typescript
   class AccessibilityServiceClient {
     // Existing methods...

     async performAction(deviceId: string, params: {
       selector: ElementSelector;
       action: 'CLICK' | 'LONG_CLICK' | 'SCROLL_FORWARD' | 'SCROLL_BACKWARD';
     }): Promise<boolean>;

     async setAccessibilityFocus(deviceId: string, resourceId: string): Promise<boolean>;
     async clearAccessibilityFocus(deviceId: string): Promise<void>;
   }
   ```

3. **Android AccessibilityService Methods** (`android/accessibility-service/.../AutoMobileAccessibilityService.kt`):
   - Add `performClickBySelector()` method
   - Add `performScrollAction()` method
   - Add WebSocket endpoints for new actions

4. **SwipeOn Adaptation** (`src/features/action/SwipeOn.ts`):
   - Add `performTwoFingerSwipe()` method
   - Add `performAccessibilityScroll()` method
   - Branch logic based on TalkBack detection
   - Adapt scroll-until-visible logic

5. **ExecuteGesture Extensions** (`src/features/action/ExecuteGesture.ts`):
   - Add multi-touch gesture support for two-finger swipes
   - Update WebSocket protocol

6. **Tests**:
   - E2E tests with TalkBack enabled on emulator
   - Verify `tapOn` uses ACTION_CLICK (not coordinate tap)
   - Verify `swipeOn` uses two-finger swipe for scrolling
   - Test scroll-until-visible in TalkBack mode

**Acceptance Criteria**:
- [ ] `tapOn` works correctly with TalkBack enabled
- [ ] `swipeOn` scrolls content (not TalkBack focus) with TalkBack enabled
- [ ] No changes required to agent automation scripts
- [ ] Performance: No significant latency increase (<50ms overhead)

### Phase 3: Advanced Features (Weeks 5-6)

**Goals**:
- Add accessibility focus tracking to observations
- Implement scroll-until-visible with focus management
- Add optional explicit focus control tools

**Deliverables**:
1. **Accessibility Focus in Observations**:
   ```typescript
   interface ObservationResult {
     // ... existing ...
     accessibilityFocusedElement?: Element;
   }
   ```

2. **Scroll-Until-Visible Enhancement**:
   - Clear accessibility focus before scrolling
   - Set accessibility focus on target when found (optional)
   - Add `focusTarget` parameter to `swipeOn`

3. **New MCP Tools** (optional, future work):
   ```typescript
   // Set TalkBack focus explicitly
   {
     name: "setAccessibilityFocus",
     parameters: { text?, resourceId?, contentDesc? },
     result: { success: boolean }
   }

   // Get current TalkBack focus
   {
     name: "getAccessibilityFocus",
     result: { focusedElement?: Element }
   }
   ```

4. **Tests**:
   - Verify accessibility focus tracking in observations
   - Test scroll-until-visible with focus management
   - Manual testing with real TalkBack users (if possible)

**Acceptance Criteria**:
- [ ] Observations include accessibility-focused element
- [ ] Scroll-until-visible works reliably with TalkBack
- [ ] Optional focus control tools functional

### Phase 4: Documentation & Polish (Week 7)

**Goals**:
- Document TalkBack support in user-facing docs
- Create example automation scripts
- Performance optimization

**Deliverables**:
1. **User Documentation** (`docs/features/accessibility-support.md`):
   - How TalkBack support works (auto-detection)
   - Best practices for accessible automation
   - Troubleshooting guide

2. **Example Scripts**:
   - Login flow with TalkBack
   - List scrolling with TalkBack
   - Form filling with TalkBack

3. **Performance Benchmarks**:
   - Detection latency: <50ms (cached)
   - Tool execution overhead: <50ms
   - Scroll performance: comparable to standard mode

4. **Migration Guide**:
   - No migration needed (auto-detection)
   - Optional: How to force-enable for testing

**Acceptance Criteria**:
- [ ] Documentation complete and reviewed
- [ ] Example scripts tested on real devices
- [ ] Performance benchmarks met

---

## iOS VoiceOver Considerations

### Differences from TalkBack

While the high-level concepts are similar, iOS VoiceOver has distinct characteristics:

| Aspect | Android TalkBack | iOS VoiceOver |
|--------|------------------|---------------|
| **Detection API** | `AccessibilityManager` or settings query | `UIAccessibility.isVoiceOverRunning` |
| **Accessibility Tree** | `AccessibilityNodeInfo` | `AXUIElement` |
| **Activation Gesture** | Double-tap | Double-tap |
| **Scroll Gesture** | Two-finger swipe | Three-finger swipe |
| **Navigation** | Swipe right/left | Swipe right/left |
| **Focus API** | `FOCUS_ACCESSIBILITY` | `UIAccessibilityFocus` |
| **Rotor** | No equivalent (uses menus) | Rotor dial for navigation modes |
| **Magic Tap** | No equivalent | Two-finger double-tap for primary action |

### VoiceOver-Specific Adaptations

**Detection**:
```swift
// iOS VoiceOver detection via XCTest
let isVoiceOverEnabled = UIAccessibility.isVoiceOverRunning
```

**Tap Adaptation**:
```swift
// Use XCUIElement.tap() - automatically handles VoiceOver
let element = app.buttons["Login"]
element.tap()  // Works in both modes
```

**Scroll Adaptation**:
```swift
// Three-finger swipe for scrolling in VoiceOver mode
if UIAccessibility.isVoiceOverRunning {
  // Use three-finger swipe
  element.swipeUp(velocity: .slow)  // Three-finger equivalent
} else {
  element.swipeUp()  // Standard swipe
}
```

**Focus Management**:
```swift
// Set VoiceOver focus
element.setFocus()
```

### iOS Implementation Strategy

iOS VoiceOver support will follow the same phased approach as Android:

1. **Phase 1**: Detection via `UIAccessibility.isVoiceOverRunning`
2. **Phase 2**: Tap adaptation (XCUIElement.tap already VoiceOver-compatible)
3. **Phase 3**: Scroll adaptation (three-finger swipe support)
4. **Phase 4**: Focus management and advanced features

**Note**: iOS implementation is **secondary priority**. Initial focus is Android TalkBack validation and refinement.

---

## Testing Approach

### Test Plan Structure

#### Unit Tests

**Scope**: Individual components in isolation

**Test Cases**:
1. **AccessibilityDetector**:
   - Cache behavior (hit/miss/expiry)
   - Detection methods (settings query, AccessibilityManager)
   - Feature flag overrides

2. **Element Search with Content-Desc**:
   - Find element by content-desc (not text)
   - Priority: content-desc over text
   - Fuzzy matching with merged content

3. **Gesture Path Calculation**:
   - Two-finger swipe path generation
   - Multi-touch gesture timing
   - Edge swipe detection

**Tools**: Jest, TypeScript unit test framework

#### Integration Tests

**Scope**: Tool behavior on live devices/emulators with TalkBack enabled

**Test Cases**:
1. **tapOn with TalkBack**:
   - Tap button by text → Verify ACTION_CLICK used
   - Tap EditText by content-desc → Verify input focus gained
   - Long press → Verify ACTION_LONG_CLICK used

2. **swipeOn with TalkBack**:
   - Scroll down → Verify two-finger swipe or scroll action used
   - Scroll-until-visible → Verify target element found
   - Scroll in scrollable container → Verify ACTION_SCROLL_FORWARD used

3. **inputText with TalkBack**:
   - Enter text in EditText → Verify text appears
   - IME action "done" → Verify focus moves / keyboard dismisses

4. **Observation with TalkBack**:
   - Observe screen → Verify TalkBack state included
   - Observe accessibility focus → Verify focused element identified
   - Observe merged elements → Verify parent content-desc captured

**Setup**: Android emulator (API 29, 34) with TalkBack enabled

**Tools**: Jest, ADB, AutoMobile test harness

#### End-to-End Tests

**Scope**: Complete automation workflows on real apps

**Test Cases**:
1. **Login Flow** (Google Sign-In or sample app):
   - Launch app
   - Enable TalkBack
   - Automate login (username, password, submit)
   - Verify successful login
   - Disable TalkBack
   - Repeat automation (verify works in both modes)

2. **List Navigation** (Contacts app or sample app):
   - Enable TalkBack
   - Scroll through list until target item visible
   - Tap target item
   - Verify detail view opened

3. **Form Filling** (Settings or sample app):
   - Enable TalkBack
   - Fill text fields, select dropdowns, toggle checkboxes
   - Submit form
   - Verify form submission successful

4. **Navigation Drawer** (Gmail or sample app):
   - Enable TalkBack
   - Open drawer via hamburger menu
   - Select menu item
   - Verify navigation to target screen

**Setup**:
- Android physical device with TalkBack enabled
- Emulator with TalkBack enabled (API 34 recommended)
- Sample app with common UI patterns

**Tools**: AutoMobile MCP server, Claude Desktop (or MCP client), manual verification

#### Accessibility Audit Tests

**Scope**: Validate accessibility properties are correctly captured

**Test Cases**:
1. **Content Description Priority**:
   - Element with both text and content-desc
   - Verify TalkBack announces content-desc (not text)
   - Verify element search finds by content-desc

2. **Focusable Elements**:
   - Enumerate all focusable elements in observation
   - Verify non-focusable elements excluded (when appropriate)
   - Verify focusable property accurate

3. **Merged Element Detection**:
   - Parent with multiple text children
   - Verify merged content-desc captured
   - Verify children still present in hierarchy (but may be marked non-important)

**Tools**: AutoMobile WCAG audit, manual TalkBack testing

### Emulator Configuration

**Recommended Setup**:

```bash
# Create Android emulator with Google APIs (includes TalkBack)
avdmanager create avd -n talkback-test -k "system-images;android-34;google_apis;x86_64"

# Start emulator
emulator -avd talkback-test -no-snapshot-load

# Enable TalkBack via ADB
adb shell settings put secure enabled_accessibility_services \
  com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService
adb shell settings put secure accessibility_enabled 1

# Verify TalkBack enabled
adb shell dumpsys accessibility | grep TalkBack
```

**Troubleshooting**:
- **TalkBack not installed**: Use system image with Google APIs (includes TalkBack)
- **Permission dialog**: Programmatically accept via UI Automator:
  ```bash
  adb shell input tap <x> <y>  # Tap "Allow" button
  ```
- **TalkBack doesn't start**: Restart device after enabling settings

### Validation Criteria

**Functional**:
- [ ] All MCP tools work correctly with TalkBack enabled
- [ ] No changes required to existing automation scripts
- [ ] Element search finds elements by content-desc and text
- [ ] Scroll gestures work correctly (two-finger swipe or scroll actions)
- [ ] Tap gestures activate elements (not just focus them)

**Performance**:
- [ ] TalkBack detection adds <50ms latency per tool call (amortized via caching)
- [ ] Tool execution time comparable to non-TalkBack mode (within 10%)
- [ ] Observation extraction time unchanged (already uses AccessibilityNodeInfo)

**Reliability**:
- [ ] Detection cache works correctly (no false positives/negatives)
- [ ] Graceful fallback if detection fails (log warning, use standard mode)
- [ ] No crashes or errors when TalkBack state changes mid-session

**Accessibility**:
- [ ] Automated tests can complete same tasks as manual TalkBack users
- [ ] Accessibility focus tracked accurately (when enabled)
- [ ] Element announcements match what TalkBack users hear (manual validation)

---

## Future Enhancements

### Priority 1: Advanced Focus Control

**Goal**: Give agents explicit control over accessibility focus for precise navigation

**New Tools**:
```typescript
// Set TalkBack/VoiceOver focus
{
  name: "setAccessibilityFocus",
  description: "Move screen reader focus to a specific element",
  parameters: {
    text?: string;
    resourceId?: string;
    contentDesc?: string;
    announce?: boolean;  // Trigger announcement
  },
  result: {
    success: boolean;
    focusedElement?: Element;
  }
}

// Get current accessibility focus
{
  name: "getAccessibilityFocus",
  description: "Get the element that currently has screen reader focus",
  result: {
    focusedElement?: Element;
  }
}

// Navigate focus sequentially
{
  name: "navigateFocus",
  description: "Move screen reader focus to next/previous element",
  parameters: {
    direction: "next" | "previous" | "first" | "last";
  },
  result: {
    success: boolean;
    focusedElement?: Element;
  }
}
```

**Use Case**:
```typescript
// Precise navigation through form fields
await setAccessibilityFocus({ contentDesc: "Username field" });
await inputText({ text: "testuser" });

await navigateFocus({ direction: "next" });  // Move to password field
await inputText({ text: "password123" });

await navigateFocus({ direction: "next" });  // Move to submit button
await tapOn({ focusedElement: true });       // Tap currently focused element
```

**Complexity**: Moderate (requires AccessibilityService focus APIs)

### Priority 2: Announcement Control

**Goal**: Trigger TalkBack/VoiceOver announcements for user testing scenarios

**New Tool**:
```typescript
{
  name: "announce",
  description: "Trigger a screen reader announcement",
  parameters: {
    text: string;
    priority?: "polite" | "assertive";  // Interrupt current speech or queue
  },
  result: {
    success: boolean;
  }
}
```

**Use Case**:
```typescript
// Test form validation feedback
await tapOn({ text: "Submit" });
await announce({ text: "Form submitted successfully", priority: "polite" });

// Verify user hears correct announcement (manual validation)
```

**Implementation**:
```kotlin
// Android AccessibilityService
fun announceForAccessibility(text: String) {
  val event = AccessibilityEvent.obtain().apply {
    eventType = AccessibilityEvent.TYPE_ANNOUNCEMENT
    text.add(text)
  }

  val am = getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
  am.sendAccessibilityEvent(event)
}
```

**Complexity**: Low (simple API call)

### Priority 3: Enhanced Scroll-Until-Visible

**Goal**: More robust scroll-until-visible with focus management and loop detection

**Enhancements**:
1. **Smart Loop Detection**:
   - Track view hierarchy hash after each scroll
   - Detect when hierarchy stops changing (reached end of list)
   - Exit early to avoid infinite loops

2. **Focus Tracking**:
   - Optionally track accessibility focus during scroll
   - Set focus on target when found
   - Report focus position to agent

3. **Bi-directional Search**:
   - Scroll in both directions if initial direction fails
   - Useful for circular lists or unknown target position

**Enhanced API**:
```typescript
await swipeOn({
  container: "list",
  direction: "up",
  lookFor: { text: "Item 50" },
  focusTarget: true,              // Set focus when found
  bidirectional: true,            // Try both directions
  maxIterations: 30,              // Safety limit
  detectEnd: true,                // Stop when list end reached
});
```

**Complexity**: Moderate (requires hierarchy change detection)

### Priority 4: Accessibility Tree Export

**Goal**: Export full accessibility tree structure for debugging and analysis

**New Tool**:
```typescript
{
  name: "getAccessibilityTree",
  description: "Get complete accessibility node hierarchy with all properties",
  parameters: {
    includeNonFocusable?: boolean;   // Include non-focusable elements
    includeActions?: boolean;        // Include available actions per node
    format?: "json" | "xml";         // Output format
  },
  result: {
    tree: AccessibilityTree;
    metadata: {
      totalNodes: number;
      focusableNodes: number;
      talkBackEnabled: boolean;
    };
  }
}
```

**Use Case**:
- Debugging why element search fails
- Understanding element merging and content-desc priority
- Analyzing accessibility focus behavior

**Complexity**: Low (existing extraction logic, just expose more properties)

### Priority 5: Gesture Simulation Improvements

**Goal**: Simulate complex TalkBack gestures for advanced testing

**New Gestures**:
- **TalkBack Local Context Menu**: Three-finger single tap
- **TalkBack Global Context Menu**: Three-finger swipe up
- **Read from Top**: Three-finger swipe down
- **Rotor Navigation** (iOS): Two-finger rotate gesture

**New Tool**:
```typescript
{
  name: "performAccessibilityGesture",
  description: "Perform platform-specific accessibility gestures",
  parameters: {
    gesture: "local-menu" | "global-menu" | "read-from-top" | "rotor";
    rotorOption?: "headings" | "links" | "form-controls";  // iOS only
  },
  result: {
    success: boolean;
  }
}
```

**Complexity**: High (complex multi-touch gestures, platform-specific)

### Priority 6: Accessibility Auditing Integration

**Goal**: Combine TalkBack support with accessibility auditing for comprehensive testing

**Integration**:
```typescript
// Run accessibility audit with TalkBack simulation
const audit = await runA11yChecks({
  scope: "screen",
  simulateTalkBack: true,  // Simulate how TalkBack would traverse/announce
  includeAnnouncements: true,  // Report what TalkBack would announce
});

// Results include:
// - Missing content-desc warnings
// - Incorrect focus order
// - Unreachable elements (not focusable in TalkBack mode)
// - Announcement text for each element
```

**Use Case**: Validate app is truly accessible before manual testing

**Complexity**: Moderate (combine existing audit with focus traversal)

### Priority 7: iOS VoiceOver Parity

**Goal**: Full feature parity with Android TalkBack support

**Deliverables**:
- VoiceOver detection via `UIAccessibility.isVoiceOverRunning`
- Three-finger swipe for scrolling
- VoiceOver focus tracking
- Rotor support
- Magic Tap and Z-gesture support

**Complexity**: Moderate (conceptually similar to TalkBack, different APIs)

---

## Open Questions & Risks

### Open Questions

1. **TalkBack Version Differences**:
   - Do TalkBack gestures differ across Android versions (API 29 vs 34)?
   - Are accessibility APIs consistent, or do we need version-specific branches?
   - **Mitigation**: Test on multiple API levels (29, 31, 34), document any differences

2. **Third-Party Accessibility Services**:
   - What if users have custom accessibility services (not TalkBack)?
   - Should we detect and support them, or only focus on TalkBack/VoiceOver?
   - **Decision**: Detect any spoken-feedback accessibility service, adapt behavior generically

3. **Performance Impact**:
   - Does TalkBack enablement slow down tool execution (e.g., waiting for announcements)?
   - Should we add explicit delays after actions for TalkBack announcements to complete?
   - **Mitigation**: Benchmark tool execution times, add configurable delays if needed

4. **Focus Management Philosophy**:
   - Should we always set accessibility focus before clicking, or only when requested?
   - Does setting focus add unnecessary latency for agents that don't need announcements?
   - **Decision**: Default to focus-first (mimics user behavior), add `skipFocus` option for speed

5. **Edge Swipe Reliability**:
   - Can we reliably simulate edge swipes (e.g., drawer open) with two-finger gestures?
   - Should we recommend avoiding edge swipes in TalkBack mode?
   - **Mitigation**: Test edge swipes, document limitations, prefer explicit UI controls

### Risks

#### Risk 1: Detection False Positives/Negatives

**Description**: TalkBack detection may incorrectly report enabled/disabled state

**Impact**: High - Tools may use wrong interaction mode, causing failures

**Likelihood**: Low (multiple detection methods available)

**Mitigation**:
- Use multiple detection methods as fallback (AccessibilityManager → settings query → dumpsys)
- Add explicit feature flag override for edge cases
- Log detection method and result for debugging
- Add detection validation test (enable TalkBack, verify detection, disable, verify again)

#### Risk 2: Gesture Conflicts

**Description**: Two-finger or multi-touch gestures may conflict with TalkBack global gestures

**Impact**: Medium - Gestures may be intercepted, automation fails unexpectedly

**Likelihood**: Medium (depends on TalkBack version and configuration)

**Mitigation**:
- Prefer accessibility scroll actions over gestures when possible
- Test multi-touch gestures extensively on different Android versions
- Document known gesture conflicts
- Provide fallback to accessibility actions

#### Risk 3: Performance Degradation

**Description**: TalkBack detection and adapted tool execution may add latency

**Impact**: Medium - Slower automation, poor agent experience

**Likelihood**: Low (detection is cached, actions are comparable speed)

**Mitigation**:
- Aggressive caching of detection results (60-second TTL)
- Benchmark tool execution time with/without TalkBack
- Target: <50ms detection overhead, <10% tool execution time increase
- Profile and optimize hot paths if benchmarks fail

#### Risk 4: Element Search Failures

**Description**: Merged elements and content-desc priority may break existing element searches

**Impact**: High - Existing automation scripts may fail

**Likelihood**: Medium (depends on app implementation and selectors used)

**Mitigation**:
- Update element search logic to check both text and content-desc
- Add fuzzy matching for merged content-desc
- Provide clear error messages when element not found (suggest checking content-desc)
- Add debugging tool to dump element properties (see Future Work: Accessibility Tree Export)
- Document best practices for selector design (prefer resource-id when available)

#### Risk 5: Incomplete iOS Support

**Description**: iOS VoiceOver support may lag behind Android TalkBack

**Impact**: Low - Android is primary platform, iOS is secondary

**Likelihood**: High (iOS is secondary priority)

**Mitigation**:
- Clearly document iOS support as "experimental" or "limited"
- Focus on Android TalkBack first, validate thoroughly
- Use learnings from Android to inform iOS implementation
- Defer advanced iOS features (Rotor, Magic Tap) until Android is stable

#### Risk 6: App-Specific Accessibility Quirks

**Description**: Some apps may implement custom accessibility behavior that conflicts with our adaptations

**Impact**: Medium - Automation fails on specific apps

**Likelihood**: Medium (custom views, accessibility delegates, etc.)

**Mitigation**:
- Test on diverse set of apps (system apps, third-party apps, custom apps)
- Provide fallback to standard behavior via feature flag
- Document known app-specific issues and workarounds
- Add `debugSearch` tool enhancements to help diagnose issues

---

## Conclusion

### Summary

This design document defines a comprehensive approach to adapting AutoMobile's MCP tools for TalkBack and VoiceOver accessibility services. Key principles:

1. **Auto-detection**: Tools automatically detect and adapt to accessibility services without requiring explicit mode parameters
2. **Backward Compatibility**: No changes to existing tool interfaces or automation scripts
3. **Transparency**: Behavior adaptations are invisible to MCP consumers (agents)
4. **Android-first**: Primary focus on Android TalkBack, with conceptual design for iOS VoiceOver

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Auto-detect accessibility state** | Seamless experience, no agent changes required |
| **Use AccessibilityNodeInfo actions** | More reliable than coordinate-based gestures, works in both modes |
| **Two-finger swipe for scrolling** | Standard TalkBack scroll gesture, user-familiar |
| **Prioritize accessibility scroll actions** | Faster and more reliable than gesture simulation |
| **Cache detection results (60s TTL)** | Balance freshness vs performance |
| **Focus-first clicking (default)** | Mimics user behavior, provides TalkBack feedback |
| **Minimal observation changes** | Already uses AccessibilityNodeInfo, no major refactoring needed |

### Next Steps

1. **Review this design document** with team and stakeholders
2. **Validate assumptions** with manual TalkBack testing on real devices
3. **Begin Phase 1 implementation** (detection & infrastructure)
4. **Create tracking issue** for implementation phases
5. **Set up test emulators** with TalkBack enabled for CI/CD

### Success Metrics

**Functional**:
- ✅ All existing automation scripts work with TalkBack enabled (no changes required)
- ✅ New automation scripts can target TalkBack users explicitly (optional focus control)
- ✅ Element search finds elements by content-desc and text
- ✅ Scroll-until-visible works reliably in TalkBack mode

**Performance**:
- ✅ Detection latency: <50ms (cached)
- ✅ Tool execution overhead: <10% compared to non-TalkBack mode
- ✅ No observable slowdown for agents

**User Experience**:
- ✅ Clear documentation for TalkBack support
- ✅ Example automation scripts demonstrating key use cases
- ✅ Debugging tools for troubleshooting element search failures

**Long-term**:
- ✅ iOS VoiceOver support implemented with feature parity
- ✅ Accessibility auditing integrated with TalkBack simulation
- ✅ Advanced focus control available for precision testing

---

**Document Version**: 1.0
**Author**: AutoMobile Team
**Date**: 2026-01-08
**Status**: Ready for Review
