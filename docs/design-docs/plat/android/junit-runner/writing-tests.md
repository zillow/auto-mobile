# Writing Tests

AutoMobile JUnit tests have two parts: a Kotlin test class that declares the test and its parameters,
and a YAML plan file that describes the steps to execute on the device.

## Test class anatomy

```kotlin
package com.example.automobiletest

import dev.jasonpearson.automobile.junit.AutoMobileRunner
import dev.jasonpearson.automobile.junit.AutoMobileTest
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AutoMobileRunner::class)           // (1) use the AutoMobile runner
class AppLaunchTest {

    @Test
    @AutoMobileTest(                         // (2) describe the test
        plan = "test-plans/launch-app.yaml", // path relative to test resources
        appId = "com.example.app",
        aiAssistance = false,
        timeoutMs = 60_000L,
    )
    fun `app launches without crashing`() {  // (3) empty body — runner drives execution
        // AutoMobileRunner executes the referenced YAML plan.
        // The test passes only if every step in the plan succeeds.
    }
}
```

The test method body is intentionally empty. `AutoMobileRunner` reads the `@AutoMobileTest`
annotation, resolves the YAML plan from the classpath, sends it to the daemon, and fires a
pass/fail event based on the daemon's response.

## `@AutoMobileTest` parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `plan` | `String` | `""` | Path to the YAML plan relative to `src/test/resources/`. Required unless `prompt` is set. |
| `prompt` | `String` | `""` | Natural-language description used by the AI agent to generate a plan at runtime. Requires `aiAssistance = true`. |
| `appId` | `String` | `""` | Android package name. Required for `cleanupAfter` and useful for `terminateApp` steps. |
| `aiAssistance` | `Boolean` | `true` | When `true`, the AI agent attempts to recover from failures. Set `false` in CI or when plans are stable. |
| `maxRetries` | `Int` | `0` | Number of automatic retry attempts before AI intervention. |
| `timeoutMs` | `Long` | `30_000` | Maximum wall-clock time (ms) the runner waits for the daemon to respond for this test. |
| `device` | `String` | `"auto"` | Target a specific device serial, or `"auto"` to let the daemon pick from the available pool. |
| `cleanupAfter` | `Boolean` | `true` | Terminate the app after the test completes (requires `appId`). |
| `clearAppData` | `Boolean` | `false` | Clear app data in addition to terminating (requires `appId`). |

### Choosing `aiAssistance`

- Set `aiAssistance = false` for stable plans in CI. This removes the dependency on an AI provider
  API key and makes failures deterministic.
- Set `aiAssistance = true` during development when you want the agent to suggest fixes for flaky
  or evolving UI.

### Timeouts

`timeoutMs` covers the round-trip from the runner to the daemon, including all device interactions
within the plan. Budget generously: each `observe` step that involves a screenshot and accessibility
dump typically takes 1–3 seconds, and `launchApp` can take 3–10 seconds on a cold start.

A plan with five steps should have a timeout of at least 60 seconds.

## YAML plan structure

Plans live in `src/test/resources/` and are resolved from the test classpath.

```
app/
└── src/
    └── test/
        ├── java/
        │   └── com/example/automobiletest/
        │       └── AppLaunchTest.kt
        └── resources/
            └── test-plans/
                ├── launch-app.yaml
                └── app-background-foreground.yaml
```

A minimal plan:

```yaml
---
name: launch-app                                        # (1) plan identifier (no spaces)
description: Launch the app and verify it starts        # (2) human-readable description
steps:
  - tool: launchApp                                     # (3) tool name (camelCase)
    appId: com.example.app
    clearAppData: true
    label: Launch the app with clean state              # (4) optional label shown in logs

  - tool: observe
    label: Verify app UI renders without crashing

  - tool: terminateApp
    appId: com.example.app
    label: Terminate the app after test
```

Each step must have a `tool` key. All other keys are parameters specific to that tool.

## Available tools

The daemon exposes the same tool set available in MCP sessions. See [MCP Tools](../../../mcp/tools.md)
for the complete reference. The most commonly used tools in plans are:

### `launchApp`

Starts an app by package name. Optionally clears app data first.

```yaml
- tool: launchApp
  appId: com.example.app
  clearAppData: true       # clears data before launching (default: false)
  label: Launch the app
```

