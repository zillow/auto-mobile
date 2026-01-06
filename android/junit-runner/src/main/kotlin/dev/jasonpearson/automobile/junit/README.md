# AutoMobile JUnitRunner

A custom JUnit runner that seamlessly integrates AutoMobile YAML test plans with JUnit test execution, providing
intelligent failure recovery through AI agent intervention and fast daemon socket execution.

## Features

### Core Functionality

- Execute YAML test plans through JUnit test annotations
- AI-assisted failure recovery (when enabled)
- Support for both existing YAML plans and dynamic plan generation from prompts
- Configurable test execution timeouts and device targeting
- Long-lived AutoMobile daemon with Unix socket IPC for low overhead per test

### Plan Execution Methods

#### 1. Pre-existing YAML Plans
```kotlin
@Test
@AutoMobileTest(plan = "test-plans/login-flow.yaml")
fun testLoginFlow() {
    // Test executes the specified YAML plan
}
```

#### 2. Prompt-based Plan Generation (New Feature)
```kotlin
@Test
@AutoMobileTest(
    prompt = "Launch the clock app and create a new timer for 5 minutes, then start the timer",
    aiAssistance = true
)
fun `create timer from prompt`() {
    // AI generates a YAML plan from the prompt and executes it
    // Generated plan saved to: test-plans/generated/ClassName_methodName.yaml
}
```

## Usage

### Test Annotation Parameters

- `plan`: Path to existing YAML test plan relative to test resources
- `prompt`: Natural language description for AI-generated test plan (requires `aiAssistance = true`)
- `maxRetries`: Maximum retry attempts before AI intervention (default: 0)
- `aiAssistance`: Enable/disable AI agent recovery on failure (default: true)
- `timeoutMs`: Maximum execution time per test in milliseconds (default: 60000 - 1 minute)
- `device`: Target device ID or "auto" for any available device (default: "auto")
- `appId`: App package name to clean up after the test (terminate or clear app data)
- `cleanupAfter`: Terminate the app after the test completes (default: true)
- `clearAppData`: Clear app data after the test completes (default: false, Android only)

### Plan Generation Logic

When using prompt-based testing:

1. **Plan Discovery**: Runner checks if a generated plan already exists for the test method
2. **Age Check**: If plan exists, checks if it's fresh enough (configurable via `automobile.plan.max.age.ms`)
3. **Generation**: If no plan exists or it's stale, connects to AutoMobile MCP server to generate new plan from prompt
4. **Caching**: Generated plan is saved to `test-plans/generated/` directory for reuse
5. **Execution**: Plan is executed like any other YAML plan

### Configuration

#### System Properties

- `automobile:localhost:3000`)
- `automobile.mcp.max.iterations`: Maximum AI agent iterations (default: `10`)
- `automobile.debug`: Enable debug logging (default: false)
- `automobile.ci.mode`: Disable AI assistance in CI environments (default: false)
- `automobile.plan.max.age.ms`: Max age for generated plans in milliseconds (default: 3600000 - 1 hour)
- `automobile.daemon.startup.timeout.ms`: Daemon startup timeout in milliseconds (default: 10000)
- `automobile.junit.shuffle.enabled`: Randomize test execution order (default: true)
- `automobile.junit.shuffle.seed`: Seed for randomized order (default: current time)
- `automobile.junit.timing.enabled`: Fetch historical timing data from the daemon (default: true)
- `automobile.junit.timing.lookback.days`: Days of history to include (default: 90)
- `automobile.junit.timing.limit`: Max tests returned from timing query (default: 1000)
- `automobile.junit.timing.min.samples`: Minimum sample size per test (default: 1)
- `automobile.junit.timing.ordering`: Test order strategy based on historical duration (`auto`, `none`, `duration-asc`, `duration-desc`; default: `auto`)
- `automobile.junit.timing.fetch.timeout.ms`: Timing query timeout in milliseconds (default: 5000)
  - Timing fetch is automatically disabled when CI is detected (`automobile.ci.mode=true` or `CI=true`).

### Historical Test Timing

On startup, the runner requests historical execution timing data from the AutoMobile daemon using the
`getTestTimings` MCP tool. This data is cached for the JVM and can optionally drive test ordering.
When `automobile.junit.timing.ordering=auto`, the runner chooses longest-first when effective parallel
forks are greater than 1 after device availability is applied, otherwise shortest-first. Set
`automobile.junit.timing.ordering=none` to disable ordering.

Example response format:

