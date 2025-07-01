# Test Execution - Options

Three ways to execute AutoMobile plans:

## Execution via JUnit Runner

```kotlin
@AutoMobileTest("login-flow.yaml")
class LoginFlowTest {
    // Test automatically executes the YAML plan
    // JUnit runner handles plan loading and execution
}
```

## Manual CLI Execution

```bash
# Execute plan from command line with YAML content
auto-mobile --cli executePlan --planContent "$(cat my-plan.yaml)"

# Execute starting from a specific step (0-based index)
auto-mobile --cli executePlan --planContent "$(cat my-plan.yaml)" --startStep 2
```

## Manual MCP Agent Execution

```yaml
# Agent calls executePlan tool
- tool: executePlan
  planContent: |
    name: login-test
    steps:
      - tool: launchApp
        params:
          appId: com.example.app
      - tool: tapOn
        params:
          text: Login
```


Plans execute sequentially and stop on the first failed step. Use `startStep` parameter to resume from a specific point.
