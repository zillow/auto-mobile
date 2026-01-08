# UI Tests with AutoMobile

Write and run automated UI tests using AutoMobile's testing framework.


AutoMobile supports:
* Automated UI test execution
* Integration with JUnit on Android
* Test recording via IDE plugin

## Writing Tests

### Using AI to Generate Tests

Ask your AI agent to create tests:

```
Write a UI test that verifies the login flow works correctly
```

The agent will generate test code that you can review and commit.

### Manual Test Writing

See [JUnitRunner documentation](../design-docs/plat/android/junitrunner.md) for details on writing tests manually.

## Test Recording & YAML Plans

Record user interactions and generate executable YAML test plans using the IDE plugin:

1. **Start Recording** - Click "Start Recording" in the IDE plugin tool window
2. **Interact with App** - Tap, swipe, and input text normally
3. **Stop Recording** - Generate a YAML plan from your interactions
4. **Execute Plan** - Run the plan via IDE plugin, code (`executePlan` tool), or CLI

### YAML Plan Format

```yaml
steps:
  - tool: launchApp
    params:
      appId: com.example.app

  - tool: tapOn
    params:
      text: "Login"

  - tool: inputText
    params:
      text: "user@example.com"
```

Plans support assertions, conditional steps, and wait conditions for robust test automation.

### Learn More

See the [Test Recording guide](../design-docs/plat/android/ide-plugin/test-recording.md) for:
- Complete recording workflow
- YAML plan structure and advanced features
- Execution methods (IDE, code, CI)
- Best practices and troubleshooting

## Running Tests

### Local Execution

```bash
# Run all UI tests
./gradlew testDebugUnitTest

# Run specific tests
./gradlew testDebugUnitTest --tests '*AutoMobileTest'
```

### IDE Plugin

Use the Android Studio plugin to:

* Record user interactions as tests
* Inspect historical test timing data

See [IDE Plugin](../design-docs/plat/android/ide-plugin/overview.md) for setup.

## Test Organization

Organize tests by feature:

```
test/
  ├── kotlin/
  │   └── auth/
  │       ├── SignupFlowTests.kt
  └── resources/
      └── test-plans/
          └── signupFlow/
              ├── login-success.yaml
              ├── login-forgot-password.yaml
              ├── login-bad-credentials.yaml
              ├── signup-success.yaml
              └── signup-invalid-email.yaml
```

## Best Practices

- **Keep tests focused**: One feature per test
- **Use descriptive names**: `testLoginWithValidCredentials()`
- **Clean up state**: Reset app state between tests
- **Run in CI**: Automate test execution on every commit
