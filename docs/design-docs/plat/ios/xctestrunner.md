# XCTest Runner

<kbd>✅ Implemented</kbd> <kbd>🧪 Tested</kbd>

> **Current state:** `XCTestRunner` is a fully implemented Swift package (`ios/XCTestRunner/`) with `AutoMobileTestCase`, `AutoMobilePlanExecutor`, `AutoMobileTestObserver`, `TestTimingCache`, and `AutoMobileSession`. Unit tests cover plan execution, test ordering, and environment variable parsing. Integration tests run against the system Reminders app. See the [Status Glossary](../../status-glossary.md) for chip definitions.

The iOS test execution layer mirrors the Android JUnitRunner by providing a structured
way to execute AutoMobile plans within XCTest and collect timing data for optimization.

## Goals

- Run AutoMobile plans from XCTest with deterministic setup/teardown.
- Integrate with MCP device/session management.
- Collect and publish test timing history.
- Enable optional AI-assisted recovery for flaky UI flows.

## Architecture

- `AutoMobileTestCase`: base XCTestCase that loads a YAML plan and executes it via MCP.
- `AutoMobilePlanExecutor`: library that wraps plan execution with retries and cleanup.
- `XCTestObservation` integration to record timing data and pass metadata to MCP.

## Configuration

Environment variables and test scheme settings configure how the runner connects to MCP, loads plans,
and orders tests.

When using the daemon socket transport, the runner will attempt to start the AutoMobile daemon if it
is not detected.

### Environment variables

Primary:
- `AUTOMOBILE_MCP_URL`: MCP HTTP endpoint. If unset, the runner uses the daemon socket.
- `AUTOMOBILE_MCP_HTTP_URL`: Alias for `AUTOMOBILE_MCP_URL`.
- `AUTOMOBILE_DAEMON_SOCKET_PATH`: Daemon socket path (default: `/tmp/auto-mobile-daemon-$UID.sock`).
- `AUTOMOBILE_TEST_PLAN`: Default YAML plan path for a test target.
- `AUTOMOBILE_TEST_RETRY_COUNT`: Retry attempts for plan execution (default: `0`).
- `AUTOMOBILE_TEST_RETRY_DELAY_SECONDS`: Backoff between retries (default: `1`).
- `AUTOMOBILE_TEST_TIMEOUT_SECONDS`: Per-test timeout override in seconds (default: `300`).
- `AUTOMOBILE_CI_MODE`: Marks runs as CI for metadata and disables timing fetch in CI.
- `AUTOMOBILE_APP_VERSION`: Metadata for plan execution.
- `AUTOMOBILE_GIT_COMMIT`: Metadata for plan execution.

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

### Test scheme settings

Use Xcode scheme settings (Test -> Arguments) for ordering and timing:
- `-parallel-testing-worker-count <n>`: Used to resolve timing ordering when set.
- `XCTEST_PARALLEL_THREAD_COUNT=<n>`: Environment variable alternative to control worker count.
- `automobile.junit.timing.ordering`: `auto`, `duration-asc`, `duration-desc`, `none` (via UserDefaults
  or environment variable).
- `automobile.junit.timing.enabled`: Enable/disable timing fetch (default: `true`).
- `automobile.junit.timing.lookback.days`: Timing history window (default: `90`).
- `automobile.junit.timing.limit`: Max timing records to load (default: `1000`).
- `automobile.junit.timing.min.samples`: Minimum samples per test (default: `1`).
- `automobile.junit.timing.fetch.timeout.ms`: Timing fetch timeout in ms (default: `5000`).
- `automobile.ci.mode`: Disable timing fetch in CI (default: `false`).

## Example usage

```swift
final class LoginFlowTests: AutoMobileTestCase {
  override var planPath: String { "Tests/Plans/login-success.yaml" }

  func testLoginFlow() throws {
    _ = try executePlan()
  }
}
```yaml

## Timing data

The runner should fetch timing history during startup to order tests when parallel
execution is enabled and report results after each run.

## CI vs local execution

Local development typically uses the daemon socket with simulator running, while CI uses an HTTP MCP endpoint.

Local:
```bash
AUTOMOBILE_TEST_PLAN=Plans/launch-reminders-app.yaml \
swift test --filter RemindersLaunchPlanTests
```yaml

CI:
```bash
AUTOMOBILE_CI_MODE=1 \
AUTOMOBILE_MCP_URL="https://mcp.example.com/auto-mobile/streamable" \
AUTOMOBILE_TEST_PLAN=Plans/launch-reminders-app.yaml \
xcodebuild test -scheme XCTestRunner -destination 'platform=iOS Simulator,name=iPhone 15'
```

## See also

- [MCP test timings](../../mcp/daemon/index.md)
- [iOS automation server](xctestservice.md)
