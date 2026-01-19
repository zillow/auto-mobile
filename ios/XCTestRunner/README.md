# iOS XCTest Runner

XCTest integration framework for executing AutoMobile YAML automation plans.

## Overview

The XCTest Runner provides XCTest integration for iOS automation, mirroring the Android JUnitRunner functionality. It enables:

- Execution of YAML automation plans within XCTest framework
- Automatic retry logic for flaky tests
- Timing data collection and performance tracking
- XCTestObservation integration for test lifecycle hooks
- Environment variable configuration
- Test ordering and organization

## Architecture

Based on the design documented in `docs/design-docs/plat/ios/xctestrunner.md`, this component:

1. Provides `AutoMobileTestCase` base class for plan-based tests
2. Wraps plan execution with `AutoMobilePlanExecutor`
3. Integrates with XCTestObservation for timing and lifecycle events
4. Supports configuration via environment variables and test schemes
5. Enables timing history collection and analysis

## Components

### AutoMobileTestCase

Base XCTestCase class for executing automation plans:

```swift
import XCTest
import XCTestRunner

final class MyAppTests: AutoMobileTestCase {
    override var planPath: String { "Plans/login-flow.yaml" }
    override var retryCount: Int { 2 }
    override var timeoutSeconds: TimeInterval { 300 }

    func testLoginFlow() throws {
        try executePlan()
    }
}
```

### AutoMobilePlanExecutor

Executes automation plans with retry and cleanup logic:

```swift
let config = AutoMobilePlanExecutor.Configuration(
    transport: .streamableHttp(url: URL(string: "http://localhost:9000/auto-mobile/streamable")!),
    planPath: "Plans/checkout.yaml",
    retryCount: 3
)

let executor = AutoMobilePlanExecutor(configuration: config)
try executor.execute()
```

### AutoMobileTestObserver

Collects timing data and test results:

```swift
// Register observer (typically in test suite setup)
let observer = AutoMobileTestObserver.register()

// After tests complete
let timingData = observer.getTimingData()
try observer.exportTimingData(to: "timing-history.json")
```

## Configuration

### Environment Variables

Primary:
- `AUTOMOBILE_MCP_URL`: MCP HTTP endpoint. If unset, the runner uses the daemon socket.
- `AUTOMOBILE_MCP_HTTP_URL`: Alias for `AUTOMOBILE_MCP_URL`.
- `AUTOMOBILE_DAEMON_SOCKET_PATH`: Daemon socket path (default: `/tmp/auto-mobile-daemon-$UID.sock`).
- `AUTOMOBILE_TEST_PLAN`: Path to YAML automation plan.
- `AUTOMOBILE_TEST_RETRY_COUNT`: Number of retry attempts (default: `0`).
- `AUTOMOBILE_TEST_TIMEOUT_SECONDS`: Test timeout in seconds (default: `300`).
- `AUTOMOBILE_TEST_RETRY_DELAY_SECONDS`: Retry backoff in seconds (default: `1`).
- `AUTOMOBILE_CI_MODE`: Marks runs as CI for metadata and timing fetch behavior.
- `AUTOMOBILE_APP_VERSION`: App version metadata passed to MCP.
- `AUTOMOBILE_GIT_COMMIT`: Git commit metadata passed to MCP.

Legacy (still supported):
- `AUTO_MOBILE_DAEMON_SOCKET_PATH`
- `MCP_ENDPOINT`
- `PLAN_PATH`
- `RETRY_COUNT`
- `TEST_TIMEOUT`
- `AUTO_MOBILE_APP_VERSION`
- `APP_VERSION`
- `AUTO_MOBILE_GIT_COMMIT`
- `GITHUB_SHA`
- `GIT_COMMIT`
- `CI_COMMIT_SHA`
- `CI`
- `GITHUB_ACTIONS`

### Test Scheme Settings

Configure in Xcode test scheme:
1. Edit Scheme → Test → Arguments
2. Add environment variables
3. Configure test ordering and parallelization