### `observe`

Captures a screenshot and accessibility hierarchy. Use this to verify the screen state at a given
point in the plan. The step succeeds whenever the device returns a valid UI snapshot.

**Assertion model:** a plain `observe` always passes as long as the device responds. To assert that
specific content is present, use `waitFor` — the step fails (and the test fails) if the element does
not appear within the timeout. This is the primary assertion mechanism in YAML plans: structure your
plan so that required elements are named in `waitFor` clauses at the points where they must appear.

```yaml
- tool: observe
  label: Verify home screen is visible
```

To wait for a specific element before proceeding, use `waitFor` with either `elementId` or `text`:

```yaml
- tool: observe
  waitFor:
    text: "Welcome"          # wait until this text is visible
    timeout: 10000           # optional, ms (default: 5000)

- tool: observe
  waitFor:
    elementId: "com.example.app:id/main_content"
    timeout: 8000
```

!!! warning "`waitFor` requires `text` or `elementId`"
    Providing only `timeout` in `waitFor` is a validation error. You must include either `text`
    or `elementId` alongside `timeout`. To observe without waiting, omit `waitFor` entirely.

### `tapOn`

Taps an element identified by text or resource ID.

```yaml
- tool: tapOn
  text: "Login"
  label: Tap the Login button

- tool: tapOn
  elementId: "com.example.app:id/submit_button"
  action: tap                # tap | doubleTap | longPress
```

### `inputText`

Types into the currently focused input field.

```yaml
- tool: inputText
  text: "user@example.com"
  label: Enter email address
```

### `pressButton`

Presses a hardware or soft button. All button names are **lowercase**.

```yaml
- tool: pressButton
  button: home      # home | back | menu | power | volume_up | volume_down | recent
```

!!! warning "Button values are lowercase"
    Using `HOME`, `BACK`, etc. (uppercase) is a validation error. Use lowercase: `home`, `back`.

### `terminateApp`

Force-stops an app. Fails if the package is not installed.

```yaml
- tool: terminateApp
  appId: com.example.app
  label: Terminate the app
```

### `swipeOn`

Swipes in a direction within an element or the screen.

```yaml
- tool: swipeOn
  direction: up      # up | down | left | right
  label: Scroll down the list
```

### `openLink`

Opens a URL or deep link.

```yaml
- tool: openLink
  url: "myapp://settings"
  label: Open settings via deep link
```

### `setUIState`

Declaratively sets one or more form fields to desired values. Instead of manually tapping each
field, clearing it, and typing, `setUIState` handles field detection, clearing, and input in a
single step. Use this for multi-field forms.

```yaml
- tool: setUIState
  fields:
    - selector:
        text: "Email"
      value: "user@example.com"
    - selector:
        text: "Password"
      value: "${TEST_PASSWORD}"  # resolved from environment at runtime
      sensitive: true            # skips value verification for this field
    - selector:
        elementId: "com.example.app:id/remember_me"
      selected: true             # sets a checkbox or toggle
```

Pass secrets via environment variables rather than hardcoding them in plan files. The daemon
resolves `${VAR_NAME}` references from the test process environment at execution time.

`setUIState` scrolls to find fields that are not immediately visible and retries on failure.

## Example plans

### App launch test

```yaml
---
name: launch-app
description: Launch the app and verify it opens without crashing
steps:
  - tool: launchApp
    appId: com.example.app
    clearAppData: true
    label: Launch with clean state

  - tool: observe
    label: Verify initial screen renders

  - tool: terminateApp
    appId: com.example.app
    label: Terminate the app
```

Corresponding test class:

```kotlin
@RunWith(AutoMobileRunner::class)
class AppLaunchTest {

    @Test
    @AutoMobileTest(
        plan = "test-plans/launch-app.yaml",
        appId = "com.example.app",
        aiAssistance = false,
        timeoutMs = 60_000L,
    )
    fun `app launches without crashing`() {}
}
```

### Background and foreground cycle

