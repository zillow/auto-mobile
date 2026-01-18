---
description: Text input, keyboard control, and clipboard operations
allowed-tools: mcp__auto-mobile__inputText, mcp__auto-mobile__clearText, mcp__auto-mobile__selectAllText, mcp__auto-mobile__keyboard, mcp__auto-mobile__imeAction, mcp__auto-mobile__clipboard
---

Handle text input, keyboard interactions, and clipboard operations.

## Text Input

Type text into the focused field:
```
inputText with text: "Hello, world!"
```

The field must be focused first (use `tapOn` with action "focus").

## Clear Text

Clear the current input field:
```
clearText
```

Removes all text from the focused field.

## Select All Text

Select all text in the focused field:
```
selectAllText
```

Useful for replacing existing text:
```
selectAllText → inputText with new text
```

## Keyboard Control

Control the soft keyboard:
```
keyboard with action: "open"    # Show keyboard
keyboard with action: "close"   # Hide keyboard
keyboard with action: "detect"  # Check if visible
```

## IME Actions

Trigger keyboard action buttons:
```
imeAction with action: "done"     # Submit/complete
imeAction with action: "next"     # Move to next field
imeAction with action: "search"   # Trigger search
imeAction with action: "send"     # Send message
imeAction with action: "go"       # Navigate/submit
```

## Clipboard

Manage clipboard content:
```
clipboard with action: "copy", text: "Text to copy"
clipboard with action: "paste"    # Paste into focused field
clipboard with action: "get"      # Read clipboard content
clipboard with action: "clear"    # Clear clipboard
```

## Common Workflows

**Fill a text field:**
```
tapOn (field) → inputText → imeAction "next"
```

**Replace existing text:**
```
tapOn (field) → selectAllText → inputText (new text)
```

**Copy text between fields:**
```
tapOn (source) → selectAllText → clipboard "copy"
tapOn (target) → clipboard "paste"
```

**Submit a form:**
```
inputText (last field) → imeAction "done"
```

## Tips

- Always focus a field before typing (use `tapOn` or `tapOn` with action "focus")
- Use `imeAction "next"` to move through form fields efficiently
- Check `keyboardVisible` in observation before text operations
- Use `selectAllText` + `inputText` to replace text (faster than clearText + inputText)
