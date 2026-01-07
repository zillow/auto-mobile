import { describe, expect, test } from "bun:test";
import { McpTestFixture } from "../fixtures/mcpTestFixture";
import { FakePlanExecutionLock } from "../fakes/FakePlanExecutionLock";
import {
  ExecutionTrackerPlanExecutionLock,
  type PlanExecutionLockScopeProvider,
} from "../../src/server/PlanExecutionLock";
import { ExecutionTracker } from "../../src/server/executionTracker";
import type { PlanExecutionLockScope } from "../../src/utils/ServerConfig";

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
  test("rejects MCP tool calls when a plan is executing", async () => {
    const fixture = new McpTestFixture({
      planExecutionLock: new FakePlanExecutionLock({
        blocked: true,
        scope: "session",
        reason: "plan execution in progress",
      }),
    });
    await fixture.setup();

    try {
      const { client } = fixture.getContext();
      const { z } = await import("zod");
      await client.request({
        method: "tools/call",
        params: {
          name: "listFeatureFlags",
          arguments: {},
        },
      }, z.any());
      expect.fail("Expected tool call to be rejected");
    } catch (error: any) {
      expect(error.message).toContain("plan execution in progress");
    } finally {
      await fixture.teardown();
    }
  });

  test("allows MCP tool calls when no plan is executing", async () => {
    const fixture = new McpTestFixture({
      planExecutionLock: new FakePlanExecutionLock({
        blocked: false,
        scope: "session",
      }),
    });
    await fixture.setup();

    try {
      const { client } = fixture.getContext();
      const { z } = await import("zod");
      const result = await client.request({
        method: "tools/call",
        params: {
          name: "listFeatureFlags",
          arguments: {},
        },
      }, z.any());

      expect(result).toHaveProperty("content");
    } finally {
      await fixture.teardown();
    }
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
