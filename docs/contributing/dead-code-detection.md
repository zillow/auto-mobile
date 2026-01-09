# Dead Code Detection

AutoMobile uses automated dead code detection to maintain a clean codebase by identifying unused TypeScript code, exports, and dependencies.

## Overview

Dead code accumulates naturally as projects evolve:
- Features get refactored or removed
- Dependencies become unused
- Internal APIs change
- Exports remain but lose all consumers

This technical debt increases maintenance burden, confuses developers, and bloats bundle sizes. Automated detection helps identify and remove this code systematically.

## Requirements

The detection script requires:
- `bash` - Shell interpreter
- `jq` - JSON processor for parsing tool output
- `npx` - For running ts-prune and knip

Install jq:
```bash
# macOS
brew install jq

# Linux (Ubuntu/Debian)
sudo apt-get install jq

# Linux (CentOS/RHEL)
sudo yum install jq
```

## Tools

We use two complementary tools for comprehensive coverage:

### ts-prune

Fast and focused on unused exports.

- Uses TypeScript compiler API
- Low false positive rate
- Simple output format
- Runs in ~10-20 seconds on this codebase

### knip

Comprehensive analysis of files, exports, and dependencies.

- Detects unused files, exports, and npm packages
- More thorough than ts-prune
- JSON output for automation
- Runs in ~15-45 seconds on this codebase

**Combined runtime: ~30-60 seconds** - fast enough for CI and local development.

## Running Locally

```bash
# Run complete dead code detection (both tools)
bun run dead-code:ts

# Run with JSON output
bun run dead-code:ts --json

# Run with threshold (exit with error if exceeded)
bun run dead-code:ts --threshold=10

# Run with output directory (saves JSON and markdown reports)
bun run dead-code:ts --output-dir=reports

# Run individual tools
bun run dead-code:ts:prune   # ts-prune only
bun run dead-code:ts:knip    # knip only
```

## Understanding Results

### Report Structure

The detection script generates two reports:

1. **JSON report** (`dead-code-report.json`)
   - Machine-readable format
   - Full details of all issues
   - Suitable for automated processing

2. **Markdown report** (`dead-code-report.md`)
   - Human-readable format
   - Organized by category
   - Easy to review and share

### Issue Types

#### Unused Exports
```typescript
// src/utils/helper.ts
export function unusedHelper() {  // ← Detected as unused
  return "never called";
}
```

**Action:** Remove the export or the entire function if it's not part of the public API.

#### Unused Files
```
src/legacy/old-implementation.ts  // ← Entire file is unused
```

**Action:** Delete the file if it's genuinely unused.

#### Unused Dependencies
```json
{
  "dependencies": {
    "some-package": "^1.0.0"  // ← Package not imported anywhere
  }
}
```

**Action:** Remove from package.json with `bun remove some-package`.

### False Positives

Some exports are intentionally unused in the codebase:

1. **Public API exports** - Library entry points
2. **CLI entry points** - Script executables
3. **Test utilities** - Shared test helpers
4. **Type exports** - Types used by consumers
5. **MCP protocol implementations** - Tools and resources exposed via MCP

#### Handling False Positives

Configure knip to ignore legitimate exports:

```json
{
  "ignore": [
    "src/index.ts",           // Main entry point
    "src/types/public.ts"     // Public type exports
  ],
  "ignoreDependencies": [
    "some-peer-dependency"
  ]
}
```

## CI Integration

### Weekly Automated Detection

A GitHub Actions workflow runs weekly (Mondays at 00:00 UTC):

1. Runs dead code detection with threshold of 10 issues
2. Uploads JSON and markdown reports as artifacts
3. Creates or updates a GitHub issue if threshold exceeded
4. Closes the issue automatically when fixed

### Manual Trigger

You can manually trigger the workflow from GitHub Actions UI:

1. Go to Actions → Dead Code Detection
2. Click "Run workflow"
3. Optionally set a custom threshold (default: 10)

### Workflow Outputs

- **Artifacts:** JSON and markdown reports retained for 90 days
- **GitHub Issue:** Automatically created/updated when threshold exceeded
- **Status:** Workflow fails if threshold exceeded

## Configuration

### knip.json

The primary configuration file:

```json
{
  "$schema": "https://unpkg.com/knip@latest/schema.json",
  "entry": [
    "src/index.ts",              // Main entry point
    "src/**/*.test.ts",          // Test files
    "scripts/**/*.ts",           // Scripts
    "build.ts"                   // Build script
  ],
  "project": [
    "src/**/*.ts",
    "scripts/**/*.ts",
    "build.ts"
  ],
  "ignore": [
    "dist/**",                   // Build output
    "node_modules/**",
    "android/**",                // Android-specific code
    "**/*.d.ts"                  // Type declarations
  ],
  "ignoreDependencies": [],
  "ignoreBinaries": [],
  "ignoreExportsUsedInFile": true,  // Ignore exports used within same file
  "includeEntryExports": false,     // Don't report entry point exports as unused
  "typescript": {
    "config": "tsconfig.json"
  }
}
```

### Adjusting Configuration

#### Add Entry Points

