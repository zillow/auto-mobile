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

class MyAppTests: AutoMobileTestCase {
    override func testConfiguration() -> Configuration {
        return Configuration(
            mcpEndpoint: "http://localhost:3000",
            planPath: "plans/login-flow.yaml",
            retryCount: 2,
            timeout: 300
        )
    }

    func testLoginFlow() throws {
        try testPlan()
    }
}
```

### AutoMobilePlanExecutor

Executes automation plans with retry and cleanup logic:

```swift
let config = AutoMobileTestCase.Configuration(
    mcpEndpoint: "http://localhost:3000",
    planPath: "plans/checkout.yaml",
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

- `MCP_ENDPOINT`: MCP server endpoint (default: http://localhost:3000)
- `PLAN_PATH`: Path to YAML automation plan
- `RETRY_COUNT`: Number of retry attempts (default: 0)
- `TEST_TIMEOUT`: Test timeout in seconds (default: 300)

### Test Scheme Settings

Configure in Xcode test scheme:
1. Edit Scheme → Test → Arguments
2. Add environment variables
3. Configure test ordering and parallelization

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
