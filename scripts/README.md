# AutoMobile Scripts

This directory contains build, validation, and utility scripts for the AutoMobile project.

## MCP Context Management

### Context Estimation

Estimate token usage for MCP server components (tools, resources, templates):

```bash
bun run estimate-context
```

**Output:**
- Detailed breakdown of token usage per tool/resource
- Total token counts by category
- Sorted by token count (highest first)

**Options:**
```bash
# Include operation traces from a JSON file
bun run estimate-context --traces path/to/traces.json
```

**Use Cases:**
- Understanding current context usage
- Identifying token-heavy tools or resources
- Planning optimization efforts
- Generating baseline for threshold configuration

### Context Threshold Benchmark

Validate that MCP context usage stays within configured thresholds:

```bash
bun run benchmark-context
```

**Exit Codes:**
- `0` - All thresholds passed
- `1` - One or more thresholds exceeded or error occurred

**Options:**
```bash
# Use custom threshold configuration
bun run benchmark-context --config path/to/thresholds.json

# Output JSON report to file
bun run benchmark-context --output reports/benchmark.json
```

**Use Cases:**
- CI/CD threshold enforcement
- Pre-commit validation
- Regression detection
- Performance budget tracking

### Threshold Configuration

Thresholds are defined in `scripts/context-thresholds.json`:

```json
{
  "version": "1.0.0",
  "thresholds": {
    "tools": 14438,
    "resources": 354,
    "resourceTemplates": 515,
    "total": 15307
  }
}
```

Current thresholds represent baseline + 10% buffer to allow for incremental growth while preventing significant regressions.

## Startup Benchmark

Measure MCP server and daemon startup time (cold/warm) with optional baseline comparison:

```bash
bun run benchmark-startup --compare benchmark/startup-baseline.json --output reports/startup-benchmark.json
```

**Options:**
```bash
# Only run cold or warm measurements
bun run benchmark-startup --cold
bun run benchmark-startup --warm

# Skip daemon or server benchmarks
bun run benchmark-startup --server-only
bun run benchmark-startup --daemon-only

# Stream benchmark stdio as it is read
bun run benchmark-startup --verbose

# Change regression threshold multiplier
bun run benchmark-startup --threshold 1.3
```

**Notes:**
- Device discovery scenarios run only when `adb` is available and at least one device is connected.
- The benchmark will run `adb kill-server` when measuring cold ADB startup impact.

## Other Scripts

### Build Scripts

- `build.ts` - Compile TypeScript to JavaScript for distribution
- `npm/transform-readme.js` - Transform README for npm package

### Tool Definition Scripts

- `update-tool-definitions.sh` - Regenerate and stage `schemas/tool-definitions.json` for IDE YAML completion

### Validation Scripts

See individual script directories for specialized validation:
- `docker/` - Docker container testing
- `ide-plugin/` - IntelliJ/Android Studio plugin validation
- `ktfmt/` - Kotlin formatting
- `lychee/` - Documentation link validation
- `shellcheck/` - Shell script linting and formatting
- `xml/` - XML validation and formatting

Run `scripts/<category>/validate_*.sh` for validation or `scripts/<category>/apply_*.sh` for auto-formatting.

## CI Integration

The following scripts are invoked by GitHub Actions workflows:

- `benchmark-context-thresholds.ts` - Runs in `.github/workflows/context-thresholds.yml`
- `benchmark-startup.sh` - Runs in `.github/workflows/pull_request.yml`
- `validate_*.sh` - Various validation workflows in `.github/workflows/pull_request.yml`

See workflow files for integration details.

## Development

All scripts should:
- Include usage instructions in header comments
- Return appropriate exit codes (0 for success, non-zero for failure)
- Provide clear error messages
- Be executable directly (have shebang and execute permissions)

### Adding New Scripts

1. Place script in appropriate subdirectory (or create new one)
2. Add shebang line (`#!/usr/bin/env bun` for TypeScript, `#!/usr/bin/env bash` for shell)
3. Include header documentation with usage examples
4. Make executable: `chmod +x scripts/your-script.ts`
5. Add npm script alias if appropriate (in `package.json`)
6. Document in this README
7. Update `.github/workflows/` if CI integration needed
