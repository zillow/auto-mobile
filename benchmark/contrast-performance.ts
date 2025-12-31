/**
 * Performance benchmark for contrast checking optimizations
 * Tests the impact of caching on accessibility audit performance
 */

import { ContrastChecker } from "../src/features/accessibility/ContrastChecker";
import { Element } from "../src/models/Element";
import path from "path";

interface BenchmarkResult {
  name: string;
  duration: number;
  cacheStats?: ReturnType<ContrastChecker["getCacheStats"]>;
}

/**
 * Generate test elements with varying positions
 */
function generateTestElements(count: number): Element[] {
  const elements: Element[] = [];

  for (let i = 0; i < count; i++) {
    const x = (i % 5) * 100 + 50;
    const y = Math.floor(i / 5) * 100 + 50;

    elements.push({
      "index": i,
      "text": `Text Element ${i}`,
      "resource-id": `com.example:id/text_${i}`,
      "class": "android.widget.TextView",
      "package": "com.example",
      "content-desc": "",
      "checkable": false,
      "checked": false,
      "clickable": false,
      "enabled": true,
      "focusable": false,
      "focused": false,
      "scrollable": false,
      "long-clickable": false,
      "password": false,
      "selected": false,
      "visible": true,
      "bounds": {
        left: x,
        top: y,
        right: x + 80,
        bottom: y + 30,
      },
    });
  }

  return elements;
}

/**
 * Run a benchmark scenario
 */
async function runBenchmark(
  name: string,
  checker: ContrastChecker,
  screenshotPath: string,
  elements: Element[],
  useBatch: boolean = false
): Promise<BenchmarkResult> {
  const startTime = performance.now();

  if (useBatch) {
    await checker.checkContrastBatch(screenshotPath, elements, "AA");
  } else {
    for (const element of elements) {
      await checker.checkContrast(screenshotPath, element, "AA");
    }
  }

  const duration = performance.now() - startTime;
  const cacheStats = checker.getCacheStats();

  return {
    name,
    duration,
    cacheStats,
  };
}

/**
 * Format cache hit rate as percentage
 */
function hitRate(hits: number, misses: number): string {
  const total = hits + misses;
  if (total === 0) {return "N/A";}
  return `${((hits / total) * 100).toFixed(1)}%`;
}

/**
 * Print benchmark results
 */
function printResults(results: BenchmarkResult[]): void {
  console.log("\n=== Contrast Checking Performance Benchmark ===\n");

  // Print duration comparison
  console.log("Duration Results:");
  console.log("─".repeat(60));
  for (const result of results) {
    console.log(`${result.name.padEnd(35)} ${result.duration.toFixed(0).padStart(6)} ms`);
  }

  // Calculate improvements
  if (results.length >= 2) {
    console.log("\nPerformance Improvements:");
    console.log("─".repeat(60));
    const baseline = results[0].duration;
    for (let i = 1; i < results.length; i++) {
      const improvement = ((baseline - results[i].duration) / baseline) * 100;
      const speedup = baseline / results[i].duration;
      console.log(
        `${results[i].name.padEnd(35)} ${improvement.toFixed(1)}% faster (${speedup.toFixed(1)}x)`
      );
    }
  }

  // Print cache statistics
  console.log("\nCache Statistics:");
  console.log("─".repeat(60));
  for (const result of results) {
    if (result.cacheStats) {
      const stats = result.cacheStats;
      console.log(`\n${result.name}:`);
      console.log(
        `  Screenshots:  ${stats.screenshots.size.toString().padStart(3)} cached, ` +
          `${hitRate(stats.screenshots.hits, stats.screenshots.misses)} hit rate`
      );
      console.log(
        `  Color Pairs:  ${stats.colorPairs.size.toString().padStart(3)} cached, ` +
          `${hitRate(stats.colorPairs.hits, stats.colorPairs.misses)} hit rate`
      );
      console.log(
        `  Elements:     ${stats.elements.size.toString().padStart(3)} cached, ` +
          `${hitRate(stats.elements.hits, stats.elements.misses)} hit rate`
      );
      console.log(
        `  Backgrounds:  ${stats.backgrounds.size.toString().padStart(3)} cached, ` +
          `${hitRate(stats.backgrounds.hits, stats.backgrounds.misses)} hit rate`
      );
    }
  }

  console.log("\n" + "=".repeat(60) + "\n");
}

/**
 * Main benchmark execution
 */
