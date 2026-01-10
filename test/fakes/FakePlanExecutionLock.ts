import type {
  PlanExecutionLock,
  PlanExecutionLockDecision,
  PlanExecutionLockRequest,
} from "../../src/server/PlanExecutionLock";

export class FakePlanExecutionLock implements PlanExecutionLock {
  constructor(private decision: PlanExecutionLockDecision) {}

  evaluate(_request: PlanExecutionLockRequest): PlanExecutionLockDecision {
    return this.decision;
  }

  setDecision(decision: PlanExecutionLockDecision): void {
    this.decision = decision;
  }
}
