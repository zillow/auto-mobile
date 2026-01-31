import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  registerDeviceTools,
  resetDeviceToolsDependencies,
  setDeviceToolsDependencies
} from "../../src/server/deviceTools";
import { ToolRegistry } from "../../src/server/toolRegistry";
import { FakeDeviceUtils } from "../fakes/FakeDeviceUtils";
import { FakeTimer } from "../fakes/FakeTimer";

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
    if (steps > 200) {
      throw new Error("FakeTimer pump exceeded max steps");
    }
  }

  if (error) {
    throw error;
  }

  return result as T;
};

describe("listDevices tool", () => {
  let fakeDeviceUtils: FakeDeviceUtils;

  beforeAll(() => {
    fakeDeviceUtils = new FakeDeviceUtils();
    setDeviceToolsDependencies({
      deviceManagerFactory: () => fakeDeviceUtils
    });

    if (!ToolRegistry.getTool("listDevices")) {
      registerDeviceTools();
    }
  });

  beforeEach(() => {
    fakeDeviceUtils.clearHistory();
  });

  afterAll(() => {
    resetDeviceToolsDependencies();
  });

  test("returns resource guidance without calling device manager", async () => {
    const tool = ToolRegistry.getTool("listDevices");
    expect(tool).toBeDefined();

    const fakeTimer = new FakeTimer();

    const response = await resolveWithFakeTimer(tool!.handler({}), fakeTimer);

    expect(response.content?.[0]?.type).toBe("text");
    const payload = JSON.parse(response.content?.[0]?.text ?? "{}");

    // Verify resources include all platform-specific URIs
    expect(payload.resources).toEqual([
      "automobile:devices/booted",
      "automobile:devices/booted/android",
      "automobile:devices/booted/ios",
      "automobile:devices/images",
      "automobile:devices/images/android",
      "automobile:devices/images/ios"
    ]);

    // Verify the message contains workflow guidance
    expect(payload.message).toContain("RUNNING DEVICES");
    expect(payload.message).toContain("AVAILABLE DEVICE IMAGES");
    expect(payload.message).toContain("WORKFLOW");
    expect(payload.message).toContain("automobile:devices/booted");
    expect(payload.message).toContain("automobile:devices/images");

    // Verify note about URI prefix
    expect(payload.note).toContain("automobile:");
    expect(payload.note).toContain("android://devices");

    expect(fakeDeviceUtils.getExecutedOperations()).toHaveLength(0);
  });

  test("returns platform-specific resource guidance when platform is provided", async () => {
    const tool = ToolRegistry.getTool("listDevices");
    expect(tool).toBeDefined();

    const fakeTimer = new FakeTimer();

    const response = await resolveWithFakeTimer(tool!.handler({ platform: "android" }), fakeTimer);

    expect(response.content?.[0]?.type).toBe("text");
    const payload = JSON.parse(response.content?.[0]?.text ?? "{}");

    // Same resources regardless of platform filter (guidance tool shows all options)
    expect(payload.resources).toEqual([
      "automobile:devices/booted",
      "automobile:devices/booted/android",
      "automobile:devices/booted/ios",
      "automobile:devices/images",
      "automobile:devices/images/android",
      "automobile:devices/images/ios"
    ]);

    // Message should include platform filter indicator
    expect(payload.message).toContain("android only");
    expect(payload.message).toContain("automobile:devices/booted/android");
    expect(payload.message).toContain("automobile:devices/images/android");

    expect(fakeDeviceUtils.getExecutedOperations()).toHaveLength(0);
  });
});
