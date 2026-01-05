# Frequently Asked Questions

## General Questions

### What is AutoMobile?

AutoMobile is a comprehensive set of tools that enables AI agents to interact with mobile devices. It provides automated
testing, performance monitoring, and device interaction via an MCP server, custom test runner, and agentic loop that is
compatible with multiple foundation model providers.

### Do I need root access on my device?

No, AutoMobile is designed to work entirely within standard `adb` permissions. All functionality operates without requiring
device root access, making it suitable for both physical devices and emulators. If you can access it over `adb`, it works.

AutoMobile detects existing Android SDK/ADB installs via environment variables and common locations, but it does not
install the SDK or command line tools for you.

### Which AI clients are supported?

Any MCP-compatible tool calling client can use AutoMobile's MCP, including:

- Firebender (I wrote AutoMobile with it)
- Claude Desktop
- Goose
- Cursor
- fast-agent
- claude code
- Other MCP-compatible tools and frameworks

I don't have time to test every client. As I can put integration tests in place for clients I will, but mostly I plan
to do integration testing against `fast-agent` because it has a complete MCP client implementation and is open source.

### What are the system requirements?

- Bun 1.3.5+ (required by the package engines field)
- Android SDK + platform tools (ADB)
- At least one Android device or emulator

Physical devices do need USB debugging enabled for AutoMobile to function with them.

### How do I enable USB debugging?

TODO: Can I automate this with AutoMobile

1. Go to Settings > About Phone
2. Tap "Build Number" 7 times to enable Developer Options
3. Go to Settings > Developer Options
4. Enable "USB Debugging"
5. Connect your device and accept the debugging prompt

### Can I use multiple devices simultaneously?

AutoMobile supports multiple connected devices, but if you're using it as an MCP with an agent it's going to automatically
assign operations based on its internal heuristics - this is to support the CI automation use case where multiple emulators 
are being driven from a single CI job with parallel test execution. If you want consistency in which device it selects
just keep one connected.

### Does this cost anything?

Its an open source project, but that doesn't mean the AI model or emulator providers are free. Any way you look at it,
mobile UI testing has a cost. I am pretty sure this will end up reducing costs by running more efficient tests faster.
Looking forward to proving that with data.

### How accurate is text-based tapping?

Text-based tapping uses fuzzy matching against view hierarchy attributes (text, content-desc, iOS accessibility labels)
and falls back to clickable-element heuristics when needed. Accessibility labeling helps because content descriptions are
part of the search surface.

### What happens if an interaction fails?

When AutoMobile is invoked as an MCP it returns structured errors and context about why the interaction failed, often
including details from the current view hierarchy.

### How fast are the interactions?

Interaction speed depends on device performance and task complexity. If you need real timings for your environment,
enable `--debug-perf` and inspect timing output in logs and tool responses.

### Does it affect app performance?

There is overhead: AutoMobile pulls view hierarchies, takes screenshots, and can run optional audits via `adb`/`dumpsys`.
Expect some impact on device performance when these features are enabled.

### How much device storage is used?

AutoMobile stores logs and caches on the host machine (not on the device), primarily under `/tmp/auto-mobile`.
Log files rotate at 10MB, observe caches expire after a short TTL, and screenshot caching uses an in-memory LRU.
Disk cache cleanup for observe results is not automatic yet.

### Tool calls are failing

If running as an MCP:
1. Check the MCP tool call output, usually the explanation is it didn't find the element specified or it's a WebView which is not supported yet.
2. Check MCP server logs at `/tmp/auto-mobile/logs/server.log`

### Gestures not working properly?

Assuming you've already tried looking at MCP tool call output:
1. Turn on "Show Taps" and "Show Pointer" to visually watch the gestures that AutoMobile is attempting.
2. Record a video via `scrcpy` and file an issue.

### App crashes during testing?

That's your app implementation. If AutoMobile can cause it to crash, a user can too.

### Can I integrate with CI/CD systems?

See [ci setup docs](features/test-execution/ci.md).

### Is there API documentation?

AutoMobile's [MCP Server](features/mcp-server/index.md) is fully documented with system design diagrams and
explanations. If you find any of this wanting feel free to file an issue.

For AutoMobile's CLI you can always run the tool without commands to get helpful explanations. It is not going to have
a dedicated documentation page beyond running tool output and updating [this page](features/cli.md).

```text
bun install -g @kaeawc/auto-mobile@latest
auto-mobile --cli
```

### Can I extend the functionality?

AutoMobile has a bunch of different parts. You can mix and match the MCP with a different JUnitRunner, use the CLI tool
with your own agent. AutoMobile is designed to have its components work together, but I'm not setting up any blockers to
how it gets used. If there are components worth extracting we'll extract them.

### How do I report bugs or request features?

- [File issues on the GitHub repository](https://github.com/kaeawc/auto-mobile/issues)
- Include device information, logs, and reproduction steps. For bonus points include an AutoMobile plan. It would be best
  if reproductions could point at publicly available apps that have been released. I've done my testing against Jason Pearson,
  Slack, Google Keep, YouTube Music, Bluesky, Google Calendar, and more.  
- Feature requests are welcomed as are contributions. Please file an issue before starting a contribution.

### What data is collected?

AutoMobile collects view hierarchy and screenshot data for the foreground app to power observation and interaction. By
default this data stays on the host machine, but if you enable vision fallback it will send screenshots and prompts to
the configured model provider. There is no built-in analytics service.

### Can it access sensitive app data?

AutoMobile uses `adb` on Android and WebDriverAgent on iOS. It cannot access encrypted app data or system-level
information without appropriate permissions. If you grant those, then it can access that sensitive information.

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

## Implementation References

- SDK/ADB detection: https://github.com/kaeawc/auto-mobile/blob/main/src/utils/android-cmdline-tools/detection.ts#L1-L418
- Bun requirement: https://github.com/kaeawc/auto-mobile/blob/main/package.json#L1-L39
- Text matching logic: https://github.com/kaeawc/auto-mobile/blob/main/src/features/utility/ElementFinder.ts#L1-L212
- Performance timing + debug-perf: https://github.com/kaeawc/auto-mobile/blob/main/src/utils/PerformanceTracker.ts#L326-L366
- Debug-perf flag wiring: https://github.com/kaeawc/auto-mobile/blob/main/src/index.ts#L101-L645
- Log file location/rotation: https://github.com/kaeawc/auto-mobile/blob/main/src/utils/logger.ts#L1-L110
- Observe cache TTL and disk cache: https://github.com/kaeawc/auto-mobile/blob/main/src/features/observe/ObserveScreen.ts#L54-L640
- Screenshot cache LRU: https://github.com/kaeawc/auto-mobile/blob/main/src/utils/screenshot-utils.ts#L32-L90
- Vision fallback (Claude) and screenshot flow: https://github.com/kaeawc/auto-mobile/blob/main/src/features/action/TapOnElement.ts#L110-L190
- Vision fallback provider and response types: https://github.com/kaeawc/auto-mobile/blob/main/src/vision/VisionFallback.ts#L1-L149
- Claude vision client: https://github.com/kaeawc/auto-mobile/blob/main/src/vision/ClaudeVisionClient.ts#L1-L230
- iOS WebDriverAgent integration: https://github.com/kaeawc/auto-mobile/blob/main/src/utils/ios-cmdline-tools/WebDriverAgent.ts#L1-L200
- androidTest cleanup script: https://github.com/kaeawc/auto-mobile/blob/main/scripts/delete_androidTest.sh#L1-L170
