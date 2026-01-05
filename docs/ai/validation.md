# Project Validation

This document provides instructions for AI agents to validate the Bun + TypeScript AutoMobile project
builds correctly and all tests pass. After writing some implementation you should select the most relevant checks given
the changes made. At no point should we be writing any JavaScript.

```bash
# Compile main source code
bun run build

# Run lint with automatic fixes - do this first before attempting to fix lint errors via editing
bun run lint

# Run all tests
bun run test

# Run specific tests
bun run test -- --grep "Name of the test suite or test case"

# Reinstall MCP server
bun install
```

## Implementation References

- Validation scripts and toolchain: https://github.com/kaeawc/auto-mobile/blob/main/package.json#L1-L40
