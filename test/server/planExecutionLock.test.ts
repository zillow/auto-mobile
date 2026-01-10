import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { McpTestFixture } from "../fixtures/mcpTestFixture";
import { FakePlanExecutionLock } from "../fakes/FakePlanExecutionLock";
import {
  ExecutionTrackerPlanExecutionLock,
  type PlanExecutionLockScopeProvider,
} from "../../src/server/PlanExecutionLock";
import { ExecutionTracker } from "../../src/server/executionTracker";
import type { PlanExecutionLockScope } from "../../src/utils/ServerConfig";
import { FakeDeviceUtils } from "../fakes/FakeDeviceUtils";
import { resetDeviceToolsDependencies, setDeviceToolsDependencies } from "../../src/server/deviceTools";
import { z } from "zod";

class FakePlanExecutionLockScopeProvider implements PlanExecutionLockScopeProvider {
  constructor(private scope: PlanExecutionLockScope) {}

  getScope(): PlanExecutionLockScope {
    return this.scope;
  }

  setScope(scope: PlanExecutionLockScope): void {
    this.scope = scope;
  }
}

describe("Plan execution lock", () => {
  let fixture: McpTestFixture;
  let fakeDeviceUtils: FakeDeviceUtils;
  let fakePlanExecutionLock: FakePlanExecutionLock;

  beforeAll(async () => {
    // Set up FakeDeviceUtils to avoid real ADB commands
    fakeDeviceUtils = new FakeDeviceUtils();
    // Configure with empty device list since we're testing plan lock, not device functionality
    fakeDeviceUtils.setBootedDevices("android", []);

    setDeviceToolsDependencies({
      deviceManagerFactory: () => fakeDeviceUtils
    });

    fakePlanExecutionLock = new FakePlanExecutionLock({
      blocked: false,
      scope: "session",
    });

    fixture = new McpTestFixture({
      planExecutionLock: fakePlanExecutionLock,
    });
    await fixture.setup();
  });

  afterAll(async () => {
    // Reset dependencies to avoid test pollution
    if (fixture) {
      await fixture.teardown();
    }
    resetDeviceToolsDependencies();
  });

  test("rejects MCP tool calls when a plan is executing", async () => {
    fakePlanExecutionLock.setDecision({
      blocked: true,
      scope: "session",
      reason: "plan execution in progress",
    });

    try {
      const { client } = fixture.getContext();
      await client.request({
        method: "tools/call",
        params: {
          name: "listDevices",
          arguments: { platform: "android" },
        },
      }, z.any());
      expect.fail("Expected tool call to be rejected");
    } catch (error: any) {
      expect(error.message).toContain("plan execution in progress");
    }
  });

  test("allows MCP tool calls when no plan is executing", async () => {
    fakePlanExecutionLock.setDecision({
      blocked: false,
      scope: "session",
    });

    const { client } = fixture.getContext();
    const result = await client.request({
      method: "tools/call",
      params: {
        name: "listDevices",
        arguments: { platform: "android" },
      },
    }, z.any());

    expect(result).toHaveProperty("content");
  });

  test("scopes blocking to session or global", () => {
    const tracker = new ExecutionTracker();
    const scopeProvider = new FakePlanExecutionLockScopeProvider("session");
    const lock = new ExecutionTrackerPlanExecutionLock(tracker, scopeProvider);

    const execution = tracker.startExecution("executePlan", undefined, "session-a");
    try {
      const sessionDecision = lock.evaluate({
        toolName: "tapOn",
        sessionUuid: "session-a",
      });
      expect(sessionDecision.blocked).toBe(true);
      expect(sessionDecision.scope).toBe("session");

      const otherSessionDecision = lock.evaluate({
        toolName: "tapOn",
        sessionUuid: "session-b",
      });
      expect(otherSessionDecision.blocked).toBe(false);

      scopeProvider.setScope("global");
      const globalDecision = lock.evaluate({
        toolName: "tapOn",
        sessionUuid: "session-b",
      });
      expect(globalDecision.blocked).toBe(true);
      expect(globalDecision.scope).toBe("global");
    } finally {
      tracker.endExecution(execution.id);
    }
  });
});
