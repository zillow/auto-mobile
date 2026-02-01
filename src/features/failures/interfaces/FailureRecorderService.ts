import type {
  RecordToolFailureInput,
  RecordCrashInput,
  RecordAnrInput,
  RecordNonFatalInput,
} from "../FailureRecorder";

/**
 * Interface for recording various types of failures.
 * Implementations handle signature generation, severity calculation,
 * and persistence of failure data.
 */
export interface FailureRecorderService {
  /**
   * Record a tool call failure.
   * @param input - Details of the tool failure
   * @returns The occurrence ID for the recorded failure
   */
  recordToolFailure(input: RecordToolFailureInput): Promise<string>;

  /**
   * Record a crash (exception).
   * @param input - Details of the crash
   * @returns The occurrence ID for the recorded failure
   */
  recordCrash(input: RecordCrashInput): Promise<string>;

  /**
   * Record an ANR (Application Not Responding).
   * @param input - Details of the ANR
   * @returns The occurrence ID for the recorded failure
   */
  recordAnr(input: RecordAnrInput): Promise<string>;

  /**
   * Record a non-fatal (handled) exception.
   * @param input - Details of the non-fatal error
   * @returns The occurrence ID for the recorded failure
   */
  recordNonFatal(input: RecordNonFatalInput): Promise<string>;
}
