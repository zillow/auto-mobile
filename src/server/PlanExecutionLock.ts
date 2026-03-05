import type { PlanExecutionLockScope } from "../utils/ServerConfig";
import type { ExecutionTracker } from "./executionTracker";
import { executionTracker } from "./executionTracker";
import { serverConfig } from "../utils/ServerConfig";

export interface PlanExecutionLockRequest {
  toolName: string;
  sessionId?: string;
  sessionUuid?: string;
}

export interface PlanExecutionLockDecision {
  blocked: boolean;
  scope: PlanExecutionLockScope;
  reason?: string;
}

export interface PlanExecutionLock {
  evaluate(request: PlanExecutionLockRequest): PlanExecutionLockDecision;
}

export interface PlanExecutionLockScopeProvider {
  getScope(): PlanExecutionLockScope;
}

class ServerConfigPlanExecutionLockScopeProvider implements PlanExecutionLockScopeProvider {
  getScope(): PlanExecutionLockScope {
    return serverConfig.getPlanExecutionLockScope();
  }
}

export class ExecutionTrackerPlanExecutionLock implements PlanExecutionLock {
  constructor(
    private readonly tracker: ExecutionTracker,
    private readonly scopeProvider: PlanExecutionLockScopeProvider
  ) {}

  evaluate(request: PlanExecutionLockRequest): PlanExecutionLockDecision {
    const scope = this.scopeProvider.getScope();
    const hasActivePlan = this.tracker.hasActiveToolExecution("executePlan", {
      scope,
      sessionId: request.sessionId,
      sessionUuid: request.sessionUuid,
    });

    if (!hasActivePlan) {
      return { blocked: false, scope };
    }

    return {
      blocked: true,
      scope,
      reason: "plan execution in progress",
    };
  }
}

export const createDefaultPlanExecutionLock = (): PlanExecutionLock => {
  return new ExecutionTrackerPlanExecutionLock(
    executionTracker,
    new ServerConfigPlanExecutionLockScopeProvider()
  );
};
