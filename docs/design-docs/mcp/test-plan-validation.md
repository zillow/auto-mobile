# Test Plan Validation

AutoMobile includes comprehensive YAML validation for test plans to catch syntax errors and schema violations early in the development process.

## Overview

All test plan YAML files are validated against a JSON schema that defines:

- Required fields (name, steps)
- Allowed tool names
- Step structure and parameters
- Metadata format
- Legacy field support for backwards compatibility

## Validation Levels

### 1. Parse Validation
All YAML files must be syntactically valid and parseable by the YAML parser. Parse errors include line and column numbers to help locate issues.

**YAML Features Supported:**

- ✅ YAML anchors (`&anchor-name`)
- ✅ Anchor references (`*anchor-name`)
- ✅ Merge keys (`<<: *anchor`)
- ✅ Multi-document YAML (though plans should use single documents)

### 2. Schema Validation
Test plans must conform to the AutoMobile test plan schema:

- `schemas/test-plan.schema.json` - JSON Schema Draft 7 format

The schema validates:

- Required fields (`name`, `steps`)
- Field types (strings, arrays, objects, etc.)
- Array constraints (minItems, uniqueItems)
- String constraints (minLength, pattern)
- Nested structures (expectations, metadata, critical sections)

**Note:** Tool-specific parameters (e.g., `appId` for `launchApp`, `id`/`text` for `tapOn`) are validated at runtime by individual tool handlers, not by the schema.

### 3. Execution-Time Validation

Validation happens automatically in two places:

**Daemon-backed MCP Server (`executePlan` tool, daemon mode only):**

- Validates YAML before parsing
- Runs in TypeScript using AJV (Another JSON Schema Validator)
- Reports errors with line/column numbers when possible

**Kotlin JUnit Runner (`AutoMobilePlanExecutor`):**

- Validates YAML after parameter substitution but before sending to daemon
- Runs in Kotlin using networknt json-schema-validator
- Reports errors with line/column numbers when possible
- Ensures test plans fail fast in Android tests with clear error messages

## Running Validation Locally

### Validate All Test Plans
```bash
bun run validate:yaml
```

This scans all `**/test-plans/**/*.yaml` files in the repository.

### Validate Specific File or Pattern
```bash
bun scripts/validate-yaml.ts "path/to/your/plan.yaml"
bun scripts/validate-yaml.ts "test/resources/**/*.yaml"
```

### Example Output

**Success:**
```text
AutoMobile Test Plan YAML Validation
====================================

Found 20 test plan file(s) to validate

✓ test/resources/test-plans/playground/ux-exploration/navigate-demo-index.yaml
✓ test/resources/test-plans/playground/accessibility/combined-a11y-audit.yaml
...

Validation Summary
==================
Total files:   20
Valid files:   20
Invalid files: 0

✅ All test plans are valid!
```

**Failure:**
```text
✗ test/resources/test-plans/my-plan.yaml
  root: Missing required property 'name'
  steps[0].tool: Must be one of: observe, tapOn, swipeOn, launchApp, ...
  steps[2]: Unknown property 'invalidField'. This might be a legacy field - check the migration guide.

❌ Validation failed - see errors above
```

## CI Integration

YAML validation runs automatically in GitHub Actions on every pull request:

- Job name: **Validate YAML Test Plans**
- Workflow: `.github/workflows/pull_request.yml`
- Runs alongside other validation steps (XML, shell scripts, MkDocs navigation)

If validation fails, the PR check will fail and block merging.

## Test Plan Schema

### Required Fields

```yaml
name: my-test-plan          # Required: unique plan identifier
steps:                      # Required: at least one step
  - tool: observe           # Required: tool name
    label: Wait for app     # Optional: human-readable description
```

### Complete Example

```yaml
name: complete-example
description: Comprehensive test plan example
mcpVersion: 0.0.7
metadata:
  createdAt: "2025-01-08T00:00:00.000Z"
  version: "1.0.0"
  appId: com.example.app

steps:
  - tool: launchApp
    appId: com.example.app
    clearAppData: true
    label: Launch app with clean state

  - tool: observe
    label: Wait for home screen

  - tool: tapOn
    id: login_button
    label: Tap login button
    expectations:
      - type: elementVisible
        selector:
          testTag: welcome_message
```

### Supported Tools

The schema validates the following tool names:

- `observe`
- `tapOn`
- `swipeOn`
- `launchApp`
- `terminateApp`
- `installApp`
- `inputText`
- `clearText`
- `pressButton`
- `highlight`
- `auditAccessibility`
- `openLink`
- `postNotification`
- `criticalSection`

### Parameter Formats

Step parameters can be specified in two ways:

**1. Inside `params` object (recommended for new plans):**
```yaml
steps:
  - tool: tapOn
    params:
      id: my_button
    label: Tap button
```

**2. As top-level step properties (also valid):**
```yaml
steps:
  - tool: tapOn
    id: my_button
    label: Tap button
```

Both formats are valid. The `PlanNormalizer` converts top-level properties into the `params` object at runtime.

### YAML Anchors and Merge Keys

Test plans support YAML anchors and merge keys to reduce repetition and make plans more maintainable:

**Example: Reusing common parameters**
```yaml
name: anchor-example
steps:
  # Define anchor for common launch params
  - tool: launchApp
    params: &launch-params
      appId: com.example.app
      coldBoot: false
      clearAppData: false
    label: First launch

  # Reuse anchor with merge and override
  - tool: launchApp
    params:
      <<: *launch-params  # Merge all properties from anchor
      coldBoot: true       # Override specific property
    label: Second launch with cold boot

  # Use same params again
  - tool: launchApp
    params: *launch-params
    label: Third launch (same as first)
```

