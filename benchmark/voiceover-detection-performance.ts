/**
 * Performance benchmark for iOS VoiceOver detection
 * Tests caching behavior and validates the <50ms overhead acceptance criterion
 *
 * Detection flow:
 *   1. Feature flag override (force-accessibility-mode) → skips CtrlProxy call
 *   2. Feature flag disabled (accessibility-auto-detect = false) → returns false
 *   3. Cache hit (within 60s TTL) → returns cached result
 *   4. Cache miss → calls CtrlProxy WebSocket, caches result
 */

import { DefaultIosVoiceOverDetector } from "../src/utils/IosVoiceOverDetector";
import { FeatureFlagService } from "../src/features/featureFlags/FeatureFlagService";
import { FakeTimer } from "../test/fakes/FakeTimer";
import { SystemTimer } from "../src/utils/SystemTimer";
import type { Timer } from "../src/utils/SystemTimer";
import type { CtrlProxyService } from "../src/features/observe/ios/CtrlProxyClient";
import type { FeatureFlagKey } from "../src/features/featureFlags/FeatureFlagDefinitions";

/**
 * Minimal fake CtrlProxy service for benchmarking.
 * Simulates a real WebSocket round-trip by introducing a configurable async delay.
 * Only implements requestVoiceOverState — the only method used by IosVoiceOverDetector.
 */
class BenchmarkCtrlProxyService {
  private readonly delayMs: number;
  private readonly voiceOverEnabled: boolean;
  private readonly timer: Timer;
  private callCount = 0;

  constructor(
    delayMs: number = 30,
    voiceOverEnabled: boolean = true,
    timer: Timer = new SystemTimer()
  ) {
    this.delayMs = delayMs;
    this.voiceOverEnabled = voiceOverEnabled;
    this.timer = timer;
  }

  async requestVoiceOverState(): Promise<{ success: boolean; enabled: boolean; error?: string }> {
    this.callCount++;
    if (this.delayMs > 0) {
      await this.timer.sleep(this.delayMs);
    }
    return { success: true, enabled: this.voiceOverEnabled };
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.callCount = 0;
  }
}

/**
 * Minimal fake feature flag service for benchmarking.
 * Avoids touching SQLite or disk during benchmarks.
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
  ctrlProxyCallCount: number;
  iterationCount: number;
  avgPerIteration: number;
}

/**
 * Run a single benchmark scenario and return timing results
 */
async function runScenario(
  name: string,
  fn: () => Promise<void>,
  client: BenchmarkCtrlProxyService,
  iterations: number = 1
): Promise<BenchmarkResult> {
  client.reset();
  const startTime = performance.now();

  for (let i = 0; i < iterations; i++) {
    await fn();
  }

  const duration = performance.now() - startTime;
  const ctrlProxyCallCount = client.getCallCount();

  return {
    name,
    duration,
    ctrlProxyCallCount,
    iterationCount: iterations,
    avgPerIteration: duration / iterations,
  };
}

/**
 * Print a table of benchmark results
 */
function printResults(results: BenchmarkResult[]): void {
  console.log("\n=== VoiceOver Detection Performance Benchmark ===\n");

  console.log("Duration Results:");
  console.log("─".repeat(80));
  console.log(
    "Scenario".padEnd(42) +
    "Total".padStart(9) +
    "Avg/call".padStart(11) +
    "CtrlProxy".padStart(12) +
    "Iters".padStart(7)
  );
  console.log("─".repeat(80));

  for (const result of results) {
    console.log(
      result.name.padEnd(42) +
      `${result.duration.toFixed(1)} ms`.padStart(9) +
      `${result.avgPerIteration.toFixed(2)} ms`.padStart(11) +
      result.ctrlProxyCallCount.toString().padStart(12) +
      result.iterationCount.toString().padStart(7)
    );
  }

  console.log("\n" + "=".repeat(80) + "\n");
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

  // Cache miss: first detection must complete within simulated CtrlProxy time + <50ms overhead
  if (cold) {
    const simulatedCtrlProxyMs = 30;
    const overhead = cold.avgPerIteration - simulatedCtrlProxyMs;
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
    const simulatedCtrlProxyMs = 30;
    const overhead = afterInvalidate.avgPerIteration - simulatedCtrlProxyMs;
    const pass = overhead < 50;
    if (!pass) {allPassed = false;}
    console.log(
      `  ${pass ? "PASS" : "FAIL"} Post-invalidate overhead <50ms: ${overhead.toFixed(2)} ms (total: ${afterInvalidate.avgPerIteration.toFixed(2)} ms)`
    );
  }

  // Feature flag override: no CtrlProxy call, must be sub-millisecond
  if (featureFlag) {
    const pass = featureFlag.avgPerIteration < 1 && featureFlag.ctrlProxyCallCount === 0;
    if (!pass) {allPassed = false;}
    console.log(
      `  ${pass ? "PASS" : "FAIL"} Feature flag override <1ms:    ${featureFlag.avgPerIteration.toFixed(3)} ms, CtrlProxy calls: ${featureFlag.ctrlProxyCallCount}`
    );
  }

  console.log();
  return allPassed;
}

/**
 * Main benchmark execution
 */
