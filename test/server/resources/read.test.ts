import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { McpTestFixture } from "../../fixtures/mcpTestFixture";
import { ObserveScreen } from "../../../src/features/observe/ObserveScreen";
import * as fs from "fs/promises";
import * as path from "path";
import { z } from "zod";
import { ScreenshotJobTracker } from "../../../src/utils/ScreenshotJobTracker";
import { FakeAdbExecutor } from "../../fakes/FakeAdbExecutor";
import { BootedDevice } from "../../../src/models/DeviceInfo";
import { FakeTimer } from "../../fakes/FakeTimer";
import { OPERATION_CANCELLED_MESSAGE } from "../../../src/utils/constants";

const resolveWithFakeTimer = async <T>(
  promise: Promise<T>,
  timer: FakeTimer,
  stepMs: number = 10
): Promise<T> => {
  let settled = false;
  let result: T | undefined;
  let error: unknown;

  promise
    .then(value => {
      settled = true;
      result = value;
    })
    .catch(caught => {
      settled = true;
      error = caught;
    });

  let steps = 0;
  while (!settled) {
    if (timer.getPendingTimeoutCount() > 0 || timer.getPendingIntervalCount() > 0 || timer.getPendingSleepCount() > 0) {
      timer.advanceTime(stepMs);
    }
    await new Promise(resolve => setImmediate(resolve));
    steps += 1;
    if (steps > 2000) {
      throw new Error("FakeTimer pump exceeded max steps");
    }
  }

  if (error) {
    throw error;
  }
  return result as T;
};

describe("MCP Resources Read", () => {
  let fixture: McpTestFixture;

  beforeAll(async () => {
    // Clear both in-memory and disk caches from previous tests
    ObserveScreen.clearCache();

    const cacheDir = path.join("/tmp/auto-mobile", "observe_results");
    try {
      const files = await fs.readdir(cacheDir);
      for (const file of files) {
        await fs.unlink(path.join(cacheDir, file));
      }
    } catch {
      // Cache directory might not exist, which is fine
    }

    fixture = new McpTestFixture();
    await fixture.setup();
  });

  afterEach(() => {
    ObserveScreen.clearCache();
    ScreenshotJobTracker.resetTimer();
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.teardown();
    }
  });

  test("reading latest observation without prior observe should return error message", async function() {
    const { client } = fixture.getContext();

    // Send resources/read request
    const readResourceResponseSchema = z.object({
      contents: z.array(z.object({
        uri: z.string(),
        mimeType: z.string().optional(),
        text: z.string().optional(),
        blob: z.string().optional()
      }))
    });

    const result = await client.request({
      method: "resources/read",
      params: {
        uri: "automobile:observation/latest"
      }
    }, readResourceResponseSchema);

    // Verify response structure
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("contents");
    expect(Array.isArray(result.contents)).toBe(true);
    expect(result.contents).toHaveLength(1);

    // Verify content
    const content = result.contents[0];
    expect(content.uri).toBe("automobile:observation/latest");
    expect(content.mimeType).toBe("application/json");
    expect(content.text).toBeDefined();

    // Parse and verify error message
    const data = JSON.parse(content.text!);
    expect(data).toHaveProperty("error");
    expect(data.error).toContain("No observation available");
  });

  test("reading latest screenshot resource", async function() {
    const { client } = fixture.getContext();

    // Send resources/read request
    const readResourceResponseSchema = z.object({
      contents: z.array(z.object({
        uri: z.string(),
        mimeType: z.string().optional(),
        text: z.string().optional(),
        blob: z.string().optional()
      }))
    });

    const result = await client.request({
      method: "resources/read",
      params: {
        uri: "automobile:observation/latest/screenshot"
      }
    }, readResourceResponseSchema);

    // Verify response structure
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("contents");
    expect(Array.isArray(result.contents)).toBe(true);
    expect(result.contents).toHaveLength(1);

    // Verify content
    const content = result.contents[0];
    expect(content.uri).toBe("automobile:observation/latest/screenshot");

    // Content can be either an error message (if no screenshot) or actual image data
    if (content.mimeType === "application/json") {
      // No screenshot available
      expect(content.text).toBeDefined();
      const data = JSON.parse(content.text!);
      expect(data).toHaveProperty("error");
      expect(data.error).toContain("No observation available");
    } else {
      // Screenshot available
      expect(content.mimeType).toMatch(/^image\/(png|webp)$/);
      expect(content.blob).toBeDefined();
      expect(content.blob!.length).toBeGreaterThan(0);
    }
  });

  test("reading latest screenshot waits for pending capture when none cached", async function() {
    const { client } = fixture.getContext();
    const fakeTimer = new FakeTimer();
    ScreenshotJobTracker.setTimer(fakeTimer);

    const mockDevice: BootedDevice = {
      deviceId: "test-device",
      name: "Test Device",
      platform: "android"
    };
    const observeScreen = new ObserveScreen(mockDevice, new FakeAdbExecutor());
    await observeScreen.cacheObserveResult(observeScreen.createBaseResult());

    (ObserveScreen as any).latestScreenshotPath = null;
    (ObserveScreen as any).latestScreenshotError = null;
    (ObserveScreen as any).latestScreenshotTimestamp = null;

    const screenshotDir = path.join("/tmp/auto-mobile", "screenshots");
    await fs.mkdir(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, `screenshot_${Date.now()}.png`);
    await fs.writeFile(screenshotPath, Buffer.from("fake screenshot data"));

    ScreenshotJobTracker.startJob(mockDevice.deviceId, async signal => {
      return new Promise(resolve => {
        const timeoutId = fakeTimer.setTimeout(() => {
          (ObserveScreen as any).latestScreenshotPath = screenshotPath;
          (ObserveScreen as any).latestScreenshotError = null;
          (ObserveScreen as any).latestScreenshotTimestamp = Date.now();
          resolve({ success: true, path: screenshotPath });
        }, 25);

        signal.addEventListener("abort", () => {
          fakeTimer.clearTimeout(timeoutId);
          resolve({ success: false, error: OPERATION_CANCELLED_MESSAGE });
        }, { once: true });
      });
    });

    const readResourceResponseSchema = z.object({
      contents: z.array(z.object({
        uri: z.string(),
        mimeType: z.string().optional(),
        text: z.string().optional(),
        blob: z.string().optional()
      }))
    });

    const resultPromise = client.request({
      method: "resources/read",
      params: {
        uri: "automobile:observation/latest/screenshot"
      }
    }, readResourceResponseSchema);
    const result = await resolveWithFakeTimer(resultPromise, fakeTimer, 25);

    const content = result.contents[0];
    expect(content.uri).toBe("automobile:observation/latest/screenshot");
    expect(content.mimeType).toBe("image/png");
    expect(content.blob).toBeDefined();
    expect(content.blob!.length).toBeGreaterThan(0);

    await fs.unlink(screenshotPath);
  });

  test("reading non-existent resource should throw error", async function() {
    const { client } = fixture.getContext();

    // Send resources/read request for non-existent resource
    const readResourceResponseSchema = z.object({
      contents: z.array(z.object({
        uri: z.string(),
        mimeType: z.string().optional(),
        text: z.string().optional(),
        blob: z.string().optional()
      }))
    });

    // Expect this to throw an error
    await expect(async () => {
      await client.request({
        method: "resources/read",
        params: {
          uri: "automobile:observation/invalid"
        }
      }, readResourceResponseSchema);
    }).toThrow();
  });
});
