# Frequently Asked Questions

## General Questions

### What is AutoMobile?

AutoMobile is a comprehensive set of tools that enables AI agents to interact with mobile devices. It provides automated
testing, performance monitoring, and device interaction via an MCP server, custom test runner, and agentic loop that is
compatible with multiple foundation model providers.

### Do I need root access on my device?

No, AutoMobile is designed to work entirely within standard `adb` permissions. All functionality operates without requiring
device root access, making it suitable for both physical devices and emulators. If you can access it over `adb`, it works.

And if you don't have Android command line or platform tools installed, AutoMobile can find them and set them up for you.

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

- Node.js 20 or later

AutoMobile will automatically download and install the following unless they already exist.
- Command line tools installed via Homebrew or manually in $ANDROID_HOME/cmdline_tools
- Android SDK installed at ANDROID_HOME, 
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

Text-based tapping uses fuzzy search algorithms and view hierarchy analysis to find the best matching elements. It
handles variations in text, partial matches, and different UI frameworks (XML and Compose). It prefers to use context
description values if they are available, so the more effort you put into accessibility the better this works. In my
experience it's great.

### What happens if an interaction fails?

When AutoMobile is invoked as an MCP it gives feedback as to why the interaction failed with relevant detail about the
current view hierarchy, 

### How fast are the interactions?

Interaction speed depends on device performance and complexity. Typical operations:

- Simple taps: 98-167ms
- Complex scrolling: 1-3 seconds, longer if you need to search for a specific element in a long list
- App launches: What is your app startup speed?
- View hierarchy analysis: 9-48ms

I'm constantly looking to improve the speed of operations, suggestions and contributions welcome.

### Does it affect app performance?

Nope.

### How much device storage is used?

AutoMobile stores temporary files for screenshots, logs, etc, typically using less than 100MB of device storage. It cleans
up old files automatically once you reach the storage limit by using internal heuristics on what information is the least 
valuable to keep (screenshots and view hierarchy). This is all stored 

### Tool calls are failing

If running as an MCP
1. Check the MCP tool call output, usually the explanation is it didn't find the element specified or it's a WebView which is not supported yet.
2. Check MCP server logs at `/tmp/auto-mobile/logs/server.log`

### Gestures not working properly?

Assuming you've already tried looking at MCP tool call output:
1. Turn on "Show Taps" and "Show Pointer" to visually watch the gestures that AutoMobile is attempting.
2. Record a video via `srccpy` and file an issue.

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
npm install -g auto-mobile@latest
auto-mobile --cli
```

### Can I extend the functionality?

AutoMobile has a bunch of different parts. You can mix and match the MCP with a different JUnitRunner, use the CLI tool
with your own agent. AutoMobile is designed to have its components work together, but I'm not setting up any blockers to
how it gets used. If there are components worth extracting we'll extract them.

### How do I report bugs or request features?

- [File issues on the GitHub repository](https://github.com/zillow/auto-mobile/issues)
- Include device information, logs, and reproduction steps. For bonus points include an AutoMobile plan. It would be best
  if reproductions could point at publicly available apps that have been released. I've done my testing against Zillow,
  Slack, Google Keep, YouTube Music, Bluesky, Google Calendar, and more.  
- Feature requests are welcomed as are contributions. Please file an issue before starting a contribution.

### What data is collected?

AutoMobile collects whatever happens to be displayed in the view hierarchy of the current top app or launcher. It only
stores this data on the machine its being invoked and there is no outside processing service, no analytics whatsoever.
It is designed to be used with a foundation model and its up to you how you share your data with model providers.

### Can it access sensitive app data?

AutoMobile uses `adb` for all operations. It cannot access encrypted app data or system-level information without
appropriate permissions. If you grant those, then it can access that sensitive information.

### What do we do with androidTest now?

[`rm -rf`](https://www.github.com/zillow/auto-mobile/blob/main/scripts/delete_androidTest.sh)

No seriously, once you're fully on AutoMobile you should just delete them. Use the above script, by default it will perform
a dry-run to tell you explicitly what its about to delete. Only do this after you've fully migrated your project to not
need them anymore.

```shell
../scripts/delete_androidTest.sh --execute
🧹 Cleaning up androidTest sources and dependencies...
📍 Working in: ~/zillow/auto-mobile/junitrunner
🗂️ [DRY RUN] Removing androidTest source directories...
📝 [DRY RUN] Removing androidTestImplementation dependencies...
🧽 [DRY RUN] Cleaning up empty test directories...
✅ Cleanup complete!
🔍 You may want to review changes before committing
```