Test ordering and timing settings (via environment variables or UserDefaults):
- `automobile.junit.timing.ordering`: `auto`, `duration-asc`, `duration-desc`, `none`.
- `automobile.junit.timing.enabled`: Enable/disable timing fetch (default: `true`).
- `automobile.junit.timing.lookback.days`: Timing history window (default: `90`).
- `automobile.junit.timing.limit`: Max timing records to load (default: `1000`).
- `automobile.junit.timing.min.samples`: Minimum samples per test (default: `1`).
- `automobile.junit.timing.fetch.timeout.ms`: Timing fetch timeout in ms (default: `5000`).
- `automobile.ci.mode`: Disable timing fetch in CI (default: `false`).

Parallel worker count is derived from either:
- `-parallel-testing-worker-count <n>` (Xcode argument).
- `XCTEST_PARALLEL_THREAD_COUNT=<n>` (environment variable).

Example scheme argument values:
```
-automobile.junit.timing.ordering duration-desc
-automobile.junit.timing.limit 500
```

## Building

```bash
# Build the package
swift build

# Run tests
swift test

# Build for iOS
xcodebuild -scheme XCTestRunner -destination 'platform=iOS Simulator,name=iPhone 15'
```

## Integration with Xcode

1. Add XCTestRunner package to your Xcode project
2. Import XCTestRunner in your test files
3. Subclass AutoMobileTestCase
4. Configure test scheme with environment variables
5. Run tests via Xcode Test Navigator or xcodebuild

## Example XCTest Target (Reminders)

Plan fixtures live in `ios/XCTestRunner/Sources/XCTestRunnerTests/Resources/Plans`:
- `Plans/launch-reminders-app.yaml`
- `Plans/add-reminder.yaml`

Platform-specific plans should declare a top-level `platform` field (e.g., `platform: ios`). Multi-device plans must declare platform per device at the top level.

Sample XCTest case:

```swift
import XCTest
import XCTestRunner

final class RemindersLaunchPlanTests: AutoMobileTestCase {
    override var planPath: String { "Plans/launch-reminders-app.yaml" }

    func testLaunchRemindersPlan() throws {
        try executePlan()
    }
}
```

The sample target is implemented in `ios/XCTestRunner/Sources/XCTestRunnerTests/RemindersIntegrationTests.swift`
and compiles as part of the `XCTestRunnerTests` target.

Integration test (opt-in, requires MCP + iOS simulator running):

```bash
AUTOMOBILE_DAEMON_SOCKET_PATH=/tmp/auto-mobile-daemon-$UID.sock \
swift test --filter RemindersLaunchPlanTests
```

Note: The Reminders plans assume English UI labels and may need adjustment for other locales.

## CI vs local execution

Local development typically uses the daemon socket (no MCP URL override):

```bash
AUTOMOBILE_TEST_PLAN=Plans/launch-reminders-app.yaml \
swift test --filter RemindersLaunchPlanTests
```

CI should set explicit MCP metadata and use an HTTP endpoint:

```bash
AUTOMOBILE_CI_MODE=1 \
AUTOMOBILE_MCP_URL="https://mcp.example.com/auto-mobile/streamable" \
AUTOMOBILE_TEST_PLAN=Plans/launch-reminders-app.yaml \
AUTOMOBILE_APP_VERSION="1.2.3" \
AUTOMOBILE_GIT_COMMIT="$GITHUB_SHA" \
xcodebuild test -scheme XCTestRunner -destination 'platform=iOS Simulator,name=iPhone 15'
```

## Development Status

**MVP Scaffold** - This is a minimal viable product scaffold with:
- AutoMobileTestCase base class
- AutoMobilePlanExecutor with retry logic
- XCTestObservation integration
- Timing data collection
- Test scaffolding

**Next Steps:**
- Implement YAML plan parsing (integrate Yams)
- Implement MCP client for tool execution
- Add assertion verification logic
- Add comprehensive test coverage
- Add example test cases
- Integrate with Xcode test schemes
