/**
 * Performance benchmark for TalkBack/accessibility detection
 * Tests caching behavior and validates the <50ms overhead acceptance criterion
 */

import { DefaultAccessibilityDetector } from "../src/utils/AccessibilityDetector";
import { FeatureFlagService } from "../src/features/featureFlags/FeatureFlagService";
import { FakeTimer } from "../test/fakes/FakeTimer";
import { SystemTimer } from "../src/utils/SystemTimer";
import type { Timer } from "../src/utils/SystemTimer";
import type { AdbExecutor } from "../src/utils/android-cmdline-tools/interfaces/AdbExecutor";
import type { ExecResult, BootedDevice, AndroidUser } from "../src/models";
import type { FeatureFlagKey } from "../src/features/featureFlags/FeatureFlagDefinitions";

/**
 * Minimal fake ADB executor for benchmarking
 * Simulates a real ADB call by introducing a configurable async delay
 */
class BenchmarkAdbExecutor implements AdbExecutor {
  private readonly delayMs: number;
  private readonly output: string;
  private readonly timer: Timer;
  private callCount = 0;

  constructor(
    delayMs: number = 30,
    output: string = "com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService",
    timer: Timer = new SystemTimer()
  ) {
    this.delayMs = delayMs;
    this.output = output;
    this.timer = timer;
  }

  async executeCommand(_command: string): Promise<ExecResult> {
    this.callCount++;
    if (this.delayMs > 0) {
      await this.timer.sleep(this.delayMs);
    }
    return {
      stdout: this.output,
      stderr: "",
      toString: () => this.output,
      trim: () => this.output.trim(),
      includes: (s: string) => this.output.includes(s),
    };
  }

  async getBootedAndroidDevices(): Promise<BootedDevice[]> {
    return [];
  }

  async isScreenOn(): Promise<boolean> {
    return true;
  }

  async getWakefulness(): Promise<"Awake" | "Asleep" | "Dozing" | null> {
    return "Awake";
  }

  async listUsers(): Promise<AndroidUser[]> {
    return [];
  }

  async getForegroundApp(): Promise<{ packageName: string; userId: number } | null> {
    return null;
  }

  async getDeviceTimestampMs(): Promise<number> {
    return Date.now();
  }

  async getAndroidApiLevel(): Promise<number | null> {
    return null;
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.callCount = 0;
  }
}

/**
 * Minimal fake feature flag service for benchmarking
 * Avoids touching SQLite or disk during benchmarks
 */
class BenchmarkFeatureFlagService {
  private readonly flags: Map<string, boolean> = new Map();

  setFlag(key: string, value: boolean): void {
    this.flags.set(key, value);
  }

  isEnabled(key: FeatureFlagKey): boolean {
    return this.flags.get(key) ?? false;
  }
}

interface BenchmarkResult {
  name: string;
  duration: number;
  adbCallCount: number;
  iterationCount: number;
  avgPerIteration: number;
}

/**
 * Run a single benchmark scenario and return timing results
 */
async function runScenario(
  name: string,
  fn: () => Promise<void>,
  adb: BenchmarkAdbExecutor,
  iterations: number = 1
): Promise<BenchmarkResult> {
  adb.reset();
  const startTime = performance.now();

  for (let i = 0; i < iterations; i++) {
    await fn();
  }

  const duration = performance.now() - startTime;
  const adbCallCount = adb.getCallCount();

  return {
    name,
    duration,
    adbCallCount,
    iterationCount: iterations,
    avgPerIteration: duration / iterations,
  };
}

/**
 * Print a table of benchmark results
 */
function printResults(results: BenchmarkResult[]): void {
  console.log("\n=== TalkBack Detection Performance Benchmark ===\n");

  console.log("Duration Results:");
  console.log("─".repeat(75));
  console.log(
    "Scenario".padEnd(40) +
    "Total".padStart(9) +
    "Avg/call".padStart(11) +
    "ADB calls".padStart(11) +
    "Iters".padStart(7)
  );
  console.log("─".repeat(75));

  for (const result of results) {
    console.log(
      result.name.padEnd(40) +
      `${result.duration.toFixed(1)} ms`.padStart(9) +
      `${result.avgPerIteration.toFixed(2)} ms`.padStart(11) +
      result.adbCallCount.toString().padStart(11) +
      result.iterationCount.toString().padStart(7)
    );
  }

  console.log("\n" + "=".repeat(75) + "\n");
}

