# UI Tests

Write and run automated UI tests using AutoMobile.

## Overview

| Method | Description |
|--------|-------------|
| AI-generated | Ask agent to create tests from natural language |
| YAML plans | Record interactions → generate executable plans |
| JUnitRunner | Kotlin/Java tests with AI self-healing |

## YAML Test Plans

Record interactions and generate executable test plans:

```mermaid
flowchart LR
    Record["Record Interactions"] --> Generate["Generate YAML"]
    Generate --> Execute["Execute Plan"]
    Execute --> CI["Run in CI"]
```

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

Plans support assertions, conditional steps, and wait conditions.

See [Test Recording](../design-docs/plat/android/ide-plugin/test-recording.md) for the complete workflow.

## AI-Generated Tests

Ask your agent to create tests from descriptions:

```
Write a UI test that verifies the login flow works correctly
```

## Running Tests

```bash
# All UI tests
./gradlew testDebugUnitTest

# Specific tests
./gradlew testDebugUnitTest --tests '*AutoMobileTest'
```

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
