---
description: Run tests with optional filter
allowed-tools: Bash
argument-hint: [test name filter]
---

Run the test suite for AutoMobile.

If an argument is provided, run: `bun run test -- --grep "$ARGUMENTS"`
Otherwise run: `bun run test`

Summarize test results concisely.