/**
 * Print pass/fail for each acceptance criterion.
 * Returns true if all criteria pass, false if any fail.
 */
function printAcceptanceCriteria(results: BenchmarkResult[]): boolean {
  console.log("Acceptance Criteria:");
  console.log("─".repeat(60));

  const cold = results.find(r => r.name.startsWith("1."));
  const warm = results.find(r => r.name.startsWith("2."));
  const afterInvalidate = results.find(r => r.name.startsWith("3."));
  const featureFlag = results.find(r => r.name.startsWith("4."));

  let allPassed = true;

  // Cache miss: first detection must complete within the simulated ADB time + <50ms overhead
  if (cold) {
    // The simulated ADB call takes ~30ms. Total must be <50ms overhead on top of that.
    // We verify overhead separately by subtracting the simulated delay from the measured time.
    const simulatedAdbMs = 30;
    const overhead = cold.avgPerIteration - simulatedAdbMs;
    const pass = overhead < 50;
    if (!pass) {allPassed = false;}
    console.log(
      `  ${pass ? "PASS" : "FAIL"} Cache miss overhead <50ms:     ${overhead.toFixed(2)} ms (total: ${cold.avgPerIteration.toFixed(2)} ms)`
    );
  }

  // Cache hit: warm calls must be very fast
  if (warm) {
    const pass = warm.avgPerIteration < 5;
    if (!pass) {allPassed = false;}
    console.log(
      `  ${pass ? "PASS" : "FAIL"} Cache hit (warm) <5ms:         ${warm.avgPerIteration.toFixed(2)} ms`
    );
  }

  // Cache invalidation: re-detect after invalidate should behave like cold again
  if (afterInvalidate) {
    const simulatedAdbMs = 30;
    const overhead = afterInvalidate.avgPerIteration - simulatedAdbMs;
    const pass = overhead < 50;
    if (!pass) {allPassed = false;}
    console.log(
      `  ${pass ? "PASS" : "FAIL"} Post-invalidate overhead <50ms: ${overhead.toFixed(2)} ms (total: ${afterInvalidate.avgPerIteration.toFixed(2)} ms)`
    );
  }

  // Feature flag override: no ADB call, must be sub-millisecond
  if (featureFlag) {
    const pass = featureFlag.avgPerIteration < 1 && featureFlag.adbCallCount === 0;
    if (!pass) {allPassed = false;}
    console.log(
      `  ${pass ? "PASS" : "FAIL"} Feature flag override <1ms:    ${featureFlag.avgPerIteration.toFixed(3)} ms, ADB calls: ${featureFlag.adbCallCount}`
    );
  }

  console.log();
  return allPassed;
}

/**
 * Main benchmark execution
 */
