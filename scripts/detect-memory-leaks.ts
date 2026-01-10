import fs from "node:fs";
import path from "node:path";
import {
  createStressHarness,
  parseStressArgs,
  resolveStressConfig,
  runStressOperations
} from "./memory/stress-harness";

interface MemoryLeakArgs {
  heapGrowthLimitMb: number;
  outputPath?: string;
  snapshotDir: string;
  mode: "strict" | "profile";
  failOnLeak: boolean;
}

const DEFAULT_HEAP_GROWTH_LIMIT_MB = 50;

function parseMemoryLeakArgs(argv: string[]): MemoryLeakArgs {
  const args: MemoryLeakArgs = {
    heapGrowthLimitMb: DEFAULT_HEAP_GROWTH_LIMIT_MB,
    snapshotDir: process.cwd(),
    mode: "strict",
    failOnLeak: true
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--heap-growth-limit-mb") {
      args.heapGrowthLimitMb = Number.parseFloat(next);
      i++;
      continue;
    }

    if (arg === "--output") {
      args.outputPath = next;
      i++;
      continue;
    }

    if (arg === "--snapshot-dir") {
      args.snapshotDir = next;
      i++;
      continue;
    }

    if (arg === "--mode") {
      args.mode = next === "profile" ? "profile" : "strict";
      i++;
      continue;
    }

    if (arg === "--no-fail") {
      args.failOnLeak = false;
      continue;
    }
  }

  if (args.mode === "profile") {
    args.failOnLeak = false;
  }

  return args;
}

async function writeHeapSnapshot(
  heapdumpModule: { writeSnapshot?: (path: string, cb: (err: Error | null, filename?: string) => void) => void } | null,
  snapshotDir: string,
  label: string
): Promise<string | null> {
  if (!heapdumpModule?.writeSnapshot) {
    console.error("[memory-leaks] heapdump is unavailable; skipping heap snapshot.");
    return null;
  }
  const safeLabel = label.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40);
  const filePath = path.join(snapshotDir, `heap-${safeLabel}-${Date.now()}.heapsnapshot`);
  await fs.promises.mkdir(snapshotDir, { recursive: true });

  return new Promise(resolve => {
    heapdumpModule.writeSnapshot!(filePath, (error, filename) => {
      if (error) {
        console.error(`[memory-leaks] Failed to write heap snapshot: ${error}`);
        resolve(null);
        return;
      }
      console.error(`[memory-leaks] Heap snapshot saved: ${filename}`);
      resolve(filename);
    });
  });
}

async function main(): Promise<void> {
  if (process.versions?.bun) {
    console.error("[memory-leaks] This script requires Node.js. Use `bun run test:memory-leaks`.");
    process.exit(1);
  }

  const memwatchModule = await import("memwatch-next").catch(error => {
    console.warn(`[memory-leaks] memwatch-next unavailable: ${error}`);
    return null;
  });
  const heapdumpModule = await import("heapdump").catch(error => {
    console.warn(`[memory-leaks] heapdump unavailable: ${error}`);
    return null;
  });
  const memwatch = memwatchModule
    ? ((memwatchModule as { default?: typeof memwatchModule }).default ?? memwatchModule)
    : null;
  const heapdump = heapdumpModule
    ? ((heapdumpModule as { default?: typeof heapdumpModule }).default ?? heapdumpModule)
    : null;

  const argv = process.argv.slice(2);
  const stressArgs = parseStressArgs(argv);
  const { runConfig, warmupIterations } = resolveStressConfig(stressArgs);
  const leakArgs = parseMemoryLeakArgs(argv);
  const heapGrowthLimitBytes = leakArgs.heapGrowthLimitMb * 1024 * 1024;

  const harness = await createStressHarness();
  let leakDetected = false;
  const leakEvents: unknown[] = [];
  let snapshotPromise: Promise<string | null> | null = null;

  if (memwatch && typeof (memwatch as { on?: unknown }).on === "function") {
    (memwatch as { on: (event: string, handler: (info: unknown) => void) => void }).on("leak", info => {
      leakDetected = true;
      leakEvents.push(info);
      if (!snapshotPromise) {
        snapshotPromise = writeHeapSnapshot(heapdump, leakArgs.snapshotDir, "memwatch-leak");
      }
      console.error("[memory-leaks] Memory leak detected:", info);
    });
  }

  try {
    if (warmupIterations > 0) {
      await runStressOperations(harness, {
        ...runConfig,
        iterations: warmupIterations,
        gcEvery: 0
      });
    }

    if (typeof global.gc === "function") {
      global.gc();
    }

    const heapDiff = memwatch && (memwatch as { HeapDiff?: new () => { end: () => any } }).HeapDiff
      ? new (memwatch as { HeapDiff: new () => { end: () => any } }).HeapDiff()
      : null;
    const startUsage = process.memoryUsage();
    const runResult = await runStressOperations(harness, runConfig);

    if (typeof global.gc === "function") {
      global.gc();
    }

    const endUsage = process.memoryUsage();
    const diff = heapDiff?.end ? heapDiff.end() : null;
    const heapGrowth = endUsage.heapUsed - startUsage.heapUsed;
    const diffGrowth = diff?.change?.size_bytes ?? 0;
    const effectiveGrowth = Math.max(heapGrowth, diffGrowth);

    const passed = !leakDetected && effectiveGrowth <= heapGrowthLimitBytes;

    const report = {
      timestamp: new Date().toISOString(),
      passed,
      config: {
        iterations: runConfig.iterations,
        opsPerSecond: runConfig.opsPerSecond,
        operations: runConfig.operations,
        heapGrowthLimitMb: leakArgs.heapGrowthLimitMb,
        warmupIterations,
        gcEvery: runConfig.gcEvery
      },
      results: {
        durationMs: runResult.durationMs,
        operationCounts: runResult.operationCounts,
        heapUsedStart: startUsage.heapUsed,
        heapUsedEnd: endUsage.heapUsed,
        heapGrowthBytes: heapGrowth,
        heapDiffBytes: diffGrowth,
        effectiveGrowthBytes: effectiveGrowth
      },
      memwatch: {
        leakDetected,
        leakEventCount: leakEvents.length
      }
    };

    if (leakArgs.outputPath) {
      await fs.promises.mkdir(path.dirname(leakArgs.outputPath), { recursive: true });
      await fs.promises.writeFile(leakArgs.outputPath, JSON.stringify(report, null, 2));
    }

    console.log("[memory-leaks] Stress run complete.");
    console.log(`[memory-leaks] Heap growth: ${(effectiveGrowth / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`[memory-leaks] Leak events: ${leakEvents.length}`);

    if (!passed && leakArgs.failOnLeak) {
      if (!snapshotPromise) {
        snapshotPromise = writeHeapSnapshot(heapdump, leakArgs.snapshotDir, "threshold");
      }
      await snapshotPromise;
      console.error("[memory-leaks] Memory leak detection failed.");
      process.exitCode = 1;
    } else {
      console.log("[memory-leaks] Memory leak detection passed.");
    }
  } catch (error) {
    console.error(`[memory-leaks] Unexpected error: ${error}`);
    if (!snapshotPromise) {
      snapshotPromise = writeHeapSnapshot(heapdump, leakArgs.snapshotDir, "error");
    }
    await snapshotPromise;
    process.exitCode = 1;
  } finally {
    await harness.cleanup();
  }
}

void main();
