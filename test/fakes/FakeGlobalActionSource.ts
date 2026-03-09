import type {
  GlobalActionSource,
  GlobalActionResult,
} from "../../src/features/observe/interfaces/GlobalActionSource";

/**
 * Fake implementation of GlobalActionSource for testing.
 * Returns configurable responses and records all calls.
 */
export class FakeGlobalActionSource implements GlobalActionSource {
  private calls: { action: string; timeoutMs?: number }[] = [];
  private configuredResult: GlobalActionResult = {
    success: true,
    action: "",
  };
  private shouldFail = false;

  async executeGlobalAction(
    action: string,
    timeoutMs?: number
  ): Promise<GlobalActionResult> {
    this.calls.push({ action, timeoutMs });
    if (this.shouldFail) {
      return { success: false, action, error: "Fake failure" };
    }
    return { ...this.configuredResult, action };
  }

  /** Configure the result that will be returned. */
  setResult(result: GlobalActionResult): void {
    this.configuredResult = result;
  }

  /** Configure failure mode. */
  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  /** Get the recorded calls. */
  getCalls(): { action: string; timeoutMs?: number }[] {
    return [...this.calls];
  }

  /** Get the number of calls made. */
  getCallCount(): number {
    return this.calls.length;
  }

  /** Get the last action requested. */
  getLastAction(): string | undefined {
    return this.calls[this.calls.length - 1]?.action;
  }

  /** Reset recorded calls. */
  reset(): void {
    this.calls = [];
  }
}
