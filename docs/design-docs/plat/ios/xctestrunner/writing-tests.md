# Writing Tests

AutoMobile XCTest tests have two parts: a Swift class that subclasses `AutoMobileTestCase` and
declares the test configuration, and a YAML plan file that describes the steps to execute on the
simulator.

## Test class anatomy

```swift
import XCTest
import XCTestRunner

final class AppLaunchAutoMobileTests: AutoMobileTestCase {   // (1) subclass AutoMobileTestCase

    // (2) declare which plan this class runs
    override var planPath: String {
        "test-plans/launch-app.yaml"
    }

    // (3) optional: terminate and clear app data after each test
    override var cleanupOptions: AutoMobilePlanExecutor.CleanupOptions? {
        AutoMobilePlanExecutor.CleanupOptions(
            appId: "com.example.ios.YourApp",
            clearAppData: true
        )
    }

    // (4) pre-flight: skip if the daemon cannot be reached
    override func setUpAutoMobile() throws {
        let daemonReady = DaemonManager.ensureDaemonRunning()
        guard daemonReady else {
            throw XCTSkip("AutoMobile daemon is not running and could not be started")
        }
    }

    // (5) test method executes the plan; assertions drive pass/fail
    func testAppLaunchesWithoutCrashing() throws {
        let result = try executePlan()
        XCTAssertTrue(result.success, "Plan failed: \(result.error ?? "unknown error")")
        XCTAssertGreaterThan(result.executedSteps, 0)
    }
}
```

The plan is loaded and sent to the daemon in `setUpWithError`. `executePlan()` blocks until the
daemon returns a result and throws on a connectivity failure.

## `AutoMobileTestCase` configuration properties

Override any of these properties in your subclass. All are read during `setUpWithError` before the
test method is called.

| Property | Type | Default | Description |
|---|---|---|---|
| `planPath` | `String` | `""` (env: `AUTOMOBILE_TEST_PLAN`) | Path to the YAML plan. Resolved from the test bundle resources, then the filesystem. **Required** — the test fails if empty. |
| `cleanupOptions` | `CleanupOptions?` | `nil` | Terminates and optionally clears app data after each test. Pass `nil` to skip cleanup. |
| `retryCount` | `Int` | `0` (env: `AUTOMOBILE_TEST_RETRY_COUNT`) | Number of automatic retry attempts before the test fails. |
| `timeoutSeconds` | `TimeInterval` | `300` (env: `AUTOMOBILE_TEST_TIMEOUT_SECONDS`) | Maximum wall-clock seconds the executor waits for the daemon. |
| `retryDelaySeconds` | `TimeInterval` | `1` (env: `AUTOMOBILE_TEST_RETRY_DELAY_SECONDS`) | Seconds to wait between retry attempts. |
| `startStep` | `Int` | `0` | Resume execution from this step index (0-based). Useful when debugging a specific step. |
| `planParameters` | `[String: String]` | `[:]` | Key–value substitutions applied to `${KEY}` references in the plan at execution time. |
| `planBundle` | `Bundle?` | `Bundle(for: type(of: self))` | Bundle used to resolve the `planPath`. Defaults to the test bundle. |

### Cleanup options

```swift
// Terminate the app after the test (app data is not cleared)
override var cleanupOptions: AutoMobilePlanExecutor.CleanupOptions? {
    AutoMobilePlanExecutor.CleanupOptions(
        appId: "com.example.ios.YourApp",
        clearAppData: false
    )
}

// Terminate and wipe app data so each test starts clean
override var cleanupOptions: AutoMobilePlanExecutor.CleanupOptions? {
    AutoMobilePlanExecutor.CleanupOptions(
        appId: "com.example.ios.YourApp",
        clearAppData: true
    )
}
```

`cleanupOptions` runs after the plan completes regardless of whether `terminateApp` is in the plan.
The plan's own `terminateApp` step is sufficient for most cases; `cleanupOptions` is useful as a
safety net when a test fails mid-plan and leaves the app running.

### Timeouts

`timeoutSeconds` covers the full round-trip from the executor to the daemon, including all device
interactions within the plan. Budget generously:

- `launchApp` cold start: 3–10 seconds
- `observe` with screenshot and hierarchy: 1–3 seconds per step
- `waitFor` with a 15-second timeout adds up to 15 seconds to the budget

A plan with six steps should have a timeout of at least 60 seconds. Complex flows with multiple
`waitFor` clauses may need 120–180 seconds.

```swift
override var timeoutSeconds: TimeInterval { 120 }
```

### Plan parameters

Use `planParameters` to inject runtime values into plans without hardcoding them:

```swift
override var planParameters: [String: String] {
    [
        "appId": "com.example.ios.YourApp",
        "env": ProcessInfo.processInfo.environment["TEST_ENV"] ?? "staging",
    ]
}
```

In the plan:

```yaml
- tool: launchApp
  appId: ${appId}
  label: Launch ${env} build
```

## Lifecycle hooks

### `setUpAutoMobile()`