If you add a new entry point (CLI script, test suite, etc.):

```json
{
  "entry": [
    "src/index.ts",
    "scripts/my-new-script.ts"  // ← Add here
  ]
}
```

#### Ignore Specific Files

To exclude files from analysis:

```json
{
  "ignore": [
    "src/experimental/**",       // Experimental features
    "src/legacy/**"             // Legacy code being phased out
  ]
}
```

#### Ignore Dependencies

For dependencies that are used indirectly (peer dependencies, CLI tools):

```json
{
  "ignoreDependencies": [
    "@types/node",              // Type definitions
    "some-cli-tool"             // Used via npx
  ]
}
```

## Workflow

### Regular Maintenance

1. **Weekly:** Review automated GitHub issue if created
2. **Before releases:** Run `bun run dead-code:ts` locally
3. **During refactoring:** Check for newly unused code
4. **After dependency updates:** Verify no dependencies became unused

### Addressing Issues

1. **Triage:**
   ```bash
   bun run dead-code:ts --output-dir=reports
   # Review reports/dead-code-report.md
   ```

2. **Classify:**
   - False positives → Update knip.json
   - Genuinely unused → Remove
   - Uncertain → Investigate usage

3. **Fix:**
   ```bash
   # Remove unused exports
   # Delete unused files
   # Remove unused dependencies
   bun remove unused-package
   ```

4. **Verify:**
   ```bash
   bun run dead-code:ts
   # Should show reduced count
   ```

5. **Test:**
   ```bash
   bun run build
   bun run test
   # Ensure nothing breaks
   ```

## Best Practices

### Do's

✅ **Run before committing large refactors**
   ```bash
   bun run dead-code:ts
   ```

✅ **Update knip.json when adding public APIs**
   ```json
   { "ignore": ["src/new-public-api.ts"] }
   ```

✅ **Remove dead code incrementally**
   - Small, focused PRs
   - One category at a time
   - Test thoroughly

✅ **Document intentional "unused" exports**
   ```typescript
   // Public API - exported for library consumers
   export function publicHelper() { ... }
   ```

### Don'ts

❌ **Don't ignore the weekly issues**
   - Dead code accumulates quickly
   - Small regular cleanups beat large overhauls

❌ **Don't remove exports without understanding why they're unused**
   - Check git history
   - Search for external usage
   - Verify it's not a public API

❌ **Don't disable detection entirely**
   - Use `ignore` patterns selectively
   - Keep false positives minimal

❌ **Don't commit commented-out code**
   - Git preserves history
   - Commented code looks like dead code

## Troubleshooting

### High False Positive Rate

If you see many false positives:

1. **Check entry points:**
   ```json
   { "entry": ["src/missing-entry-point.ts"] }
   ```

2. **Review ignore patterns:**
   ```json
   { "ignore": ["src/public-api/**"] }
   ```

3. **Verify TypeScript config:**
   ```json
   { "typescript": { "config": "tsconfig.json" } }
   ```

### Tool Performance Issues

If detection is slow:

1. **Check file count:**
   ```bash
   find src -name "*.ts" | wc -l
   ```

2. **Verify ignore patterns work:**
   ```bash
   npx knip --debug
   ```

3. **Consider excluding large directories:**
   ```json
   { "ignore": ["src/generated/**"] }
   ```

### Inconsistent Results

If results vary between runs:

1. **Clear node_modules:**
   ```bash
   rm -rf node_modules
   bun install
   ```

2. **Rebuild TypeScript:**
   ```bash
   bun run clean
   bun run build
   ```

3. **Check for TypeScript errors:**
   ```bash
   tsc --noEmit
   ```

## Examples

### Example 1: Removing Unused Export

**Before:**
```typescript
// src/utils/format.ts
export function formatDate(date: Date): string { ... }  // Used
export function formatTime(date: Date): string { ... }  // Unused ❌
```

**Detection:**
```
src/utils/format.ts:2 - formatTime (unused export)
```

**After:**
```typescript
// src/utils/format.ts
export function formatDate(date: Date): string { ... }  // Used
// formatTime removed - no longer needed
```

### Example 2: Configuring Public API

**Scenario:** `src/api/public.ts` exports functions for library consumers, but they're not used internally.

**Solution:**
```json
{
  "ignore": ["src/api/public.ts"]
}
```

### Example 3: Removing Unused Dependency

**Detection:**
```
package.json - lodash (unused dependency)
```

**Action:**
```bash
bun remove lodash
```

**Verify:**
```bash
bun run build
bun run test
```

## Performance Benchmarks

Based on AutoMobile's codebase (~65k LOC, 344 files):

| Tool | Runtime | Issues Found | Type |
|------|---------|--------------|------|
| ts-prune | ~15s | Varies | Unused exports |
| knip | ~30s | Varies | Comprehensive |
| **Total** | **~45s** | - | Combined |

## References

- [ts-prune GitHub](https://github.com/nadeesha/ts-prune)
- [knip GitHub](https://github.com/webpro/knip)
- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)

## Related

- [Local Development Guide](local-development.md)
- [Contributing Overview](overview.md)
- Build validation: `docs/ai/validation.md`
