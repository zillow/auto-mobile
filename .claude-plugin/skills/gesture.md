---
description: Tap, swipe, scroll, pinch, drag and other gestures
allowed-tools: mcp__auto-mobile__tapOn, mcp__auto-mobile__swipeOn, mcp__auto-mobile__dragAndDrop, mcp__auto-mobile__pinchOn
---

Perform touch gestures including taps, swipes, scrolls, pinches, and drag-and-drop.

## Tap Actions

Use `tapOn` to interact with elements:

**Single tap:**
```
tapOn with text: "Submit"
tapOn with id: "login_button"
```

**Double tap:**
```
tapOn with text: "Image", action: "doubleTap"
```

**Long press:**
```
tapOn with text: "Item", action: "longPress"
```

**Focus (without keyboard):**
```
tapOn with text: "Email", action: "focus"
```

### Targeting Elements

- `text`: Match by visible text
- `id`: Match by accessibility ID or resource ID
- `container`: Scope search within a parent element

```
tapOn with text: "Save", container: {id: "dialog"}
```

## Swipe & Scroll

Use `swipeOn` for scrolling and swiping:

**Scroll content:**
```
swipeOn with direction: "up"      # Scroll down (content moves up)
swipeOn with direction: "down"    # Scroll up
```

**Swipe gesture (faster):**
```
swipeOn with direction: "left", gestureType: "swipe"
```

**Fling (fastest):**
```
swipeOn with direction: "up", gestureType: "fling"
```

**Scroll until element found:**
```
swipeOn with direction: "up", lookFor: {text: "Settings"}
```

**Scroll within container:**
```
swipeOn with direction: "up", container: {id: "list_view"}
```

## Drag and Drop

Move elements between locations:
```
dragAndDrop with source: {text: "Item 1"}, target: {text: "Folder"}
dragAndDrop with source: {id: "draggable"}, target: {id: "drop_zone"}
```

## Pinch to Zoom

Use `pinchOn` for zoom gestures:

**Zoom in:**
```
pinchOn with direction: "out"
```

**Zoom out:**
```
pinchOn with direction: "in"
```

**With rotation:**
```
pinchOn with direction: "out", rotationDegrees: 45
```

## Common Workflows

**Scroll and tap:**
```
swipeOn "up" lookFor: {text: "Settings"} → tapOn "Settings"
```

**Reorder list items:**
```
tapOn "Item" action: "longPress" → dragAndDrop to target
```

**Zoom and interact:**
```
pinchOn "out" → tapOn (now-visible element)
```

## Tips

- Use `lookFor` with swipe to auto-scroll to off-screen elements
- Long press often reveals context menus or enables drag mode
- Use `container` to scope searches in screens with duplicate text
- Swipe "up" scrolls content down (reveals content below)
- Use `gestureType: "fling"` for fast scrolling through long lists
