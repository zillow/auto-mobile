import type { FailureRecorderService } from "../../src/features/failures/interfaces/FailureRecorderService";
import type {
  RecordToolFailureInput,
  RecordCrashInput,
  RecordAnrInput,
} from "../../src/features/failures/FailureRecorder";

/**
 * Recorded failure for testing.
 */
interface RecordedFailure {
  type: "tool_failure" | "crash" | "anr";
  input: RecordToolFailureInput | RecordCrashInput | RecordAnrInput;
  occurrenceId: string;
  timestamp: number;
}

/**
 * Fake implementation of FailureRecorderService for testing.
 * Records all failures in memory for verification.
 */
export class FakeFailureRecorder implements FailureRecorderService {
  private recordedFailures: RecordedFailure[] = [];
  private nextOccurrenceId = 1;
  private shouldFail = false;
  private failureError: Error | null = null;

  /**
   * Record a tool call failure.
   */
  async recordToolFailure(input: RecordToolFailureInput): Promise<string> {
    this.checkShouldFail();
    const occurrenceId = `occ_${this.nextOccurrenceId++}`;
    this.recordedFailures.push({
      type: "tool_failure",
      input,
      occurrenceId,
      timestamp: Date.now(),
    });
    return occurrenceId;
  }

  /**
   * Record a crash.
   */
  async recordCrash(input: RecordCrashInput): Promise<string> {
    this.checkShouldFail();
    const occurrenceId = `occ_${this.nextOccurrenceId++}`;
    this.recordedFailures.push({
      type: "crash",
      input,
      occurrenceId,
      timestamp: Date.now(),
    });
    return occurrenceId;
  }

  /**
   * Record an ANR.
   */
  async recordAnr(input: RecordAnrInput): Promise<string> {
    this.checkShouldFail();
    const occurrenceId = `occ_${this.nextOccurrenceId++}`;
    this.recordedFailures.push({
      type: "anr",
      input,
      occurrenceId,
      timestamp: Date.now(),
    });
    return occurrenceId;
  }

  // Test helpers

  /**
   * Get all recorded failures.
   */
  getRecordedFailures(): RecordedFailure[] {
    return [...this.recordedFailures];
  }

  /**
   * Get recorded tool failures only.
   */
  getToolFailures(): RecordedFailure[] {
    return this.recordedFailures.filter(f => f.type === "tool_failure");
  }

  /**
   * Get recorded crashes only.
   */
  getCrashes(): RecordedFailure[] {
    return this.recordedFailures.filter(f => f.type === "crash");
  }

  /**
   * Get recorded ANRs only.
   */
  getAnrs(): RecordedFailure[] {
    return this.recordedFailures.filter(f => f.type === "anr");
  }

  /**
   * Get the count of recorded failures.
   */
  getFailureCount(): number {
    return this.recordedFailures.length;
  }

  /**
   * Configure the fake to throw an error on the next call.
   */
  setFailure(error: Error): void {
    this.shouldFail = true;
    this.failureError = error;
  }

  /**
   * Clear the failure configuration.
   */
  clearFailure(): void {
    this.shouldFail = false;
    this.failureError = null;
  }

  /**
   * Reset all recorded failures and configuration.
   */
  reset(): void {
    this.recordedFailures = [];
    this.nextOccurrenceId = 1;
    this.shouldFail = false;
    this.failureError = null;
  }

  private checkShouldFail(): void {
    if (this.shouldFail && this.failureError) {
      throw this.failureError;
    }
  }
}
