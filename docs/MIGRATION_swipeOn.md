# Migration Guide: Unified swipeOn Tool

## Overview

The `swipeOn` tool consolidates three previously separate tools into a single, unified interface:
- `swipeOnScreen` - Full-screen swipes
- `swipeOnElement` - Swipes on specific elements
- `scroll` - Scrolling with optional element search

This migration guide will help you transition from the old tools to the new unified `swipeOn` tool.

## Deprecation Timeline

- **Phase 1 (Current)**: New `swipeOn` tool is available
- **Phase 2 (Current)**: Old tools marked as deprecated but still functional
- **Phase 3 (Future v2.0.0)**: Old tools will be removed

## Migration Examples

### 1. swipeOnScreen → swipeOn

**Before (swipeOnScreen):**
```json
{
  "tool": "swipeOnScreen",
  "arguments": {
    "direction": "up",
    "includeSystemInsets": false,
    "duration": 300,
    "platform": "android"
  }
}
```

**After (swipeOn):**
```json
{
  "tool": "swipeOn",
  "arguments": {
    "direction": "up",
    "includeSystemInsets": false,
    "duration": 300,
    "platform": "android"
  }
}
```

**Changes:**
- Omit `container` to indicate a full-screen swipe
- All other parameters remain the same

### 2. swipeOnElement → swipeOn

**Before (swipeOnElement):**
```json
{
  "tool": "swipeOnElement",
  "arguments": {
    "elementId": "com.example:id/carousel",
    "direction": "left",
    "duration": 300,
    "platform": "android"
  }
}
```

**After (swipeOn):**
```json
{
  "tool": "swipeOn",
  "arguments": {
    "container": {
      "elementId": "com.example:id/carousel"
    },
    "direction": "left",
    "duration": 300,
    "platform": "android"
  }
}
```

**Changes:**
- Specify the swipe target using `container.elementId` or `container.text`
- Duration and direction remain the same

### 3. scroll (simple) → swipeOn

**Before (scroll):**
```json
{
  "tool": "scroll",
  "arguments": {
    "container": {
      "elementId": "com.example:id/list"
    },
    "direction": "down",
    "speed": "normal",
    "platform": "android"
  }
}
```

**After (swipeOn):**
```json
{
  "tool": "swipeOn",
  "arguments": {
    "container": {
      "elementId": "com.example:id/list"
    },
    "direction": "down",
    "speed": "normal",
    "platform": "android"
  }
}
```

**Changes:**
- Keep `container.elementId` under `container`
- Speed parameter remains the same

### 4. scroll (with lookFor) → swipeOn

**Before (scroll):**
```json
{
  "tool": "scroll",
  "arguments": {
    "container": {
      "elementId": "com.example:id/list"
    },
    "direction": "down",
    "lookFor": {
      "text": "Submit",
      "maxTime": 15000
    },
    "speed": "fast",
    "scrollMode": "a11y",
    "platform": "android"
  }
}
```

**After (swipeOn):**
```json
{
  "tool": "swipeOn",
  "arguments": {
    "container": {
      "elementId": "com.example:id/list"
    },
    "direction": "down",
    "lookFor": {
      "text": "Submit",
      "maxTime": 15000
    },
    "speed": "fast",
    "scrollMode": "a11y",
    "platform": "android"
  }
}
```

**Changes:**
- Keep `container.elementId` under `container`
- `lookFor` structure remains the same
- Speed and scrollMode parameters remain the same

### 5. scroll (by container text) → swipeOn

**Before (scroll):**
```json
{
  "tool": "scroll",
  "arguments": {
    "container": {
      "text": "Products"
    },
    "direction": "up",
    "platform": "android"
  }
}
```

**After (swipeOn):**
```json
{
  "tool": "swipeOn",
  "arguments": {
    "container": {
      "text": "Products"
    },
    "direction": "up",
    "platform": "android"
  }
}
```

**Changes:**
- Keep `container.text` under `container`

## Complete Parameter Reference