Called during `setUpWithError` before the executor is created. Override this to add pre-flight
checks specific to your tests. Throw `XCTSkip` to skip the test gracefully rather than fail it:

```swift
override func setUpAutoMobile() throws {
    // Skip if the daemon cannot be started — common in unit test runs or forks
    let daemonReady = DaemonManager.ensureDaemonRunning()
    guard daemonReady else {
        throw XCTSkip("AutoMobile daemon is not running and could not be started")
    }
}
```

### `tearDownAutoMobile()`

Called during `tearDownWithError` after the test method completes. Override for teardown logic
beyond what `cleanupOptions` provides:

```swift
override func tearDownAutoMobile() throws {
    // Custom teardown — e.g. reset server-side state
}
```

## YAML plan structure

Plans live in the `Tests/AutoMobile/test-plans/` directory and are bundled as resources with the
test target.

```
YourApp/
└── Tests/
    └── AutoMobile/
        ├── AppLaunchAutoMobileTests.swift
        └── test-plans/
            ├── launch-app.yaml
            └── app-background-foreground.yaml
```

A minimal plan:

```yaml
name: launch-app                                         # (1) plan identifier (no spaces)
description: Launch the app and verify it starts         # (2) human-readable description
platform: ios                                            # (3) platform hint for the daemon
steps:
  - tool: launchApp                                      # (4) tool name (camelCase)
    appId: com.example.ios.YourApp
    clearAppData: true
    label: Launch the app with a clean state             # (5) optional label shown in logs

  - tool: observe
    label: Verify app UI renders without crashing

  - tool: terminateApp
    appId: com.example.ios.YourApp
    label: Terminate the app after test
```

Each step must have a `tool` key. All other keys are parameters specific to that tool.

!!! note "iOS bundle identifiers"
    iOS app identifiers use the reverse-DNS bundle ID format: `com.example.ios.YourApp`.
    This is the same value as `PRODUCT_BUNDLE_IDENTIFIER` in your Xcode build settings, not
    a package name or display name.

## Available tools

The daemon exposes the same tool set available in MCP sessions. See [MCP Tools](../../../mcp/tools.md)
for the complete reference. The most commonly used tools in iOS plans are:

### `launchApp`

Starts an app by bundle ID. Optionally clears app data first.

```yaml
- tool: launchApp
  appId: com.example.ios.YourApp
  clearAppData: true       # clears data and kills the process before launching (default: false)
  label: Launch with clean state
```

### `observe`

Captures a screenshot and accessibility hierarchy. Use this to verify the screen state at a given
point in the plan.

**Assertion model:** a plain `observe` always passes as long as the device responds. To assert that
specific content is present, use `waitFor` — the step fails if the element does not appear within
the timeout. This is the primary assertion mechanism in YAML plans.

```yaml
- tool: observe
  label: Verify home screen is visible
```

Wait for a specific element before proceeding:

```yaml
- tool: observe
  waitFor:
    text: "Sessions"         # wait until this text appears anywhere on screen
    timeout: 15000           # ms (default: 5000)
```

!!! warning "`waitFor` requires `text` or `elementId`"
    A `waitFor` block with only `timeout` is a validation error. Include `text` or `elementId`.
    To observe without waiting for a specific element, omit `waitFor` entirely.

### `tapOn`

Taps an element identified by visible text or accessibility identifier.

```yaml
- tool: tapOn
  text: "Sign In"
  label: Tap the Sign In button

- tool: tapOn
  elementId: "submitButton"   # matches accessibilityIdentifier
  action: tap                 # tap | doubleTap | longPress
```

### `inputText`

Types into the currently focused input field.

```yaml
- tool: inputText
  text: "user@example.com"
  label: Enter email address
```

### `pressButton`

Presses a hardware or soft button.

```yaml
- tool: pressButton
  button: home      # home | lock | volumeUp | volumeDown
```

!!! warning "Button values are lowercase camelCase"
    Use `home`, `lock`, `volumeUp`, `volumeDown`. The values differ from Android's `home`,
    `back`, `power` set — iOS does not have a back button.

### `terminateApp`

Force-stops an app.

```yaml
- tool: terminateApp
  appId: com.example.ios.YourApp
  label: Terminate the app
```

### `swipeOn`

Swipes in a direction within an element or the whole screen.

```yaml
- tool: swipeOn
  direction: up    # up | down | left | right
  label: Scroll down the list
```

### `openLink`

Opens a URL or deep link via `simctl openurl`.

```yaml
- tool: openLink
  url: "yourapp://settings"
  label: Open settings via deep link
```

## Example plans and test classes

### App launch

```yaml
# test-plans/launch-app.yaml
name: launch-app
description: Launch the app and verify it opens without crashing
platform: ios
steps:
  - tool: launchApp
    appId: com.example.ios.YourApp
    clearAppData: true
    label: Launch with clean state

  - tool: observe
    label: Verify initial screen renders

  - tool: terminateApp
    appId: com.example.ios.YourApp
    label: Terminate the app
```

