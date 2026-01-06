# UI Tests with AutoMobile

Write and run automated UI tests using AutoMobile's testing framework.

## Overview

AutoMobile supports:
- Automated UI test execution
- Integration with JUnit on Android
- Test recording via IDE plugin
- CI/CD integration

## Writing Tests

### Using AI to Generate Tests

Ask your AI agent to create tests:

```
Write a UI test that verifies the login flow works correctly
```

The agent will generate test code that you can review and commit.

### Manual Test Writing

See [JUnitRunner documentation](../design-docs/plat/android/junitrunner.md) for details on writing tests manually.

## Running Tests

### Local Execution

```bash
# Run all UI tests
./gradlew connectedAndroidTest

# Run specific test
./gradlew connectedAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.example.LoginTest
```

### IDE Plugin

Use the Android Studio plugin to:
- Record user interactions as tests
- Run tests from the IDE
- View test results

See [IDE Plugin](../design-docs/plat/android/ide-plugin/overview.md) for setup.

## Test Organization

Organize tests by feature:

```
androidTest/
  ├── auth/
  │   ├── LoginTest.kt
  │   └── SignupTest.kt
  ├── checkout/
  │   └── PaymentFlowTest.kt
  └── navigation/
      └── MainNavigationTest.kt
```

## Best Practices

- **Keep tests focused**: One feature per test
- **Use descriptive names**: `testLoginWithValidCredentials()`
- **Clean up state**: Reset app state between tests
- **Run in CI**: Automate test execution on every commit
