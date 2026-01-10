# Memory Profiling

## Overview
The MCP server runs as a long-lived process, so we track heap growth and create heap snapshots when leaks are suspected.
This guide covers the memory leak detection script, stress harness, and manual profiling workflows.

## Leak Detection (CI + Local)
Run the detection script with Node (Bun is used to invoke the script, but Node executes it):

```bash
bun run test:memory-leaks
```

Useful options:

```bash
# Increase iterations or throttle ops/second
bun run test:memory-leaks -- --iterations 2000 --ops-per-second 5

# Run for a duration (iterations derived from ops/second)
bun run test:memory-leaks -- --duration 10m --ops-per-second 10

# Save a JSON report for baselining
bun run test:memory-leaks -- --output scratch/memory-leak-report.json
```

On failure, a `*.heapsnapshot` file is written in the repo root (or `--snapshot-dir` if provided).

## Manual Profiling
Attach Chrome DevTools to inspect heap snapshots in-flight:

```bash
bun run profile:memory
```

Then open Chrome DevTools → Memory tab, take heap snapshots, and compare allocations during the run.

To generate a Node heap profile (for post-run analysis):

```bash
bun run profile:heap
```

## Baseline Expectations
Baseline numbers will vary by machine and OS, but use these guardrails:

- `effectiveGrowthBytes` should stay below **50MB** over 1000 operations (CI enforced).
- `heapUsed` typically stabilizes after the warm-up phase; record values from the JSON report when updating baselines.

If the baseline shifts after a major change (e.g., new cache strategy), regenerate a report and update this document and `baseline/memory-leak-baseline.json`.

## Troubleshooting Native Addons
`memwatch-next` and `heapdump` are native addons. If they fail to load, trust and rebuild them:

```bash
bun pm trust memwatch-next heapdump
bun install
```
