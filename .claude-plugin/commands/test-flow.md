---
description: Test a user flow end-to-end with assertions and reporting
allowed-tools: mcp__auto-mobile__executePlan, mcp__auto-mobile__observe, mcp__auto-mobile__launchApp, mcp__auto-mobile__terminateApp, mcp__auto-mobile__deviceSnapshot
---

Execute and validate a complete user flow with proper setup, assertions, and cleanup.

## Workflow

1. **Understand the flow**: Clarify what user journey to test:
   - Starting state (fresh install, logged in, specific screen)
   - Steps to perform
   - Expected outcomes at each step
   - Final success criteria

2. **Prepare test environment**:
   - Use `deviceSnapshot` to capture clean state (optional, for restoration)
   - Launch the app with `launchApp`
   - Verify starting screen with `observe`

3. **Create test plan** in YAML format for `executePlan`:
   ```yaml
   name: User Flow Test
   steps:
     - action: observe
       assert:
         screen: LoginScreen
     - action: tapOn
       params:
         text: "Sign In"
     - action: inputText
       params:
         text: "test@example.com"
     - action: observe
       assert:
         contains: "Welcome"
   ```

4. **Execute the plan** with `executePlan`:
   - Monitor step-by-step progress
   - Capture screenshots at key points
   - Stop on first failure for debugging

5. **Handle failures**:
   - If a step fails, analyze the current screen state
   - Determine if it's a test issue or app bug
   - Suggest fixes or report the bug

6. **Cleanup**:
   - Terminate the app with `terminateApp`
   - Restore device snapshot if captured earlier

7. **Report results**:
   - Steps passed/failed
   - Screenshots of key moments
   - Timing information
   - Failure details with context

## Best Practices

- One logical flow per test
- Clear assertions at each critical step
- Proper state isolation between tests
- Descriptive step names for debugging
