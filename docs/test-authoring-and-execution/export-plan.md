# Plans - Exporting

Three ways to export AutoMobile plans from logged tool calls:

Plans are saved as YAML files and can be replayed using `executePlan`.

## Automatic Export

Plans are automatically exported to the specified directory with KotlinPoet-generated test files that reference the YAML
plans.

### MCP Config

TODO: Create a tool call that allows the runtime configuration of these values. This would allow 
for AutoMobile to dynamically create plans and tests that are best suited to the screens being tested.

### Environment Variables

```json
{
  "mcpServers": {
    "AutoMobile": {
      "command": "npx",
      "args": ["-y", "auto-mobile@latest"],
      "env": {
        "AUTO_MOBILE_PLAN_EXPORT_DIR": "/path/to/test-plans",
        "AUTO_MOBILE_TEST_EXPORT_DIR": "/path/to/test/sourceset/package/",
        "AUTO_MOBILE_GENERATE_KOTLIN_TESTS": "true",
        "AUTO_MOBILE_USER_CREDENTIALS": "/path/to/yaml/with/credentials"
      }
    }
  }
}
```

## Manual CLI Export

```bash
# Export plan from command line
auto-mobile --cli exportPlan --planName "login-test"
```

## Manual MCP Agent Export

```yaml
# Agent calls exportPlan tool
- tool: exportPlan
  planName: "shopping-cart-test"
```
