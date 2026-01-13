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
   - Currently set with manual headroom for resource/template growth
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
    "generatedAt": "2026-01-13",
    "description": "MCP context usage thresholds with manual headroom for resource/template growth",
    "baseline": {
      "tools": 10382,
      "resources": 431,
      "resourceTemplates": 1412,
      "total": 12225
    },
    "buffer": "custom"
  },
  "thresholds": {
    "tools": 14000,
    "resources": 1000,
    "resourceTemplates": 2000,
    "total": 17000
  }
}
```

### Current Baselines (as of 2026-01-13)

| Category | Baseline | Threshold (current) | Usage |
|----------|----------|------------------------|-------|
| Tools | 10,382 tokens | 14,000 tokens | 74% |
| Resources | 431 tokens | 1,000 tokens | 43% |
| Resource Templates | 1,412 tokens | 2,000 tokens | 71% |
| **Total** | **12,225 tokens** | **17,000 tokens** | **72%** |

## Benchmark Report Format

### Terminal Output

```
================================================================================
MCP CONTEXT THRESHOLD BENCHMARK REPORT
================================================================================

Category                     Actual / Threshold       Usage  Status
--------------------------------------------------------------------------------
  Tools                        10382 / 14000    ( 74%)  ✓ PASS
  Resources                      431 / 1000     ( 43%)  ✓ PASS
  Resource Templates            1412 / 2000     ( 71%)  ✓ PASS
--------------------------------------------------------------------------------
  TOTAL                        12225 / 17000    ( 72%)  ✓ PASS
================================================================================

Overall Status: ✓ PASSED
```

### JSON Report

```json
{
  "timestamp": "2026-01-13T02:54:55.664Z",
  "passed": true,
  "results": {
    "tools": {
      "actual": 10382,
      "threshold": 14000,
      "passed": true,
      "usage": 74
    },
    "resources": {
      "actual": 431,
      "threshold": 1000,
      "passed": true,
      "usage": 43
    },
    "resourceTemplates": {
      "actual": 1412,
      "threshold": 2000,
      "passed": true,
      "usage": 71
    },
    "total": {
      "actual": 12225,
      "threshold": 17000,
      "passed": true,
      "usage": 72
    }
  },
  "thresholds": {
    "tools": 14000,
    "resources": 1000,
    "resourceTemplates": 2000,
    "total": 17000
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
| Tools | 10,382 | 14,000 | 74% | ✅ |
| Resources | 431 | 1,000 | 43% | ✅ |
| Resource Templates | 1,412 | 2,000 | 71% | ✅ |
| **Total** | **12,225** | **17,000** | **72%** | ✅ |

**Overall Status:** ✅ PASSED

_Generated at 2026-01-13T02:54:55.664Z_
```

## Updating Thresholds

When legitimate changes require increasing thresholds:

1. Run estimation to understand new baseline:
   ```bash
   bun run estimate-context
   ```

2. Update `scripts/context-thresholds.json` with new thresholds
   - Set headroom based on expected growth
   - Update metadata section with rationale

3. Commit changes and include justification in PR description

4. Ensure CI passes with new thresholds

## Rationale

### Why Manual Headroom?

Manual headroom allows for:
- Larger shifts between tools, resources, and templates
- Planned growth without constant threshold churn
- Guardrails against unexpected regressions

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
