# Frequently Asked Questions

## General Questions

### Do I need root access on my device?

No, AutoMobile is designed to work entirely within standard `adb` permissions. All functionality operates without requiring
device root access, making it suitable for both physical devices and emulators. If you can access it over `adb`, it works.

AutoMobile detects existing Android SDK/ADB installs via environment variables and common locations, but it does not
install the SDK or command line tools for you.

### Which AI clients are supported?

See [installation](install/overview.md) docs.

### What are the system requirements?

- Bun 1.3.5+ (required by the package engines field)
- Android SDK + platform tools (ADB)
- At least one Android device or emulator

Physical devices do need USB debugging enabled for AutoMobile to function with them.

### How do I enable USB debugging?

**No, this cannot be automated with AutoMobile** - USB debugging requires manual user interaction on the device for security reasons. You must enable it manually:

1. Go to Settings > About Phone
2. Tap "Build Number" 7 times to enable Developer Options
3. Go to Settings > Developer Options
4. Enable "USB Debugging"
5. Connect your device and accept the debugging prompt

Once enabled, the USB debugging authorization is remembered for your computer, so you only need to do this once per device.

### How is the Accessibility Service enabled?

AutoMobile **automatically enables** the accessibility service using ADB settings commands. This is fast, reliable, and requires no manual interaction.

The process:
- Works automatically on emulators and properly configured devices
- Completes in milliseconds
- Preserves other enabled accessibility services
- Detects device capabilities and provides clear error messages if unsupported

On standard physical devices without root or device owner status, settings-based toggling may not be supported due to Android security restrictions. AutoMobile will detect this and provide guidance.

See the [Accessibility Service documentation](design-docs/plat/android/accessibility-service.md) for technical details.

### Can I use multiple devices simultaneously?

AutoMobile supports multiple connected devices, but if you're using it as an MCP with an agent it's going to automatically
assign operations based on its internal heuristics - this is to support the CI automation use case where multiple emulators 
are being driven from a single CI job with parallel test execution. If you want consistency in which device it selects
just keep one connected.

### Does this cost anything?

Its an open source project, but that doesn't mean the AI model or emulator providers are free. Any way you look at it,
mobile UI testing has a cost. I am pretty sure this will end up reducing costs by running more efficient tests faster.
Looking forward to proving that with data.

### Does it affect app performance?

No, almost all functionality is provided without including the AutoMobile SDK.

### How much device storage is used?

AutoMobile stores logs and caches on the host machine (not on the device), primarily under `/tmp/auto-mobile`.
Log files rotate at 10MB, observe caches expire after a short TTL, and screenshot caching uses an in-memory LRU.
Disk cache cleanup for observe results is not automatic yet.

We also store the internal navigation graph, tool call history, and other data within a sqlite database at `~/.auto-mobile/sqlite.db`

### Tool calls are failing

Check MCP server logs at `/tmp/auto-mobile/logs/server.log`. If the server was able to start it should have written logs.

### Gestures not working properly?

Assuming you've already tried looking at MCP tool call output:
1. Turn on "Show Taps" and "Show Pointer" to visually watch the gestures that AutoMobile is attempting.
2. Record a video via `scrcpy` and file an issue.

### App crashes during testing?

That's your app implementation. If AutoMobile can cause it to crash, a user can too.

### How do I report bugs or request features?

- [File issues on the GitHub repository](https://github.com/kaeawc/auto-mobile/issues)
- Include device information, logs, and reproduction steps. For bonus points include an AutoMobile plan. It would be best
  if reproductions could point at publicly available apps that have been released. I've done my testing against 
  Zillow, Slack, Google Keep, YouTube Music, Bluesky, Google Calendar, and more.
- Feature requests are welcomed as are contributions. Please file an issue before starting a contribution.

### What data is collected?

AutoMobile collects view hierarchy and screenshot data for the foreground app to power observation and interaction. By
default this data stays on the host machine, but if you enable vision fallback it will send screenshots and prompts to
the configured model provider. There are no built-in analytics.

### What do we do with androidTest now?

[`rm -rf`](https://www.github.com/kaeawc/auto-mobile/blob/main/scripts/delete_androidTest.sh)

No seriously, once you're fully on AutoMobile you should just delete them. Use the above script; by default it performs
a dry run and tells you exactly what it would delete. Only do this after you've fully migrated your project.

```shell
../scripts/delete_androidTest.sh --execute
🧹 Cleaning up androidTest sources and dependencies...
📍 Working in: ~/kaeawc/auto-mobile/junitrunner
🗂️ [DRY RUN] Removing androidTest source directories...
📝 [DRY RUN] Removing androidTestImplementation dependencies...
🧽 [DRY RUN] Cleaning up empty test directories...
✅ Cleanup complete!
🔍 You may want to review changes before committing
```