async function main() {
  const deviceId = "00008120-00123456789A";
  const simulatedCtrlProxyDelayMs = 30; // Realistic mid-range WebSocket round-trip latency
  const warmIterations = 1000;

  console.log(`\nBenchmarking VoiceOver detection (simulated CtrlProxy delay: ${simulatedCtrlProxyDelayMs}ms)...\n`);

  const results: BenchmarkResult[] = [];

  // Scenario 1: Cold detection (cache miss, ~30ms simulated WebSocket RTT)
  console.log("Running: Cold detection (cache miss)...");
  {
    const client = new BenchmarkCtrlProxyService(simulatedCtrlProxyDelayMs);
    const fakeTimer = new FakeTimer();
    const detector = new DefaultIosVoiceOverDetector(fakeTimer);
    detector.clearAllCache();

    results.push(
      await runScenario(
        "1. Cold detection (cache miss)",
        async () => {
          detector.clearAllCache();
          await detector.isVoiceOverEnabled(deviceId, client as unknown as CtrlProxyService);
        },
        client,
        1
      )
    );
  }

  // Scenario 2: Warm detection (cache hit, within 60s TTL)
  console.log("Running: Warm detection (cache hit, 1000 iterations)...");
  {
    const client = new BenchmarkCtrlProxyService(simulatedCtrlProxyDelayMs);
    const fakeTimer = new FakeTimer();
    const detector = new DefaultIosVoiceOverDetector(fakeTimer);
    detector.clearAllCache();

    // Seed the cache with one real call
    await detector.isVoiceOverEnabled(deviceId, client as unknown as CtrlProxyService);
    client.reset();

    results.push(
      await runScenario(
        "2. Warm detection (cache hit)",
        async () => {
          await detector.isVoiceOverEnabled(deviceId, client as unknown as CtrlProxyService);
        },
        client,
        warmIterations
      )
    );
  }

  // Scenario 3: Cache invalidation + re-detect
  console.log("Running: Cache invalidation + re-detect...");
  {
    const client = new BenchmarkCtrlProxyService(simulatedCtrlProxyDelayMs);
    const fakeTimer = new FakeTimer();
    const detector = new DefaultIosVoiceOverDetector(fakeTimer);
    detector.clearAllCache();

    // Seed the cache
    await detector.isVoiceOverEnabled(deviceId, client as unknown as CtrlProxyService);
    client.reset();

    // Invalidate and re-detect once
    detector.invalidateCache(deviceId);
    results.push(
      await runScenario(
        "3. Cache invalidate + re-detect",
        async () => {
          await detector.isVoiceOverEnabled(deviceId, client as unknown as CtrlProxyService);
        },
        client,
        1
      )
    );
  }

  // Scenario 4: Feature flag override (force-accessibility-mode = true)
  console.log("Running: Feature flag override (1000 iterations)...");
  {
    const client = new BenchmarkCtrlProxyService(simulatedCtrlProxyDelayMs);
    const fakeTimer = new FakeTimer();
    const detector = new DefaultIosVoiceOverDetector(fakeTimer);
    const featureFlags = new BenchmarkFeatureFlagService();
    featureFlags.setFlag("force-accessibility-mode", true);

    results.push(
      await runScenario(
        "4. Feature flag override (force-enabled)",
        async () => {
          await detector.isVoiceOverEnabled(
            deviceId,
            client as unknown as CtrlProxyService,
            featureFlags as unknown as FeatureFlagService
          );
        },
        client,
        warmIterations
      )
    );
  }

  // Scenario 5: Cold detection with zero CtrlProxy delay (measures pure overhead)
  console.log("Running: Cold detection overhead only (zero CtrlProxy delay, 100 iterations)...");
  {
    const client = new BenchmarkCtrlProxyService(0);
    const fakeTimer = new FakeTimer();
    const detector = new DefaultIosVoiceOverDetector(fakeTimer);

    results.push(
      await runScenario(
        "5. Detection overhead (0ms CtrlProxy, cold)",
        async () => {
          detector.clearAllCache();
          await detector.isVoiceOverEnabled(deviceId, client as unknown as CtrlProxyService);
        },
        client,
        100
      )
    );
  }

  // Scenario 6: Warm cache with VoiceOver disabled (common case in non-a11y testing)
  console.log("Running: Warm detection, VoiceOver disabled (1000 iterations)...");
  {
    const client = new BenchmarkCtrlProxyService(simulatedCtrlProxyDelayMs, false);
    const fakeTimer = new FakeTimer();
    const detector = new DefaultIosVoiceOverDetector(fakeTimer);
    detector.clearAllCache();

    // Seed cache with VoiceOver = false
    await detector.isVoiceOverEnabled(deviceId, client as unknown as CtrlProxyService);
    client.reset();

    results.push(
      await runScenario(
        "6. Warm detection (VoiceOver disabled)",
        async () => {
          await detector.isVoiceOverEnabled(deviceId, client as unknown as CtrlProxyService);
        },
        client,
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
  console.log(`  Cold detection (~${simulatedCtrlProxyDelayMs}ms CtrlProxy RTT):  ${cold.avgPerIteration.toFixed(1)} ms`);
  console.log(`  Warm detection (cache hit):               ${warm.avgPerIteration.toFixed(3)} ms`);
  console.log(`  Cache speedup:                            ${speedup.toFixed(0)}x faster`);
  console.log();
}

// Run benchmark
main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