```json
{
  "testTimings": [
    {
      "testClass": "com.example.LoginTest",
      "testMethod": "testSuccessfulLogin",
      "averageDurationMs": 1250,
      "sampleSize": 15,
      "lastRun": "2026-01-05T12:00:00Z",
      "successRate": 0.93
    }
  ],
  "generatedAt": "2026-01-05T13:00:00Z",
  "totalTests": 150
}
```

### Test Cleanup Behavior

By default, tests with `appId` set will terminate the app after execution to reduce state leakage.
To fully reset app state between tests, set `clearAppData = true` (Android only). If `cleanupAfter`
is enabled but `appId` is blank, cleanup is skipped and a warning is logged.

#### Generated Plans Directory Structure

```
src/test/resources/
├── test-plans/
│   ├── existing-plan.yaml          # Manually created plans
│   └── generated/                  # AI-generated plans (gitignored)
│       ├── MyTestClass_testMethod1.yaml
│       └── MyTestClass_testMethod2.yaml
```

### AI Plan Generation Command

The runner connects to the AutoMobile MCP server and uses an AI agent to iteratively generate plans:

**Architecture Flow:**

1. **MCP Connection**: JUnitRunner connects to automobile:localhost:3000`)
2. **AI Agent Session**: Starts AI agent session with the prompt as the goal
3. **Iterative Exploration**: AI agent uses AutoMobile MCP tools to explore and discover steps
4. **Plan Generation**: AI agent generates YAML plan based on iterative learning
5. **Plan Execution**: Generated plan is executed via AutoMobile daemon socket IPC

**Configuration:**

- `automobile:localhost:3000`)
- `automobile.mcp.max.iterations`: Maximum AI agent iterations (default: `10`)

**Note**: The AI agent generates plans through iterative exploration using the AutoMobile MCP server, not through direct
direct plan execution commands.

## Examples

### Basic Example with Existing Plan

```kotlin
@RunWith(AutoMobileRunner::class)
class LoginTests {
    
    @Test
    @AutoMobileTest(plan = "test-plans/user-login.yaml")
    fun testUserLogin() {
        // Executes pre-defined YAML plan
    }
}
```

### Prompt-based Testing

```kotlin
@RunWith(AutoMobileRunner::class)
class ClockAppTests {
    
    @Test
    @AutoMobileTest(
        prompt = "Open the clock app, navigate to alarms, and verify that there are no active alarms set",
        aiAssistance = true,
        timeoutMs = 120000 // 2 minutes
    )
    fun `verify no active alarms`() {
        // AI generates and executes plan from prompt
    }
    
    @Test
    @AutoMobileTest(
        prompt = "Launch the clock app and create a new timer for 5 minutes, then start the timer"
    )
    fun `create timer from prompt`() {
        // Another AI-generated test case
    }
}
```

### Mixed Approach
```kotlin
@RunWith(AutoMobileRunner::class)
class MixedTests {
    
    @Test
    @AutoMobileTest(plan = "test-plans/stable-login.yaml", aiAssistance = false)
    fun testStableLogin() {
        // Uses existing plan, no AI assistance
    }
    
    @Test
    @AutoMobileTest(prompt = "Test the new feature X by doing Y and Z")
    fun testNewFeature() {
        // AI generates plan for exploratory testing
    }
}
```

## Implementation Status

### ✅ Completed Features

- Basic YAML plan execution via JUnit annotations
- Prompt-based plan generation framework
- Generated plan caching and age management
- Daemon socket execution for plan runs
- Configuration via system properties
- Proper error handling and logging

### 🚧 Dependencies

- **AutoMobile MCP Server**: Required for prompt-based plan generation
  - AI agent connects via WebSocket
  - Uses AutoMobile MCP tools for iterative exploration
  - Generates YAML plans through iterative learning

### 🔄 Future Enhancements

- AI failure recovery implementation
- Advanced plan generation with context
- Test result reporting integration
- Performance optimization for plan generation

## Requirements

- Java 11+
- JUnit 4 or 5
- AutoMobile MCP server
- AutoMobile daemon (auto-mobile package via bun/bunx)
- Access to Android devices/emulators

## Installation

Add to your `build.gradle`:

```gradle
dependencies {
    testImplementation 'com.automobile:junit-runner:1.0.0'
}
```

Ensure AutoMobile daemon dependencies are available:

```bash
# Ensure bun is installed; the daemon is launched via bun/bunx.
# The runner will start the daemon automatically when needed.
npm install -g auto-mobile
```
