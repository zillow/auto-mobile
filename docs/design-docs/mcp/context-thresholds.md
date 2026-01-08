# MCP Context Thresholds

## Overview

The MCP context threshold system enforces limits on the token count of tool definitions, resources, and resource templates to prevent context bloat and ensure the MCP server remains efficient.

## Architecture

### Components

1. **Context Estimation** (`scripts/estimate-context-usage.ts`)
   - Estimates token usage for all registered tools and resources
   - Uses `js-tiktoken` with `cl100k_base` encoding (Claude model tokenizer)
   - Provides detailed per-item breakdown
   - Available via `bun run estimate-context`

2. **Threshold Benchmark** (`scripts/benchmark-context-thresholds.ts`)
   - Reuses estimation logic from context estimator
   - Compares actual usage against configured thresholds
   - Outputs both human-readable terminal output and JSON reports
   - Available via `bun run benchmark-context`

3. **Threshold Configuration** (`scripts/context-thresholds.json`)
   - JSON configuration file defining threshold limits
   - Versioned and checked into source control
   - Currently set at baseline + 10% buffer
   - Categories: tools, resources, resourceTemplates, total

4. **CI Enforcement** (`.github/workflows/context-thresholds.yml`)
   - Runs on pull requests and main branch pushes
   - Generates artifact reports retained for 90 days
   - Posts results as PR comments
   - Fails CI when thresholds are exceeded

## Usage

### Local Development

```bash
# Check current context usage (estimation only)
bun run estimate-context

# Run threshold benchmark (pass/fail check)
bun run benchmark-context

# Output benchmark report to file
bun run benchmark-context --output reports/context-benchmark.json

# Use custom threshold configuration
bun run benchmark-context --config custom-thresholds.json
```

### Threshold Configuration

The configuration file (`scripts/context-thresholds.json`) has the following structure:

```json
{
  "version": "1.0.0",
  "metadata": {
    "generatedAt": "2026-01-08",
    "description": "MCP context usage thresholds based on baseline measurement with 10% buffer",
    "baseline": {
      "tools": 13125,
      "resources": 322,
      "resourceTemplates": 468,
      "total": 13915
    },
    "buffer": "10%"
  },
  "thresholds": {
    "tools": 14438,
    "resources": 354,
    "resourceTemplates": 515,
    "total": 15307
  }
}
```

### Current Baselines (as of 2026-01-08)

| Category | Baseline | Threshold (10% buffer) | Usage |
|----------|----------|------------------------|-------|
| Tools | 13,125 tokens | 14,438 tokens | 91% |
| Resources | 322 tokens | 354 tokens | 91% |
| Resource Templates | 468 tokens | 515 tokens | 91% |
| **Total** | **13,915 tokens** | **15,307 tokens** | **91%** |

## Benchmark Report Format

### Terminal Output

```
================================================================================
MCP CONTEXT THRESHOLD BENCHMARK REPORT
================================================================================

Category                     Actual / Threshold       Usage  Status
--------------------------------------------------------------------------------
  Tools                        13125 / 14438    ( 91%)  ✓ PASS
  Resources                      322 / 354      ( 91%)  ✓ PASS
  Resource Templates             468 / 515      ( 91%)  ✓ PASS
--------------------------------------------------------------------------------
  TOTAL                        13915 / 15307    ( 91%)  ✓ PASS
================================================================================

Overall Status: ✓ PASSED
```

### JSON Report

```json
{
  "timestamp": "2026-01-08T13:24:58.771Z",
  "passed": true,
  "results": {
    "tools": {
      "actual": 13125,
      "threshold": 14438,
      "passed": true,
      "usage": 91
    },
    "resources": {
      "actual": 322,
      "threshold": 354,
      "passed": true,
      "usage": 91
    },
    "resourceTemplates": {
      "actual": 468,
      "threshold": 515,
      "passed": true,
      "usage": 91
    },
    "total": {
      "actual": 13915,
      "threshold": 15307,
      "passed": true,
      "usage": 91
    }
  },
  "thresholds": {
    "tools": 14438,
    "resources": 354,
    "resourceTemplates": 515,
    "total": 15307
  },
  "violations": []
}
```

## CI Integration

The GitHub Actions workflow runs automatically on:
- All pull requests
- Pushes to main branch

### Workflow Behavior

1. Runs benchmark with JSON output
2. Uploads report as artifact (90-day retention)
3. Posts results as PR comment (creates or updates existing comment)
4. Fails workflow if thresholds exceeded

### PR Comment Format

```markdown
## MCP Context Threshold Benchmark

| Category | Actual | Threshold | Usage | Status |
|----------|--------|-----------|-------|--------|
| Tools | 13,125 | 14,438 | 91% | ✅ |
| Resources | 322 | 354 | 91% | ✅ |
| Resource Templates | 468 | 515 | 91% | ✅ |
| **Total** | **13,915** | **15,307** | **91%** | ✅ |

**Overall Status:** ✅ PASSED

_Generated at 2026-01-08T13:24:58.771Z_
```

## Updating Thresholds

When legitimate changes require increasing thresholds:

1. Run estimation to understand new baseline:
   ```bash
   bun run estimate-context
   ```

2. Update `scripts/context-thresholds.json` with new thresholds
   - Consider appropriate buffer (typically 10-20%)
   - Update metadata section with rationale

3. Commit changes and include justification in PR description

4. Ensure CI passes with new thresholds

## Rationale

### Why 10% Buffer?

The 10% buffer allows for:
- Small incremental improvements to existing tools
- Minor documentation updates
- Flexibility for refactoring without threshold violations
- Catches significant regressions while allowing natural growth

### Category Tracking

Separate thresholds for tools, resources, and templates enable:
- Identifying which category is growing fastest
- Making informed decisions about optimization targets
- Understanding context distribution across MCP components

## Performance Impact

Token estimation is fast and suitable for CI:
- Full estimation: ~1-2 seconds
- Memory usage: minimal (< 100MB)
- No external dependencies beyond js-tiktoken

## Future Enhancements

Potential improvements to consider:

1. **Per-Item Thresholds**: Limit individual tool/resource token counts
2. **Historical Tracking**: Trend analysis over time via artifact reports
3. **Automatic Threshold Suggestions**: Calculate optimal thresholds from baseline
4. **Cost Estimation**: Convert token counts to API cost estimates
5. **Optimization Recommendations**: Identify tools that could be simplified
6. **Integration with Performance Budgets**: Link to broader performance goals

## Related Documentation

- [MCP Resources](resources.md) - Resource system design
- [System Design](system-design.md) - Overall MCP architecture
- [Validation Guide](../../ai/validation.md) - Development validation workflows
