# XCTest Runner

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

Environment variables and test scheme settings:

- `AUTOMOBILE_MCP_URL`: MCP server endpoint.
- `AUTOMOBILE_CI_MODE`: disable AI assistance in CI.
- `AUTOMOBILE_TEST_PLAN`: default plan path for a test target.
- `AUTOMOBILE_TEST_TIMEOUT_SECONDS`: per-test timeout override.

## Example usage

```swift
final class LoginFlowTests: AutoMobileTestCase {
  override var planPath: String { "Tests/Plans/login-success.yaml" }
}
```

## Timing data

The runner should fetch timing history during startup to order tests when parallel
execution is enabled and report results after each run.

## See also

- [MCP test timings](../../mcp/daemon/index.md)
- [iOS automation server](accessibility-service.md)
