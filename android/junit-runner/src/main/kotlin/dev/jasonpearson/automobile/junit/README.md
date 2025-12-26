# AutoMobile JUnitRunner

A custom JUnit runner that seamlessly integrates AutoMobile YAML test plans with JUnit test execution, providing
intelligent failure recovery through AI agent intervention.

## Features

### Core Functionality

- Execute YAML test plans through JUnit test annotations
- AI-assisted failure recovery (when enabled)
- Support for both existing YAML plans and dynamic plan generation from prompts
- Configurable test execution timeouts and device targeting

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
- `timeoutMs`: Maximum execution time per test in milliseconds (default: 300000 - 5 minutes)
- `device`: Target device ID or "auto" for any available device (default: "auto")

### Plan Generation Logic

When using prompt-based testing:

1. **Plan Discovery**: Runner checks if a generated plan already exists for the test method
2. **Age Check**: If plan exists, checks if it's fresh enough (configurable via `automobile.plan.max.age.ms`)
3. **Generation**: If no plan exists or it's stale, connects to AutoMobile MCP server to generate new plan from prompt
4. **Caching**: Generated plan is saved to `test-plans/generated/` directory for reuse
5. **Execution**: Plan is executed like any other YAML plan

### Configuration

#### System Properties

- `automobile.mcp.server`: MCP server URL (default: `ws://localhost:3000`)
- `automobile.mcp.max.iterations`: Maximum AI agent iterations (default: `10`)
- `automobile.cli.path`: Path to AutoMobile CLI (default: uses npx)
- `automobile.use.npx`: Use npx instead of global installation (default: true)
- `automobile.debug`: Enable debug logging (default: false)
- `automobile.ci.mode`: Disable AI assistance in CI environments (default: false)
- `automobile.plan.max.age.ms`: Max age for generated plans in milliseconds (default: 3600000 - 1 hour)

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

1. **MCP Connection**: JUnitRunner connects to AutoMobile MCP WebSocket server (default: `ws://localhost:3000`)
2. **AI Agent Session**: Starts AI agent session with the prompt as the goal
3. **Iterative Exploration**: AI agent uses AutoMobile MCP tools to explore and discover steps
4. **Plan Generation**: AI agent generates YAML plan based on iterative learning
5. **Plan Execution**: Generated plan is executed via AutoMobile CLI

**Configuration:**

- `automobile.mcp.server`: MCP server URL (default: `ws://localhost:3000`)
- `automobile.mcp.max.iterations`: Maximum AI agent iterations (default: `10`)

**Note**: The AI agent generates plans through iterative exploration using the AutoMobile MCP server, not through direct
CLI commands.

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
- CLI integration for plan execution
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
- Access to Android devices/emulators

## Installation

Add to your `build.gradle`:

```gradle
dependencies {
    testImplementation 'com.automobile:junit-runner:1.0.0'
}
```

Ensure AutoMobile CLI is available:

```bash
# Option 1: Global installation
npm install -g auto-mobile

# Option 2: npx (automatic fallback)
# No installation required - uses npx automatically
```
