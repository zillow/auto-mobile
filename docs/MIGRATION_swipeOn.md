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
    "screen": true,
    "direction": "up",
    "includeSystemInsets": false,
    "duration": 300,
    "platform": "android"
  }
}
```

**Changes:**
- Add `"screen": true` to indicate full-screen swipe
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
    "elementId": "com.example:id/carousel",
    "direction": "left",
    "duration": 300,
    "platform": "android"
  }
}
```

**Changes:**
- Remove `screen` field (or set to `false`)
- Specify element via `elementId` or `text`
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
    "elementId": "com.example:id/list",
    "direction": "down",
    "speed": "normal",
    "platform": "android"
  }
}
```

**Changes:**
- Flatten `container.elementId` to just `elementId`
- Can also use `containerText` instead of `containerElementId`
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
    "containerElementId": "com.example:id/list",
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
- Change `container.elementId` to `containerElementId`
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
    "containerText": "Products",
    "direction": "up",
    "platform": "android"
  }
}
```

**Changes:**
- Change `container.text` to `containerText`

## Complete Parameter Reference

### swipeOn Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `screen` | boolean | No | Set to `true` for full-screen swipe |
| `text` | string | No* | Text of element to swipe on |
| `elementId` | string | No* | Resource ID of element to swipe on |
| `containerElementId` | string | No | Container element ID to restrict search |
| `containerText` | string | No | Container text to restrict search |
| `direction` | enum | **Yes** | Direction: "up", "down", "left", "right" |
| `lookFor` | object | No | Search for element while scrolling |
| `lookFor.text` | string | No* | Text to search for |
| `lookFor.elementId` | string | No* | Element ID to search for |
| `lookFor.maxTime` | number | No | Max search time (default: 15000ms) |
| `speed` | enum | No | Speed: "slow", "normal", "fast" |
| `duration` | number | No | Manual duration override (ms) |
| `scrollMode` | enum | No | Mode: "adb", "a11y" |
| `includeSystemInsets` | boolean | No | Include status/nav bars (screen swipes) |
| `platform` | enum | **Yes** | Platform: "android", "ios" |

\* At least one target type must be specified: `screen`, `text`, `elementId`, or use `lookFor` for scroll-until-visible

## Operation Modes

The `swipeOn` tool automatically determines the operation mode based on parameters:

### 1. Screen Swipe Mode
- **Trigger**: `screen: true`
- **Behavior**: Swipes across the entire screen (respects system insets by default)
- **Use case**: Page scrolling, app navigation

### 2. Element Swipe Mode
- **Trigger**: `text` or `elementId` specified (without `lookFor`)
- **Behavior**: Swipes within the specified element's bounds
- **Use case**: Carousel swiping, horizontal scrolling

### 3. Scroll-Until-Visible Mode
- **Trigger**: `lookFor` object specified
- **Behavior**: Repeatedly scrolls until target element is found or timeout
- **Use case**: Finding elements in long lists

## Best Practices

1. **Use screen swipes for page navigation:**
   ```json
   { "screen": true, "direction": "up" }
   ```

2. **Use element swipes for carousels:**
   ```json
   { "elementId": "carousel", "direction": "left" }
   ```

3. **Use lookFor for finding elements in lists:**
   ```json
   {
     "containerElementId": "list",
     "direction": "down",
     "lookFor": { "text": "Item 42" }
   }
   ```

4. **Prefer `speed` over `duration` for readability:**
   ```json
   { "speed": "fast" }  // Instead of { "duration": 100 }
   ```

5. **Use `scrollMode: "a11y"` for faster scrolling on Android:**
   ```json
   { "scrollMode": "a11y" }  // ~50-150ms vs ~540ms with adb
   ```

## Common Migration Mistakes

### ❌ Don't nest container in an object
```json
{
  "container": { "elementId": "list" }  // OLD WAY
}
```

### ✅ Use flat structure
```json
{
  "containerElementId": "list"  // NEW WAY
}
```

### ❌ Don't forget to specify target type
```json
{
  "direction": "up"  // ERROR: No target specified
}
```

### ✅ Always specify at least one target
```json
{
  "screen": true,  // Target type
  "direction": "up"
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
