# Appearance Sync

AutoMobile can align device appearance (light/dark mode) with the host system.
Configuration is managed through a Unix socket (not MCP tools).

## Unix Socket

- Path: `~/.auto-mobile/appearance.sock`
- Protocol: newline-delimited JSON

### Commands

```json
{"id":"1","command":"set_appearance_sync","enabled":true}
{"id":"2","command":"set_appearance_sync","enabled":false}
{"id":"3","command":"set_appearance","mode":"light"}
{"id":"4","command":"set_appearance","mode":"dark"}
{"id":"5","command":"set_appearance","mode":"auto"}
{"id":"6","command":"get_appearance_config"}
```

### Responses

```json
{"id":"6","type":"appearance_response","success":true,"result":{"config":{"syncWithHost":true,"defaultMode":"auto","applyOnConnect":true}}}
```

When a command applies an appearance change immediately, the response includes
`appliedMode` (`light` or `dark`).

## Configuration Shape

```json
{
  "appearance": {
    "syncWithHost": true,
    "defaultMode": "auto",
    "applyOnConnect": true
  }
}
```

## Host Detection

- macOS: `defaults read -g AppleInterfaceStyle`
- Linux: GNOME `gsettings` (`color-scheme` / `gtk-theme`) and KDE `kreadconfig*`

## Device Control

- Android: `adb shell cmd uimode night yes|no`
- iOS Simulator: `xcrun simctl ui <device> appearance light|dark`