```yaml
---
name: app-background-foreground
description: Launch the app, send it to the background, then bring it back to the foreground
steps:
  - tool: launchApp
    appId: com.example.app
    clearAppData: true
    label: Launch with clean state

  - tool: observe
    label: Wait for initial UI to render

  - tool: pressButton
    button: home
    label: Press home button to background the app

  - tool: launchApp
    appId: com.example.app
    clearAppData: false
    label: Bring the app back to the foreground

  - tool: observe
    label: Verify app state is restored

  - tool: terminateApp
    appId: com.example.app
    label: Terminate the app
```

```kotlin
@RunWith(AutoMobileRunner::class)
class AppLifecycleTest {

    @Test
    @AutoMobileTest(
        plan = "test-plans/app-background-foreground.yaml",
        appId = "com.example.app",
        aiAssistance = false,
        maxRetries = 1,
        timeoutMs = 90_000L,
    )
    fun `app survives background and foreground transition`() {}
}
```

### Login flow

```yaml
---
name: login-flow
description: Enter credentials and verify successful login
steps:
  - tool: launchApp
    appId: com.example.app
    clearAppData: true

  - tool: observe
    waitFor:
      text: "Sign in"
      timeout: 10000
    label: Wait for login screen

  - tool: tapOn
    text: "Email"

  - tool: inputText
    text: "user@example.com"

  - tool: tapOn
    text: "Password"

  - tool: inputText
    text: "supersecret"

  - tool: tapOn
    text: "Sign in"

  - tool: observe
    waitFor:
      text: "Home"
      timeout: 15000
    label: Verify navigation to home screen

  - tool: terminateApp
    appId: com.example.app
```

## Grouping tests by class

One class per user flow keeps plans focused and failures easy to diagnose. A class can contain
multiple test methods, each with its own plan:

```kotlin
@RunWith(AutoMobileRunner::class)
class OnboardingTests {

    @Test
    @AutoMobileTest(
        plan = "test-plans/onboarding-skip.yaml",
        appId = "com.example.app",
        aiAssistance = false,
        timeoutMs = 60_000L,
    )
    fun `user can skip onboarding`() {}

    @Test
    @AutoMobileTest(
        plan = "test-plans/onboarding-complete.yaml",
        appId = "com.example.app",
        aiAssistance = false,
        timeoutMs = 120_000L,
    )
    fun `user can complete onboarding`() {}
}
```

The runner executes tests sequentially within a class when only one device is available, and in
parallel when multiple devices are present.

## Plan validation

Plans are validated against a JSON schema before execution. Common validation errors:

| Error | Cause | Fix |
|---|---|---|
| `Missing required property 'tool'` | A step is missing the `tool` key | Add `tool: <toolName>` to the step |
| `Invalid option: expected one of "home"\|"back"\|...` | Uppercase `button` value | Change to lowercase: `home`, `back`, `menu` |
| `Invalid input: expected string, received undefined` in `waitFor` | `waitFor` with only `timeout` | Add `text: "..."` or `elementId: "..."` |
| `Unknown property 'foo'` | Misspelled or legacy field name | Check the [MCP Tools](../../../mcp/tools.md) reference |

## Debugging a failing test

When a test fails, the runner writes a detailed log for each test execution to:

```
app/scratch/test-logs/<timestamp>_<TestClass>_<testMethod>.log
```

The log contains the full daemon response, the step that failed, and any error message from the
device. Start here when a test fails unexpectedly.

The standard Gradle test reports are also available:

```
app/build/test-results/testDebugUnitTest/   # JUnit XML
app/build/reports/tests/testDebugUnitTest/index.html  # HTML report
```

**Common failure patterns:**

| Symptom | Likely cause |
|---|---|
| Step fails with `element not found` | Wrong `text` or `elementId`; try `observe` first and inspect the hierarchy |
| `waitFor` times out | Screen transition is slower than the timeout; increase `timeout` in `waitFor` |
| `terminateApp` fails immediately | App APK not installed; run `adb install` before tests |
| All steps fail with connection error | Daemon not running; start with `auto-mobile --daemon-mode &` |
| Plan fails validation before running | Schema error; see the [Plan validation](#plan-validation) table above |

## See also

- [Project Setup](project-setup.md) — Dependency, Gradle configuration, running locally
- [CI Integration](ci-integration.md) — GitHub Actions workflow
- [MCP Tools](../../../mcp/tools.md) — Full tool parameter reference
- [Test Plan Validation](../../../mcp/test-plan-validation.md) — Schema details
