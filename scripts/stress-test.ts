import {
  createStressHarness,
  parseStressArgs,
  resolveStressConfig,
  runStressOperations
} from "./memory/stress-harness";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const stressArgs = parseStressArgs(argv);
  const { runConfig, warmupIterations } = resolveStressConfig(stressArgs);

  const harness = await createStressHarness();

  try {
    if (warmupIterations > 0) {
      await runStressOperations(harness, {
        ...runConfig,
        iterations: warmupIterations,
        gcEvery: 0
      });
    }

    const result = await runStressOperations(harness, runConfig);
    console.log("[stress-test] Completed stress run.");
    console.log(`[stress-test] Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
    console.log(`[stress-test] Iterations: ${result.iterations}`);
  } finally {
    await harness.cleanup();
  }
}

void main();