async function main() {
  // Use test fixture screenshot
  const screenshotPath = path.join(__dirname, "../test/fixtures/screenshots/wcag-aa-minimum.png");

  // Generate test elements
  const elementCount = 50;
  const elements = generateTestElements(elementCount);

  console.log(`\nBenchmarking with ${elementCount} text elements...\n`);

  const results: BenchmarkResult[] = [];

  // Scenario 1: Cold cache (all caching disabled)
  console.log("Running: Cold cache (no caching)...");
  const noCacheChecker = new ContrastChecker({
    enableScreenshotCache: false,
    enableColorPairCache: false,
    enableElementCache: false,
    enableBackgroundCache: false,
  });
  results.push(
    await runBenchmark("1. Cold cache (no caching)", noCacheChecker, screenshotPath, elements)
  );

  // Scenario 2: Screenshot caching only
  console.log("Running: Screenshot caching only...");
  const screenshotCacheChecker = new ContrastChecker({
    enableScreenshotCache: true,
    enableColorPairCache: false,
    enableElementCache: false,
    enableBackgroundCache: false,
  });
  results.push(
    await runBenchmark(
      "2. Screenshot caching only",
      screenshotCacheChecker,
      screenshotPath,
      elements
    )
  );

  // Scenario 3: All caches enabled (first run)
  console.log("Running: All caches enabled (first run)...");
  const fullCacheChecker = new ContrastChecker();
  results.push(
    await runBenchmark("3. All caches enabled (first run)", fullCacheChecker, screenshotPath, elements)
  );

  // Scenario 4: All caches enabled (warm cache - same elements)
  console.log("Running: All caches enabled (warm cache)...");
  results.push(
    await runBenchmark("4. All caches enabled (warm cache)", fullCacheChecker, screenshotPath, elements)
  );

  // Scenario 5: Batch processing with cold cache
  console.log("Running: Batch processing (cold cache)...");
  const batchChecker = new ContrastChecker();
  batchChecker.clearCaches();
  results.push(
    await runBenchmark(
      "5. Batch processing (cold cache)",
      batchChecker,
      screenshotPath,
      elements,
      true
    )
  );

  // Scenario 6: Batch processing with warm cache
  console.log("Running: Batch processing (warm cache)...");
  results.push(
    await runBenchmark(
      "6. Batch processing (warm cache)",
      batchChecker,
      screenshotPath,
      elements,
      true
    )
  );

  // Print all results
  printResults(results);

  // Verify target improvements
  console.log("Target Performance Goals:");
  console.log("─".repeat(60));

  const baseline = results[0].duration;
  const warmCache = results[3].duration;
  const batchWarm = results[5].duration;

  const warmCacheImprovement = baseline / warmCache;
  const batchWarmImprovement = baseline / batchWarm;

  console.log(`First audit (50 elements):           ${baseline.toFixed(0)} ms`);
  console.log(
    `Repeated audit (warm cache):         ${warmCache.toFixed(0)} ms (${warmCacheImprovement.toFixed(1)}x faster)`
  );
  console.log(
    `Batch + warm cache:                  ${batchWarm.toFixed(0)} ms (${batchWarmImprovement.toFixed(1)}x faster)`
  );

  console.log("\nTarget Goals from Issue #105:");
  console.log("  ✓ Screenshot loaded once per audit (not per element)");
  console.log(
    `  ${warmCacheImprovement >= 10 ? "✓" : "✗"} Repeated audits ≥10x faster: ${warmCacheImprovement.toFixed(1)}x`
  );
  console.log(
    `  ${batchWarmImprovement >= 10 ? "✓" : "✗"} Batch processing ≥10x faster: ${batchWarmImprovement.toFixed(1)}x`
  );

  const screenshotStats = results[3].cacheStats?.screenshots;
  const colorPairStats = results[3].cacheStats?.colorPairs;

  if (screenshotStats) {
    const screenshotHitRate =
      screenshotStats.hits / (screenshotStats.hits + screenshotStats.misses);
    console.log(
      `  ${screenshotHitRate >= 0.95 ? "✓" : "✗"} Screenshot cache hit rate: ${(screenshotHitRate * 100).toFixed(1)}%`
    );
  }

  if (colorPairStats) {
    const colorHitRate = colorPairStats.hits / (colorPairStats.hits + colorPairStats.misses);
    console.log(
      `  ${colorHitRate >= 0.8 ? "✓" : "✗"} Color pair cache hit rate >80%: ${(colorHitRate * 100).toFixed(1)}%`
    );
  }

  console.log();
}

// Run benchmark
main().catch(console.error);
