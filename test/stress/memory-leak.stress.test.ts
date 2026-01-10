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

  test("should cleanup screenshot buffers", async () => {
    const harness = await createStressHarness();

    try {
      const { viewHierarchy, fixtureImagePaths } = harness.resources;
      const screenshotPath = fixtureImagePaths[0];

      if (supportsGc) {
        global.gc();
      }
      const startUsage = process.memoryUsage().heapUsed;

      for (let i = 0; i < 200; i++) {
        const result = await viewHierarchy.getOrCreateScreenshotBuffer(screenshotPath);
        expect(result.buffer.length).toBeGreaterThan(0);
      }

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

  test("should cleanup XML parsing results", async () => {
    const harness = await createStressHarness();

    try {
      const { viewHierarchy, xmlSamples } = harness.resources;
      const xmlPayload = xmlSamples[0];

      if (supportsGc) {
        global.gc();
      }
      const startUsage = process.memoryUsage().heapUsed;

      for (let i = 0; i < 200; i++) {
        const result = await viewHierarchy.processXmlData(xmlPayload);
        expect(result.hierarchy).toBeDefined();
      }

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