**Example: Multi-device plans with anchors**
```yaml
name: multi-device-anchor-example
devices:
  - A
  - B
steps:
  - tool: observe
    params: &observe-common
      includeScreenshot: true
      includeHierarchy: true
      device: A

  - tool: tapOn
    params:
      device: A
      text: Sync

  - tool: observe
    params:
      <<: *observe-common
      device: B  # Override device while keeping other params
```

The validation system fully supports YAML anchors and merge keys - they are resolved during YAML parsing before schema validation occurs.

### Legacy Field Support

The schema allows legacy fields for backwards compatibility:

**Plan level:**
- `generated` → Use `metadata.createdAt`
- `appId` → Use `metadata.appId`
- `parameters` → Deprecated

**Step level:**
- `description` → Use `label`

These fields are marked as deprecated but won't fail validation. The migration system handles conversion at runtime.

## IDE Integration

### VS Code YAML Extension

Add to your workspace settings (`.vscode/settings.json`):

```json
{
  "yaml.schemas": {
    "./schemas/test-plan.schema.json": "**/test-plans/**/*.yaml"
  }
}
```

This enables:

- Autocomplete for test plan fields
- Inline validation errors
- Hover documentation
- Schema-aware formatting

### IntelliJ IDEA / Android Studio

1. Open Settings → Languages & Frameworks → Schemas and DTDs → JSON Schema Mappings
2. Add new mapping:
   - Name: `AutoMobile Test Plans`
   - Schema file: `schemas/test-plan.schema.json`
   - Schema version: `JSON Schema version 7`
   - File path pattern: `**/test-plans/**/*.yaml`

## Programmatic Usage

### In TypeScript/JavaScript

```typescript
import { PlanSchemaValidator } from './src/utils/plan/PlanSchemaValidator';

const validator = new PlanSchemaValidator();
await validator.loadSchema();

// Validate YAML content
const result = validator.validateYaml(yamlContent);
if (!result.valid) {
  console.error('Validation errors:');
  result.errors?.forEach(err => {
    console.error(`  ${err.field}: ${err.message}`);
  });
}

// Validate file
const fileResult = await validator.validateFile('path/to/plan.yaml');
```

### In Kotlin/Java (JUnit Runner)

```kotlin
import dev.jasonpearson.automobile.junit.PlanSchemaValidator

// Validate YAML content
val result = PlanSchemaValidator.validateYaml(yamlContent)
if (!result.valid) {
    result.errors.forEach { err ->
        val location = err.line?.let { " (line $it)" } ?: ""
        println("${err.field}: ${err.message}$location")
    }
}
```

Validation is automatic in `AutoMobilePlanExecutor.loadAndProcessPlan()`. If validation fails, you'll get an `IllegalArgumentException`:

```text
java.lang.IllegalArgumentException: Plan YAML validation failed:
steps[0].tool: Missing required property 'tool' (line 5)
steps[2]: Unknown property 'invalidField'. This might be a legacy field - check the migration guide.

The plan does not conform to the AutoMobile test plan schema.
Check schemas/test-plan.schema.json for details.
```

### In executePlan Tool

Validation is automatic when using the `executePlan` MCP tool. If a plan fails validation, you'll receive an `ActionableError` with details:

```text
Plan YAML validation failed:
steps[0].tool: Must be one of: observe, tapOn, swipeOn, ... (line 5)
steps[2]: Missing required property 'tool' (line 12)

The plan does not conform to the AutoMobile test plan schema.
Check the schema at schemas/test-plan.schema.json for details.
```

## Troubleshooting

### "Unknown property" errors for valid parameters

If you see errors like:
```text
steps[0]: Unknown property 'auditType'. This might be a legacy field - check the migration guide.
```

This means the property should be inside the `params` object or is a tool-specific parameter. Since `additionalProperties: true` is set for steps, this shouldn't fail validation, but indicates the field might be better placed in `params`.

### "Must be one of" tool name errors

If you see:
```text
steps[0].tool: Must be one of: observe, tapOn, swipeOn, ...
```

The tool name is not recognized. Check:
1. Is the tool name spelled correctly?
2. Is it a custom/legacy tool that needs to be added to the schema?
3. Has the tool been deprecated or renamed?

### YAML parsing errors

If you see:
```yaml
root: YAML parsing failed: bad indentation of a mapping entry at line 10, column 3
```

This is a syntax error in your YAML. Common causes:

- Incorrect indentation (use 2 spaces, not tabs)
- Missing colons after keys
- Unquoted strings with special characters
- Mismatched brackets/braces

## Future Enhancements

Planned improvements for YAML validation:

1. **Tool Parameter Validation** - Validate tool-specific parameters against Zod schemas at the schema level (currently validated at runtime)
2. **Schema Documentation** - Auto-generate schema docs from JSON schema with examples
3. **Custom Rules** - Add custom validation rules (e.g., required labels, naming conventions, accessibility requirements)
4. **Pre-commit Hook** - Automatically validate changed YAML files before commit
5. **Better Error Recovery** - Suggest fixes for common validation errors
6. **Performance Profiling** - Validate that plans don't contain known performance anti-patterns

## Related Documentation

- [ExecutePlan Assertions Design](../plat/android/executeplan-assertions.md) - Design doc for assertion expectations
- [MCP Migrations](storage/migrations.md) - Migration system design
- [UI Tests Guide](../../using/ui-tests.md) - Guide for using AutoMobile for UI testing
- [JSON Schema](https://github.com/kaeawc/auto-mobile/blob/main/schemas/test-plan.schema.json) - Full schema definition
