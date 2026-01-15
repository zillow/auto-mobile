import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { registerAppTools, resetListAppsToolDependencies, setListAppsToolDependencies } from "../../src/server/appTools";
import { APP_RESOURCE_TEMPLATES, APPS_RESOURCE_URIS } from "../../src/server/appResources";
import { ToolRegistry } from "../../src/server/toolRegistry";
import { FakeToolUtils } from "../fakes/FakeToolUtils";
import { FakeTimer } from "../fakes/FakeTimer";

const resolveWithFakeTimer = async <T>(
  promise: Promise<T>,
  timer: FakeTimer,
  stepMs: number = 1
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
    if (
      timer.getPendingTimeoutCount() > 0 ||
      timer.getPendingIntervalCount() > 0 ||
      timer.getPendingSleepCount() > 0
    ) {
      timer.advanceTime(stepMs);
    }
    await new Promise(resolve => setImmediate(resolve));
    steps += 1;
    if (steps > 100) {
      throw new Error("FakeTimer pump exceeded max steps");
    }
  }

  if (error) {
    throw error;
  }
  return result as T;
};

describe("listApps tool", () => {
  beforeEach(() => {
    ToolRegistry.clearTools();
    resetListAppsToolDependencies();
    registerAppTools();
  });

  afterEach(() => {
    ToolRegistry.clearTools();
    resetListAppsToolDependencies();
  });

  test("registers listApps tool with a permissive schema", () => {
    const tool = ToolRegistry.getTool("listApps");
    expect(tool).toBeDefined();
    expect(() => tool!.schema.parse({})).not.toThrow();
    expect(() => tool!.schema.parse({ deviceId: "device-123" })).not.toThrow();
  });

  test("returns MCP resource guidance using a fake formatter and FakeTimer", async () => {
    const tool = ToolRegistry.getTool("listApps");
    expect(tool).toBeDefined();

    const fakeToolUtils = new FakeToolUtils();
    setListAppsToolDependencies({ toolResponseFormatter: fakeToolUtils });

    const fakeTimer = new FakeTimer();
    fakeTimer.setManualMode();

    const result = await resolveWithFakeTimer(tool!.handler({}), fakeTimer);

    expect(fakeToolUtils.getJSONResponseCount()).toBe(1);
    const payload = fakeToolUtils.getLastJSONResponse();
    expect(payload).toEqual({
      message: "To list apps, query the MCP resource 'automobile:apps' with appropriate filters. " +
        "For device-specific apps, use 'automobile:devices/{deviceId}/apps'.",
      resources: [
        APPS_RESOURCE_URIS.BASE,
        APP_RESOURCE_TEMPLATES.DEVICE_APPS
      ]
    });

    const content = result.content?.[0];
    expect(content?.type).toBe("text");
    expect(content?.text).toBeDefined();
    expect(JSON.parse(content!.text)).toEqual(payload);
  });
});
