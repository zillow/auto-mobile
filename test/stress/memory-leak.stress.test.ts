import { describe, expect, test } from "bun:test";
import {
  createStressHarness,
  runStressOperations
} from "../../scripts/memory/stress-harness";

const supportsGc = typeof global.gc === "function";
const memoryLimitBytes = 20 * 1024 * 1024;

describe("MCP Server Memory Leak Tests", () => {
  test("should not leak during high-frequency observe and interaction cycles", async () => {
    const harness = await createStressHarness();

    try {
      if (supportsGc) {
        global.gc();
      }
      const startUsage = process.memoryUsage().heapUsed;

      await runStressOperations(harness, {
        iterations: 200,
        opsPerSecond: 0,
        operations: ["observe", "tapOn", "swipeOn", "inputText"],
        gcEvery: 0
      });

      if (supportsGc) {
        global.gc();
      }
      const endUsage = process.memoryUsage().heapUsed;

      if (supportsGc) {
        expect(endUsage - startUsage).toBeLessThan(memoryLimitBytes);
      }
    } finally {
      await harness.cleanup();
    }
  });
});
