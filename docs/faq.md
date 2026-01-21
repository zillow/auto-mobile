# FAQ

#### What can I use this for?

- [Explore app ux](using/ux-exploration.md), [create UI tests](using/ui-tests.md), and easily create [bug reports]() with built-in [video recording](design-docs/mcp/observe/video-recording.md) and [visual highlights](design-docs/mcp/observe/visual-highlighting.md).
- Measure [startup](using/perf-analysis/startup.md), [scroll framerate](using/perf-analysis/scroll-framerate.md), and [screen transitions](using/perf-analysis/screen-transition.md).
- Audit accessibility compliance with [contrast ratios](using/a11y.md#contrast) & [tap targets](using/a11y.md#tap-targets).
- (Coming soon) record tests via AutoMobile's companion Android plugin & MacOS app.
- Run tests natively via [JUnitRunner for Android](design-docs/plat/android/junitrunner.md) and [XCTestRunner for iOS](design-docs/plat/ios/xctestrunner.md).

#### Why another MCP? Aren't they all worthless?

MCP is currently the best way to give AI agents **deterministic tools**. Most MCPs just provide simple data access as API wrappers. There is no simple API to wrap to truly conduct mobile device automation as of 2026 and it does not appear that anyone else is creating one.

#### Won't this bloat my context window a lot?

As for context bloat there are MCP benchmarks we run on every change that keep context usage as low as possible while delivering value. Most MCPs take up 50-100k tokens just being loaded into memory. AutoMobile keeps all of its tools, resources, and templates around 12k. We're committed to keeping this usage low and finding new ways to reduce it.

#### Is my AI agent supported?

Any MCP tool-compatible client. See [installation](install.md) for configuration examples. The project does make use of MCP resources because they have significant advantages and adoption across AI agents, please file an issue if this is not supported in your workflow.

#### Do I need root access?

No. Core automation works with standard `adb` permissions on emulators and physical devices. Some advanced features are emulator-only and are called out as such.

#### After installation how do I get it to look at a device?

If you have already connected an Android or iOS device to your computer AutoMobile will automatically detect and assume it should run automation on it. Otherwise it looks for installed system images and provides tools to start one of them.

#### What happens if I have more than one device?

Yes. AutoMobile supports multiple connected devices with automatic selection for CI/parallel testing. For consistent device selection, use `setActiveDevice` or connect only one device.

#### Does it affect app performance?

No. Almost all functionality works without adding the Android AutoMobile SDK to your app. That library currently provides better navigation graph alignment and Compose recomposition count data and is only meant to be run in internal variants.

#### Where is data stored?

| Location | Contents |
|----------|----------|
| `/tmp/auto-mobile/` | Logs, caches (host machine) |
| `~/.auto-mobile/sqlite.db` | Navigation graph, tool history, test records, performance records |

Logs rotate at 10MB. Observe caches expire after a short TTL.

#### My app crashed while using AutoMobile

Assuming you haven't tried out the platform specific SDK integration, that's your app. If AutoMobile can cause a crash, so can a user.

#### What data is collected?

View hierarchy and screenshots for the foreground app, stored locally. Vision fallback (if enabled) sends screenshots to your configured model provider. No built-in analytics.

### How do I report bugs or request features?

- [File issues on the GitHub repository](https://github.com/kaeawc/auto-mobile/issues)
- Include device information, logs, and reproduction steps. For bonus points include an AutoMobile plan. It would be best
  if reproductions could point at publicly available apps that have been released. I've done my testing against
  Zillow, Slack, Google Keep, YouTube Music, Bluesky, Google Calendar, and more.
- Feature requests are welcomed as are contributions. Please file an issue before starting a contribution.

#### What about existing `androidTest` code?

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

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/kaeawc/auto-mobile/issues)
- **Include**: Device info, logs, reproduction steps, AutoMobile plan if possible
