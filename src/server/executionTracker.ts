import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger";

export interface ActiveExecution {
  id: string;
  toolName: string;
  sessionId?: string;
  sessionUuid?: string;
  startTime: number;
  abortController: AbortController;
}

export type ExecutionScope = "session" | "global";

export interface ExecutionScopeOptions {
  scope: ExecutionScope;
  sessionId?: string;
  sessionUuid?: string;
}

export class ExecutionTracker {
  private executions = new Map<string, ActiveExecution>();
  private sessionExecutions = new Map<string, Set<string>>();
  private sessionUuidExecutions = new Map<string, Set<string>>();

  startExecution(
    toolName: string,
    sessionId?: string,
    sessionUuid?: string
  ): ActiveExecution {
    const id = randomUUID();
    const execution: ActiveExecution = {
      id,
      toolName,
      sessionId,
      sessionUuid,
      startTime: Date.now(),
      abortController: new AbortController()
    };

    this.executions.set(id, execution);

    if (sessionId) {
      const sessionSet = this.sessionExecutions.get(sessionId) ?? new Set();
      sessionSet.add(id);
      this.sessionExecutions.set(sessionId, sessionSet);
    }

    if (sessionUuid) {
      const sessionSet = this.sessionUuidExecutions.get(sessionUuid) ?? new Set();
      sessionSet.add(id);
      this.sessionUuidExecutions.set(sessionUuid, sessionSet);
    }

    return execution;
  }

  endExecution(executionId: string): void {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return;
    }

    this.executions.delete(executionId);

    if (execution.sessionId) {
      const sessionSet = this.sessionExecutions.get(execution.sessionId);
      sessionSet?.delete(executionId);
      if (sessionSet?.size === 0) {
        this.sessionExecutions.delete(execution.sessionId);
      }
    }

    if (execution.sessionUuid) {
      const sessionSet = this.sessionUuidExecutions.get(execution.sessionUuid);
      sessionSet?.delete(executionId);
      if (sessionSet?.size === 0) {
        this.sessionUuidExecutions.delete(execution.sessionUuid);
      }
    }
  }

  async cancelSessionExecutions(sessionId: string): Promise<number> {
    return this.cancelExecutionsForKey(sessionId, this.sessionExecutions, "sessionId");
  }

  async cancelSessionUuidExecutions(sessionUuid: string): Promise<number> {
    return this.cancelExecutionsForKey(sessionUuid, this.sessionUuidExecutions, "sessionUuid");
  }

  hasActiveSessionUuidExecutions(sessionUuid: string): boolean {
    const executions = this.sessionUuidExecutions.get(sessionUuid);
    return executions !== undefined && executions.size > 0;
  }

  hasActiveToolExecution(toolName: string, options: ExecutionScopeOptions): boolean {
    if (options.scope === "global") {
      return this.hasActiveToolExecutionGlobal(toolName);
    }

    if (options.sessionUuid) {
      return this.hasActiveToolExecutionForKey(toolName, this.sessionUuidExecutions, options.sessionUuid);
    }

    if (options.sessionId) {
      return this.hasActiveToolExecutionForKey(toolName, this.sessionExecutions, options.sessionId);
    }

    return this.hasActiveToolExecutionGlobal(toolName);
  }

  private hasActiveToolExecutionGlobal(toolName: string): boolean {
    for (const execution of this.executions.values()) {
      if (execution.toolName === toolName) {
        return true;
      }
    }
    return false;
  }

  private hasActiveToolExecutionForKey(
    toolName: string,
    executionMap: Map<string, Set<string>>,
    key: string
  ): boolean {
    const executions = executionMap.get(key);
    if (!executions || executions.size === 0) {
      return false;
    }

    for (const executionId of executions) {
      const execution = this.executions.get(executionId);
      if (execution?.toolName === toolName) {
        return true;
      }
    }

    return false;
  }

  private async cancelExecutionsForKey(
    key: string,
    executionMap: Map<string, Set<string>>,
    label: "sessionId" | "sessionUuid"
  ): Promise<number> {
    const executions = executionMap.get(key);
    if (!executions || executions.size === 0) {
      return 0;
    }

    let cancelled = 0;
    for (const executionId of executions) {
      const execution = this.executions.get(executionId);
      if (!execution) {
        continue;
      }
      execution.abortController.abort();
      cancelled++;
      logger.info(
        `[ExecutionTracker] Cancelled execution ${executionId} for ${label}=${key} (tool=${execution.toolName})`
      );
    }

    return cancelled;
  }
}

export const executionTracker = new ExecutionTracker();