### swipeOn Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `container` | object | No | Container element to swipe within. REQUIRED for list scrolling; omit for full-screen swipes. |
| `container.elementId` | string | No* | Resource ID of container element |
| `container.text` | string | No* | Text within container element (finds nearest scrollable parent) |
| `autoTarget` | boolean | No | Auto-target a scrollable container when `container` is omitted (default true). Set to false only if you intend to swipe the entire screen after autoTarget selected a list unexpectedly. |
| `direction` | enum | **Yes** | Direction: "up", "down", "left", "right". Interpretation depends on `gestureType`. |
| `gestureType` | enum | No | How to interpret direction: "swipeFingerTowardsDirection" (default, finger moves in direction) or "scrollTowardsDirection" (content scrolls in direction). |
| `lookFor` | object | No | Search for element while scrolling |
| `lookFor.text` | string | No* | Text to search for |
| `lookFor.elementId` | string | No* | Element ID to search for |
| `lookFor.maxTime` | number | No | Max search time (default: 15000ms) |
| `speed` | enum | No | Speed: "slow", "normal", "fast" |
| `duration` | number | No | Manual duration override (ms) |
| `scrollMode` | enum | No | Mode: "adb", "a11y" |
| `includeSystemInsets` | boolean | No | Include status/nav bars (screen swipes) |
| `platform` | enum | **Yes** | Platform: "android", "ios" |

\* When using `container`, specify exactly one of `container.elementId` or `container.text`

## Operation Modes

The `swipeOn` tool automatically determines the operation mode based on parameters:

### 1. Screen Swipe Mode
- **Trigger**: `container` omitted and no `lookFor`
- **Behavior**: Swipes across the entire screen (respects system insets by default)
- **Use case**: Page scrolling, app navigation

### 2. Element Swipe Mode
- **Trigger**: `container` specified (without `lookFor`)
- **Behavior**: Swipes within the specified element's bounds
- **Use case**: Carousel swiping, horizontal scrolling

### 3. Scroll-Until-Visible Mode
- **Trigger**: `lookFor` object specified (optionally with `container`)
- **Behavior**: Repeatedly scrolls until target element is found or timeout
- **Use case**: Finding elements in long lists

## Best Practices

1. **Use screen swipes for page navigation (omit `container`; set `autoTarget: false` if a list is auto-selected):**
   ```json
   { "direction": "up", "platform": "android", "autoTarget": false }
   ```

2. **Use container swipes for lists and feeds:**
   ```json
   { "container": { "elementId": "list" }, "direction": "up", "platform": "android" }
   ```

3. **Use element swipes for carousels:**
   ```json
   { "container": { "elementId": "carousel" }, "direction": "left", "platform": "android" }
   ```

4. **Use lookFor for finding elements in lists:**
   ```json
   {
     "container": { "elementId": "list" },
     "direction": "up",
     "lookFor": { "text": "Item 42" },
     "platform": "android"
   }
   ```

5. **Use `gestureType` when thinking in terms of content movement:**
   ```json
   { "direction": "up", "gestureType": "scrollTowardsDirection", "platform": "android" }
   ```
   This scrolls content upward (finger swipes down) to reveal content above.

6. **Prefer `speed` over `duration` for readability:**
   ```json
   { "speed": "fast" }  // Instead of { "duration": 100 }
   ```

7. **Use `scrollMode: "a11y"` for faster scrolling on Android:**
   ```json
   { "scrollMode": "a11y" }  // ~50-150ms vs ~540ms with adb
   ```

## Common Migration Mistakes

### ❌ Don't scroll lists without a container
```json
{
  "direction": "up",
  "platform": "android"
}
```

### ✅ Target the list container explicitly
```json
{
  "container": { "elementId": "list" },
  "direction": "up",
  "platform": "android"
}
```

### ❌ Don't disable autoTarget unless you want a full-screen swipe
```json
{
  "direction": "up",
  "autoTarget": false,
  "platform": "android"
}
```

### ✅ Keep autoTarget enabled for list scrolling when container is unknown
```json
{
  "direction": "up",
  "platform": "android"
}
```

### ❌ Don't set both container fields
```json
{
  "container": { "elementId": "list", "text": "Items" }
}
```

### ✅ Provide exactly one container locator
```json
{
  "container": { "text": "Items" }
}
```

## Benefits of swipeOn

1. **Consistent API**: One tool follows the same pattern as `tapOn`
2. **Reduced confusion**: No more choosing between three similar tools
3. **Better discoverability**: All swipe functionality in one place
4. **Cleaner codebase**: Reduced maintenance overhead
5. **Future-proof**: Easier to add new features to one unified tool

## Need Help?

If you encounter issues during migration or have questions, please:
1. Check the [full swipeOn documentation](../README.md)
2. Review these migration examples
3. Open an issue on GitHub with your specific use case
