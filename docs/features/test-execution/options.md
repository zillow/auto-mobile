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
auto-mobile --cli executePlan --platform android --planContent "$(cat my-plan.yaml)"

# Execute starting from a specific step (0-based index)
auto-mobile --cli executePlan --platform android --planContent "$(cat my-plan.yaml)" --startStep 2
```

## Manual MCP Agent Execution

```yaml
# Agent calls executePlan tool
- tool: executePlan
  params:
    platform: android
    planContent: |
      name: login-test
      steps:
        - tool: launchApp
          params:
            appId: com.example.app
        - tool: tapOn
          params:
            text: Login
            action: tap
```


Plans execute sequentially and stop on the first failed step. Use `startStep` parameter to resume from a specific point.
When `platform` is provided to `executePlan`, it is injected into device-aware tool params if missing.

## Implementation references

- [`src/server/planTools.ts#L9-L44`](https://github.com/kaeawc/auto-mobile/blob/main/src/server/planTools.ts#L9-L44) for the `executePlan` schema (required `platform` and optional `startStep`).
- [`src/utils/plan/PlanExecutor.ts#L70-L170`](https://github.com/kaeawc/auto-mobile/blob/main/src/utils/plan/PlanExecutor.ts#L70-L170) for sequential execution and failure handling.
