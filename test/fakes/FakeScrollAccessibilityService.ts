import type { ScrollAccessibilityService } from "../../src/features/action/swipeon/types";

type RequestActionCall = {
  action: string;
  resourceId?: string;
  timeoutMs?: number;
};

export class FakeScrollAccessibilityService implements ScrollAccessibilityService {
  requestActionResult: { success: boolean; error?: string; [key: string]: unknown } = { success: true };
  requestActionCalls: RequestActionCall[] = [];
  private throwOnRequest: Error | null = null;

  setRequestActionThrows(err: Error): void {
    this.throwOnRequest = err;
  }

  async requestAction(
    action: string,
    resourceId?: string,
    timeoutMs?: number,
    _perf?: unknown
  ): Promise<{ success: boolean; error?: string; [key: string]: unknown }> {
    this.requestActionCalls.push({ action, resourceId, timeoutMs });
    if (this.throwOnRequest) {
      throw this.throwOnRequest;
    }
    return this.requestActionResult;
  }

  async getAccessibilityHierarchy(): Promise<null> {
    return null;
  }
}