async function main() {
  const deviceId = "emulator-5554";
  const simulatedAdbDelayMs = 30; // Realistic mid-range ADB latency (target: <50ms overhead)
  const warmIterations = 1000;

  console.log(`\nBenchmarking TalkBack detection (simulated ADB delay: ${simulatedAdbDelayMs}ms)...\n`);

  const results: BenchmarkResult[] = [];

  // Scenario 1: Cold detection (cache miss, ~30ms simulated ADB)
  console.log("Running: Cold detection (cache miss)...");
  {
    const adb = new BenchmarkAdbExecutor(simulatedAdbDelayMs);
    const fakeTimer = new FakeTimer();
    const detector = new DefaultAccessibilityDetector(fakeTimer);
    detector.clearAllCache();

    results.push(
      await runScenario(
        "1. Cold detection (cache miss)",
        async () => {
          detector.clearAllCache();
          await detector.isAccessibilityEnabled(deviceId, adb);
        },
        adb,
        1
      )
    );
  }

  // Scenario 2: Warm detection (cache hit, within 60s TTL)
  console.log("Running: Warm detection (cache hit, 1000 iterations)...");
  {
    const adb = new BenchmarkAdbExecutor(simulatedAdbDelayMs);
    const fakeTimer = new FakeTimer();
    const detector = new DefaultAccessibilityDetector(fakeTimer);
    detector.clearAllCache();

    // Seed the cache with one real call
    await detector.isAccessibilityEnabled(deviceId, adb);
    adb.reset();

    results.push(
      await runScenario(
        "2. Warm detection (cache hit)",
        async () => {
          await detector.isAccessibilityEnabled(deviceId, adb);
        },
        adb,
        warmIterations
      )
    );
  }

  // Scenario 3: Cache invalidation + re-detect
  console.log("Running: Cache invalidation + re-detect...");
  {
    const adb = new BenchmarkAdbExecutor(simulatedAdbDelayMs);
    const fakeTimer = new FakeTimer();
    const detector = new DefaultAccessibilityDetector(fakeTimer);
    detector.clearAllCache();

    // Seed the cache
    await detector.isAccessibilityEnabled(deviceId, adb);
    adb.reset();

    // Invalidate and re-detect once
    detector.invalidateCache(deviceId);
    results.push(
      await runScenario(
        "3. Cache invalidate + re-detect",
        async () => {
          await detector.isAccessibilityEnabled(deviceId, adb);
        },
        adb,
        1
      )
    );
  }

  // Scenario 4: Feature flag override (force-accessibility-mode = true)
  console.log("Running: Feature flag override (1000 iterations)...");
  {
    const adb = new BenchmarkAdbExecutor(simulatedAdbDelayMs);
    const fakeTimer = new FakeTimer();
    const detector = new DefaultAccessibilityDetector(fakeTimer);
    const featureFlags = new BenchmarkFeatureFlagService();
    featureFlags.setFlag("force-accessibility-mode", true);

    results.push(
      await runScenario(
        "4. Feature flag override (force-enabled)",
        async () => {
          await detector.isAccessibilityEnabled(
            deviceId,
            adb,
            featureFlags as unknown as FeatureFlagService
          );
        },
        adb,
        warmIterations
      )
    );
  }

  // Scenario 5: Cold detection with zero ADB delay (measures pure overhead)
  console.log("Running: Cold detection overhead only (zero ADB delay, 100 iterations)...");
  {
    const adb = new BenchmarkAdbExecutor(0);
    const fakeTimer = new FakeTimer();
    const detector = new DefaultAccessibilityDetector(fakeTimer);

    results.push(
      await runScenario(
        "5. Detection overhead (0ms ADB, cold)",
        async () => {
          detector.clearAllCache();
          await detector.isAccessibilityEnabled(deviceId, adb);
        },
        adb,
        100
      )
    );
  }

  // Scenario 6: detectMethod warm (via cache)
  console.log("Running: detectMethod warm (1000 iterations)...");
  {
    const adb = new BenchmarkAdbExecutor(simulatedAdbDelayMs);
    const fakeTimer = new FakeTimer();
    const detector = new DefaultAccessibilityDetector(fakeTimer);
    detector.clearAllCache();

    // Seed cache
    await detector.isAccessibilityEnabled(deviceId, adb);
    adb.reset();

    results.push(
      await runScenario(
        "6. detectMethod warm (cache hit)",
        async () => {
          await detector.detectMethod(deviceId, adb);
        },
        adb,
        warmIterations
      )
    );
  }

  // Print all results
  printResults(results);

  // Print acceptance criteria pass/fail and exit non-zero if any fail
  const allPassed = printAcceptanceCriteria(results);
  if (!allPassed) {
    console.error("ERROR: One or more acceptance criteria failed.");
    process.exit(1);
  }

  // Summary
  const cold = results[0];
  const warm = results[1];
  const speedup = cold.avgPerIteration / (warm.avgPerIteration || 0.001);
  console.log("Summary:");
  console.log("─".repeat(60));
  console.log(`  Cold detection (simulated ~${simulatedAdbDelayMs}ms ADB):  ${cold.avgPerIteration.toFixed(1)} ms`);
  console.log(`  Warm detection (cache hit):              ${warm.avgPerIteration.toFixed(3)} ms`);
  console.log(`  Cache speedup:                           ${speedup.toFixed(0)}x faster`);
  console.log();
}

// Run benchmark
main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
