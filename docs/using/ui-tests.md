# UI Tests

Write and run automated UI tests using AutoMobile.

## Overview

## Example Prompts

| Goal | Prompt |
|------|--------|
| Exploratory | "Explore <<feature>> so we can create tests for it" |
| Regression | "Given <<regression steps to reproduce>>, lets run an exploration that would reproduce it and verify the bug is no longer possible." |
| Built to spec | "Attempt to verify the <<product spec>>> given the current app version installed." |
| Navigation Graph | "Build a [navigation graph](../design-docs/mcp/nav/index.md) and then describe it as a mermaid diagram" |
| Break it | "Attempt to execute UX interactions that might expose bugs in <<feature>>" |

### Example Plan

```yaml
steps:
  - tool: launchApp
    appId: com.example.app

  - tool: tapOn
    selector:
      - text: "Login"

  - tool: inputText
    selector:
      - text: "user@example.com"
```

Plans support conditional steps which have internal assertions and wait conditions.

See [Test Recording](../design-docs/plat/android/ide-plugin/test-recording.md) for the current workflow on Android.

## AI-Generated Tests

Ask your agent to create tests from descriptions:

```
Write a UI test that verifies the login flow works correctly
```

## Running Tests

AutoMobile tests run using the **JUnit runner** (not `connectedAndroidTest`). This is similar to how screenshot tests work - they execute in the unit test configuration but communicate with a running emulator or device.

```bash
# All UI tests
./gradlew testDebugUnitTest

# Specific tests
./gradlew testDebugUnitTest --tests '*AutoMobileTest'
```

**Note:** Since these tests run via `testDebugUnitTest`, they will execute alongside your regular unit tests when running `gradle test`. Consider using test filtering or a separate test task if you want to run AutoMobile tests independently (e.g., they require an emulator to be running).

## Project Structure

```
test/
├── kotlin/auth/
│   └── SignupFlowTests.kt
└── resources/test-plans/signupFlow/
    ├── login-success.yaml
    ├── login-bad-credentials.yaml
    └── signup-success.yaml
```

## Best Practices

| Practice | Rationale |
|----------|-----------|
| One feature per test | Easier debugging and maintenance |
| Descriptive names | `testLoginWithValidCredentials()` |
| Reset state between tests | Prevents test pollution |
| Run in CI | Catch regressions early |

## Related

- [JUnitRunner](../design-docs/plat/android/junitrunner.md) - Test framework details
- [IDE Plugin](../design-docs/plat/android/ide-plugin/overview.md) - Recording and debugging