```swift
final class AppLaunchAutoMobileTests: AutoMobileTestCase {

    override var planPath: String { "test-plans/launch-app.yaml" }

    override var cleanupOptions: AutoMobilePlanExecutor.CleanupOptions? {
        .init(appId: "com.example.ios.YourApp", clearAppData: true)
    }

    override func setUpAutoMobile() throws {
        guard DaemonManager.ensureDaemonRunning() else {
            throw XCTSkip("AutoMobile daemon unavailable")
        }
    }

    func testAppLaunchesWithoutCrashing() throws {
        let result = try executePlan()
        XCTAssertTrue(result.success, "Plan failed: \(result.error ?? "unknown error")")
        XCTAssertGreaterThan(result.executedSteps, 0)
    }
}
```

### Background and foreground cycle

```yaml
# test-plans/app-background-foreground.yaml
name: app-background-foreground
description: Launch the app, background it, then bring it back to the foreground
platform: ios
steps:
  - tool: launchApp
    appId: com.example.ios.YourApp
    clearAppData: true
    label: Launch with clean state

  - tool: observe
    waitFor:
      text: "Home"
      timeout: 15000
    label: Wait for initial UI to render

  - tool: pressButton
    button: home
    label: Press Home to background the app

  - tool: launchApp
    appId: com.example.ios.YourApp
    clearAppData: false
    label: Bring the app to the foreground

  - tool: observe
    waitFor:
      text: "Home"
      timeout: 10000
    label: Verify app state is restored

  - tool: terminateApp
    appId: com.example.ios.YourApp
    label: Terminate the app
```

```swift
final class AppLifecycleAutoMobileTests: AutoMobileTestCase {

    override var planPath: String { "test-plans/app-background-foreground.yaml" }

    override var timeoutSeconds: TimeInterval { 120 }

    override var cleanupOptions: AutoMobilePlanExecutor.CleanupOptions? {
        .init(appId: "com.example.ios.YourApp", clearAppData: true)
    }

    override func setUpAutoMobile() throws {
        guard DaemonManager.ensureDaemonRunning() else {
            throw XCTSkip("AutoMobile daemon unavailable")
        }
    }

    func testAppSurvivesBackgroundAndForeground() throws {
        let result = try executePlan()
        XCTAssertTrue(result.success, "Plan failed: \(result.error ?? "unknown error")")
        XCTAssertGreaterThan(result.executedSteps, 0)
    }
}
```

## One class per flow

Keep each test class focused on a single user flow. Classes can contain multiple test methods, but
since `planPath` is a class-level property that applies to all methods, multiple methods in the same
class run the same plan. Use separate classes for separate plans:

```swift
// AppLaunchAutoMobileTests.swift — launch-app.yaml
// AppLifecycleAutoMobileTests.swift — app-background-foreground.yaml
// LoginFlowAutoMobileTests.swift — login-flow.yaml
// OnboardingAutoMobileTests.swift — onboarding-flow.yaml
```

!!! tip "Recommended naming convention"
    Suffix classes with `AutoMobileTests` to distinguish them from unit tests in the same
    target directory tree. This makes filtering with `-only-testing:YourAppAutoMobileTests`
    work at the bundle level.

## Plan validation

Plans are validated against a JSON schema before execution. Common validation errors:

| Error | Cause | Fix |
|---|---|---|
| `Missing required property 'tool'` | A step is missing the `tool` key | Add `tool: <toolName>` to the step |
| `Invalid option for 'button'` | Unrecognised button name | Use `home`, `lock`, `volumeUp`, or `volumeDown` |
| `waitFor` with only `timeout` | Missing `text` or `elementId` in `waitFor` | Add `text: "…"` or `elementId: "…"` |
| `Unknown property 'foo'` | Misspelled or Android-only field | Check the [MCP Tools](../../../mcp/tools.md) reference |

## Debugging a failing test

When a test fails, inspect the `.xcresult` bundle:

```bash
# Summary of all tests
xcrun xcresulttool get test-results summary --path build/automobile-tests.xcresult

# Failing test identifiers
xcrun xcresulttool get test-results tests \
  --path build/automobile-tests.xcresult --format json \
  | jq '[.. | objects | select(.testStatus? == "Failure") | .nodeIdentifier]'
```

Crash logs for simulator runs land in `~/Library/Logs/DiagnosticReports/YourApp*.crash`.

**Common failure patterns:**

| Symptom | Likely cause |
|---|---|
| `waitFor` times out | Screen transition slower than `timeout`; increase `timeout` or add a preceding `observe` |
| `element not found` for tap | Wrong `text` value; insert a plain `observe` step before the tap and check the log |
| `Plan not found at path` | YAML file not in the test bundle; verify it appears in Build Phases → Copy Bundle Resources |
| `executorUnavailable` | `setUpWithError` threw before executor was created; check `setUpAutoMobile` output |
| All steps fail with socket error | Daemon not running; run `auto-mobile --daemon start &` |

## See also

- [Project Setup](project-setup.md) — Dependency, XcodeGen config, running locally
- [CI Integration](ci-integration.md) — GitHub Actions workflow
- [MCP Tools](../../../mcp/tools.md) — Full tool parameter reference
