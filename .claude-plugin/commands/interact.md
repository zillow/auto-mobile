---
description: Interact with UI elements - tap, type, swipe, and more
allowed-tools: mcp__auto-mobile__tapOn, mcp__auto-mobile__swipeOn, mcp__auto-mobile__inputText, mcp__auto-mobile__clearText, mcp__auto-mobile__selectAllText, mcp__auto-mobile__pressButton, mcp__auto-mobile__pressKey, mcp__auto-mobile__dragAndDrop, mcp__auto-mobile__pinchOn, mcp__auto-mobile__observe, mcp__auto-mobile__keyboard, mcp__auto-mobile__imeAction
---

Perform UI interactions on the connected device - tapping, typing, swiping, and other gestures.

## Available Interactions

### Tap Actions
Use `tapOn` with different actions:
- **tap**: Single tap on element
- **doubleTap**: Double tap (zoom, select word)
- **longPress**: Long press (context menu, drag mode)
- **focus**: Focus input without keyboard

Target by:
- `text`: Visible text on element
- `id`: Accessibility ID or resource ID
- `container`: Scope search within a parent element

### Text Input
- `inputText`: Type text into focused field
- `clearText`: Clear current input field
- `selectAllText`: Select all text in focused input
- `keyboard`: Open, close, or detect keyboard state
- `imeAction`: Trigger IME action (done, next, search, send, go)

### Scrolling & Swiping
Use `swipeOn` with:
- `direction`: up, down, left, right
- `gestureType`: scroll (content), swipe (page), fling (fast)
- `lookFor`: Keep scrolling until element found
- `container`: Scroll within specific list/view

### Advanced Gestures
- `dragAndDrop`: Move element from source to target
- `pinchOn`: Pinch to zoom in/out with optional rotation
- `pressButton`: Hardware buttons (home, back, volume, power)
- `pressKey`: Press specific key codes

## Workflow

1. **Observe first** (if needed): Check current screen state
2. **Identify target**: Find element by text, ID, or position
3. **Perform action**: Execute the appropriate interaction
4. **Verify result**: Observe new state to confirm success

## Examples

**Tap a button:**
```
tapOn with text: "Submit" and action: "tap"
```

**Type in a field:**
```
tapOn with text: "Email" to focus
inputText with text: "user@example.com"
imeAction with action: "next"
```

**Clear and replace text:**
```
tapOn with text: "Username" to focus
selectAllText
inputText with text: "new_username"
```

**Scroll to find element:**
```
swipeOn with direction: "up", lookFor: {text: "Settings"}
```

**Drag and drop:**
```
dragAndDrop with source: {text: "Item 1"}, target: {text: "Folder"}
```

**Pinch to zoom:**
```
pinchOn with direction: "out" to zoom in
pinchOn with direction: "in" to zoom out
```

## Tips

- Use `observe` before interacting if unsure of screen state
- For inputs, tap to focus first, then use `inputText`
- Use `selectAllText` + `inputText` to replace existing text
- Use `lookFor` with swipe to auto-scroll to elements
- Long press for context menus or drag operations
- Use container to scope searches in complex screens
