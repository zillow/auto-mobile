import { describe, expect, test, beforeEach } from "bun:test";
import { FailureRecorder } from "../../../src/features/failures/FailureRecorder";
import type {
  RecordToolFailureInput,
  RecordCrashInput,
  RecordAnrInput,
  RecordNonFatalInput,
} from "../../../src/features/failures/FailureRecorder";
import type { RecordFailureInput } from "../../../src/db/failureAnalyticsRepository";
import type { StackTraceElement } from "../../../src/server/failuresResources";
import { FakeTimer } from "../../fakes/FakeTimer";

/**
 * Fake FailureAnalyticsRepository that captures recordFailure calls in memory.
 * Used to test FailureRecorder's signature generation, severity calculation,
 * and input mapping without a real database.
 */
class FakeFailureAnalyticsRepository {
  private recorded: RecordFailureInput[] = [];
  private nextId = 1;
  private shouldFail = false;

  async recordFailure(input: RecordFailureInput): Promise<string> {
    if (this.shouldFail) {
      throw new Error("Repository failure");
    }
    this.recorded.push(input);
    return `occ_${this.nextId++}`;
  }

  getRecorded(): RecordFailureInput[] {
    return [...this.recorded];
  }

  last(): RecordFailureInput {
    return this.recorded[this.recorded.length - 1];
  }

  setFailure(fail: boolean): void {
    this.shouldFail = fail;
  }

  reset(): void {
    this.recorded = [];
    this.nextId = 1;
    this.shouldFail = false;
  }
}

const makeAppFrame = (overrides?: Partial<StackTraceElement>): StackTraceElement => ({
  className: "com.example.app.MainActivity",
  methodName: "onCreate",
  fileName: "MainActivity.kt",
  lineNumber: 42,
  isAppCode: true,
  ...overrides,
});

const makeSystemFrame = (overrides?: Partial<StackTraceElement>): StackTraceElement => ({
  className: "android.os.Handler",
  methodName: "handleCallback",
  fileName: null,
  lineNumber: null,
  isAppCode: false,
  ...overrides,
});

const baseContext = {
  deviceModel: "Pixel 6",
  os: "android-14",
  appVersion: "1.0.0",
  sessionId: "session-1",
};

class FakeTelemetryRecorder {
  pushed: Array<{ type: string; stackTrace?: unknown }> = [];
  recordFailureTelemetry(event: Record<string, unknown>): void {
    this.pushed.push(event as any);
  }
}

describe("FailureRecorder", () => {
  let repo: FakeFailureAnalyticsRepository;
  let timer: FakeTimer;
  let telemetry: FakeTelemetryRecorder;
  let recorder: FailureRecorder;

  beforeEach(() => {
    repo = new FakeFailureAnalyticsRepository();
    timer = new FakeTimer();
    telemetry = new FakeTelemetryRecorder();
    // Use the constructor DI to inject our fakes
    recorder = new FailureRecorder(repo as any, timer, telemetry);
  });

  describe("recordToolFailure", () => {
    const makeInput = (overrides?: Partial<RecordToolFailureInput>): RecordToolFailureInput => ({
      toolName: "tapOn",
      errorMessage: "Element not found",
      ...baseContext,
      ...overrides,
    });

    test("records a tool failure and returns occurrence ID", async () => {
      const result = await recorder.recordToolFailure(makeInput());

      expect(result).toBe("occ_1");
      expect(repo.getRecorded()).toHaveLength(1);
    });

    test("generates correct tool failure signature", async () => {
      await recorder.recordToolFailure(makeInput({ errorCode: "NOT_FOUND" }));

      expect(repo.last().signature).toBe("tool:tapOn:NOT_FOUND");
    });

    test("uses UNKNOWN when errorCode is missing", async () => {
      await recorder.recordToolFailure(makeInput());

      expect(repo.last().signature).toBe("tool:tapOn:UNKNOWN");
    });

    test("sets type to tool_failure", async () => {
      await recorder.recordToolFailure(makeInput());

      expect(repo.last().type).toBe("tool_failure");
    });

    test("generates title with tool name and error code", async () => {
      await recorder.recordToolFailure(makeInput({ errorCode: "TIMEOUT" }));

      expect(repo.last().title).toBe("tapOn: TIMEOUT");
    });

    test("generates title with Failed when no error code", async () => {
      await recorder.recordToolFailure(makeInput());

      expect(repo.last().title).toBe("tapOn: Failed");
    });

    test("includes tool call info with error codes", async () => {
      await recorder.recordToolFailure(makeInput({ errorCode: "NOT_FOUND" }));

      const toolCallInfo = repo.last().toolCallInfo!;
      expect(toolCallInfo.toolName).toBe("tapOn");
      expect(toolCallInfo.errorCodes).toEqual({ NOT_FOUND: 1 });
    });

    test("includes duration stats when durationMs is provided", async () => {
      await recorder.recordToolFailure(makeInput({ durationMs: 500 }));

      const stats = repo.last().toolCallInfo!.durationStats!;
      expect(stats.minMs).toBe(500);
      expect(stats.maxMs).toBe(500);
      expect(stats.avgMs).toBe(500);
    });

    test("has null duration stats when durationMs is not provided", async () => {
      await recorder.recordToolFailure(makeInput());

      expect(repo.last().toolCallInfo!.durationStats).toBeNull();
    });

    test("extracts parameter variants from toolArgs", async () => {
      await recorder.recordToolFailure(
        makeInput({
          toolArgs: { text: "Login", timeout: 5000 },
        })
      );

      const variants = repo.last().toolCallInfo!.parameterVariants;
      expect(variants.text).toEqual(["Login"]);
      expect(variants.timeout).toEqual(["5000"]);
    });

    test("handles empty toolArgs", async () => {
      await recorder.recordToolFailure(makeInput({ toolArgs: {} }));

      expect(repo.last().toolCallInfo!.parameterVariants).toEqual({});
    });

    test("propagates repository errors", async () => {
      repo.setFailure(true);

      await expect(recorder.recordToolFailure(makeInput())).rejects.toThrow("Repository failure");
    });
  });

  describe("tool failure severity", () => {
    const makeInput = (errorCode?: string): RecordToolFailureInput => ({
      toolName: "test",
      errorMessage: "err",
      errorCode,
      ...baseContext,
    });

    test("returns medium when no error code", async () => {
      await recorder.recordToolFailure(makeInput());

      expect(repo.last().severity).toBe("medium");
    });

    test("returns critical for CRASH error codes", async () => {
      await recorder.recordToolFailure(makeInput("APP_CRASH"));

      expect(repo.last().severity).toBe("critical");
    });

    test("returns critical for FATAL error codes", async () => {
      await recorder.recordToolFailure(makeInput("FATAL_ERROR"));

      expect(repo.last().severity).toBe("critical");
    });

    test("returns high for TIMEOUT error codes", async () => {
      await recorder.recordToolFailure(makeInput("TIMEOUT"));

      expect(repo.last().severity).toBe("high");
    });

    test("returns high for CONNECTION error codes", async () => {
      await recorder.recordToolFailure(makeInput("CONNECTION_REFUSED"));

      expect(repo.last().severity).toBe("high");
    });

    test("returns high for NOT_FOUND error codes", async () => {
      await recorder.recordToolFailure(makeInput("ELEMENT_NOT_FOUND"));

      expect(repo.last().severity).toBe("high");
    });

    test("returns low for SKIPPED error codes", async () => {
      await recorder.recordToolFailure(makeInput("SKIPPED"));

      expect(repo.last().severity).toBe("low");
    });

    test("returns low for IGNORED error codes", async () => {
      await recorder.recordToolFailure(makeInput("IGNORED"));

      expect(repo.last().severity).toBe("low");
    });

    test("returns medium for unknown error codes", async () => {
      await recorder.recordToolFailure(makeInput("SOMETHING_ELSE"));

      expect(repo.last().severity).toBe("medium");
    });
  });

  describe("recordCrash", () => {
    const makeInput = (overrides?: Partial<RecordCrashInput>): RecordCrashInput => ({
      exceptionType: "NullPointerException",
      exceptionMessage: "Attempt to invoke on null reference",
      stackTrace: [makeSystemFrame(), makeAppFrame()],
      ...baseContext,
      ...overrides,
    });

    test("records a crash and returns occurrence ID", async () => {
      const result = await recorder.recordCrash(makeInput());

      expect(result).toBe("occ_1");
      expect(repo.last().type).toBe("crash");
    });

    test("generates crash signature with app frame", async () => {
      await recorder.recordCrash(makeInput());

      expect(repo.last().signature).toBe(
        "crash:NullPointerException:com.example.app.MainActivity.onCreate"
      );
    });

    test("falls back to exception type when no app frame", async () => {
      await recorder.recordCrash(makeInput({ stackTrace: [makeSystemFrame()] }));

      expect(repo.last().signature).toBe("crash:NullPointerException");
    });

    test("generates crash title with app frame details", async () => {
      await recorder.recordCrash(makeInput());

      expect(repo.last().title).toBe(
        "NullPointerException in onCreate (MainActivity.kt:42)"
      );
    });

    test("generates crash title without line number when null", async () => {
      await recorder.recordCrash(
        makeInput({
          stackTrace: [makeAppFrame({ lineNumber: null })],
        })
      );

      expect(repo.last().title).toBe(
        "NullPointerException in onCreate (MainActivity.kt)"
      );
    });

    test("uses className last segment when fileName is null", async () => {
      await recorder.recordCrash(
        makeInput({
          stackTrace: [makeAppFrame({ fileName: null })],
        })
      );

      expect(repo.last().title).toContain("MainActivity");
    });

    test("falls back to exception type for title when no app frame", async () => {
      await recorder.recordCrash(makeInput({ stackTrace: [makeSystemFrame()] }));

      expect(repo.last().title).toBe("NullPointerException");
    });

    test("includes stack trace in failure input", async () => {
      const trace = [makeSystemFrame(), makeAppFrame()];
      await recorder.recordCrash(makeInput({ stackTrace: trace }));

      expect(repo.last().stackTrace).toEqual(trace);
    });

    test("constructs message from exception type and message", async () => {
      await recorder.recordCrash(makeInput());

      expect(repo.last().message).toBe(
        "NullPointerException: Attempt to invoke on null reference"
      );
    });
  });

  describe("crash severity", () => {
    const makeInput = (exceptionType: string): RecordCrashInput => ({
      exceptionType,
      exceptionMessage: "error",
      stackTrace: [makeAppFrame()],
      ...baseContext,
    });

    test("returns critical for OutOfMemory", async () => {
      await recorder.recordCrash(makeInput("OutOfMemoryError"));

      expect(repo.last().severity).toBe("critical");
    });

    test("returns critical for StackOverflow", async () => {
      await recorder.recordCrash(makeInput("StackOverflowError"));

      expect(repo.last().severity).toBe("critical");
    });

    test("returns critical for Fatal exceptions", async () => {
      await recorder.recordCrash(makeInput("FatalException"));

      expect(repo.last().severity).toBe("critical");
    });

    test("returns high for NullPointer", async () => {
      await recorder.recordCrash(makeInput("NullPointerException"));

      expect(repo.last().severity).toBe("high");
    });

    test("returns high for IllegalState", async () => {
      await recorder.recordCrash(makeInput("IllegalStateException"));

      expect(repo.last().severity).toBe("high");
    });

    test("returns high for SecurityException", async () => {
      await recorder.recordCrash(makeInput("SecurityException"));

      expect(repo.last().severity).toBe("high");
    });

    test("returns low for NumberFormat", async () => {
      await recorder.recordCrash(makeInput("NumberFormatException"));

      expect(repo.last().severity).toBe("low");
    });

    test("returns low for ParseException", async () => {
      await recorder.recordCrash(makeInput("ParseException"));

      expect(repo.last().severity).toBe("low");
    });

    test("returns medium for generic exceptions", async () => {
      await recorder.recordCrash(makeInput("RuntimeException"));

      expect(repo.last().severity).toBe("medium");
    });
  });

  describe("recordAnr", () => {
    const makeInput = (overrides?: Partial<RecordAnrInput>): RecordAnrInput => ({
      reason: "Input dispatching timed out",
      ...baseContext,
      ...overrides,
    });

    test("records an ANR and returns occurrence ID", async () => {
      const result = await recorder.recordAnr(makeInput());

      expect(result).toBe("occ_1");
      expect(repo.last().type).toBe("anr");
    });

    test("ANR severity is always high", async () => {
      await recorder.recordAnr(makeInput());

      expect(repo.last().severity).toBe("high");
    });

    test("generates ANR signature with app frame", async () => {
      await recorder.recordAnr(
        makeInput({ stackTrace: [makeSystemFrame(), makeAppFrame()] })
      );

      expect(repo.last().signature).toBe(
        "anr:com.example.app.MainActivity.onCreate"
      );
    });

    test("generates ANR signature with hash when no app frame", async () => {
      await recorder.recordAnr(makeInput({ reason: "Input dispatching timed out" }));

      // Should be anr:<md5-hash-first-8-chars>
      expect(repo.last().signature).toMatch(/^anr:[a-f0-9]{8}$/);
    });

    test("generates consistent hash for same reason", async () => {
      await recorder.recordAnr(makeInput({ reason: "same reason" }));
      const sig1 = repo.last().signature;

      await recorder.recordAnr(makeInput({ reason: "same reason" }));
      const sig2 = repo.last().signature;

      expect(sig1).toBe(sig2);
    });

    test("generates ANR title with app frame", async () => {
      await recorder.recordAnr(
        makeInput({
          stackTrace: [makeAppFrame({ className: "com.example.MyService", methodName: "doWork" })],
        })
      );

      expect(repo.last().title).toBe("ANR: MyService.doWork");
    });

    test("generates ANR title with truncated reason when no app frame", async () => {
      const longReason = "A".repeat(100);
      await recorder.recordAnr(makeInput({ reason: longReason }));

      expect(repo.last().title).toBe(`ANR: ${"A".repeat(50)}...`);
    });

    test("generates ANR title with short reason when no app frame", async () => {
      await recorder.recordAnr(makeInput({ reason: "Short reason" }));

      expect(repo.last().title).toBe("ANR: Short reason");
    });

    test("includes duration in occurrence", async () => {
      await recorder.recordAnr(makeInput({ durationMs: 10000 }));

      expect(repo.last().occurrence.durationMs).toBe(10000);
    });
  });

  describe("recordNonFatal", () => {
    const makeInput = (overrides?: Partial<RecordNonFatalInput>): RecordNonFatalInput => ({
      exceptionType: "IOException",
      exceptionMessage: "Connection reset",
      stackTrace: [makeAppFrame()],
      ...baseContext,
      ...overrides,
    });

    test("records a non-fatal and returns occurrence ID", async () => {
      const result = await recorder.recordNonFatal(makeInput());

      expect(result).toBe("occ_1");
      expect(repo.last().type).toBe("nonfatal");
    });

    test("generates non-fatal signature with app frame", async () => {
      await recorder.recordNonFatal(makeInput());

      expect(repo.last().signature).toBe(
        "nonfatal:IOException:com.example.app.MainActivity.onCreate"
      );
    });

    test("falls back to exception type when no app frame", async () => {
      await recorder.recordNonFatal(makeInput({ stackTrace: [makeSystemFrame()] }));

      expect(repo.last().signature).toBe("nonfatal:IOException");
    });

    test("generates title with app frame details", async () => {
      await recorder.recordNonFatal(makeInput());

      expect(repo.last().title).toBe("IOException in onCreate (MainActivity.kt:42)");
    });

    test("falls back to exception type for title when no app frame", async () => {
      await recorder.recordNonFatal(makeInput({ stackTrace: [makeSystemFrame()] }));

      expect(repo.last().title).toBe("IOException");
    });

    test("includes customMessage in message when provided", async () => {
      await recorder.recordNonFatal(makeInput({ customMessage: "Retrying..." }));

      expect(repo.last().message).toBe("IOException: Connection reset - Retrying...");
    });

    test("omits customMessage from message when not provided", async () => {
      await recorder.recordNonFatal(makeInput());

      expect(repo.last().message).toBe("IOException: Connection reset");
    });
  });

  describe("non-fatal severity", () => {
    const makeInput = (exceptionType: string): RecordNonFatalInput => ({
      exceptionType,
      exceptionMessage: "error",
      stackTrace: [makeAppFrame()],
      ...baseContext,
    });

    test("returns medium for SecurityException", async () => {
      await recorder.recordNonFatal(makeInput("SecurityException"));

      expect(repo.last().severity).toBe("medium");
    });

    test("returns medium for IllegalState", async () => {
      await recorder.recordNonFatal(makeInput("IllegalStateException"));

      expect(repo.last().severity).toBe("medium");
    });

    test("returns medium for NullPointer", async () => {
      await recorder.recordNonFatal(makeInput("NullPointerException"));

      expect(repo.last().severity).toBe("medium");
    });

    test("returns low for most other exceptions", async () => {
      await recorder.recordNonFatal(makeInput("IOException"));

      expect(repo.last().severity).toBe("low");
    });

    test("returns low for unknown exceptions", async () => {
      await recorder.recordNonFatal(makeInput("CustomException"));

      expect(repo.last().severity).toBe("low");
    });
  });

  describe("capture selection", () => {
    test("prefers video over screenshot", async () => {
      await recorder.recordToolFailure({
        toolName: "tapOn",
        errorMessage: "err",
        ...baseContext,
        screenshotPath: "/path/to/screenshot.png",
        videoPath: "/path/to/video.mp4",
      });

      expect(repo.last().capture).toEqual({
        type: "video",
        path: "/path/to/video.mp4",
      });
    });

    test("uses screenshot when no video", async () => {
      await recorder.recordToolFailure({
        toolName: "tapOn",
        errorMessage: "err",
        ...baseContext,
        screenshotPath: "/path/to/screenshot.png",
      });

      expect(repo.last().capture).toEqual({
        type: "screenshot",
        path: "/path/to/screenshot.png",
      });
    });

    test("returns undefined when no capture paths", async () => {
      await recorder.recordToolFailure({
        toolName: "tapOn",
        errorMessage: "err",
        ...baseContext,
      });

      expect(repo.last().capture).toBeUndefined();
    });
  });

  describe("occurrence context", () => {
    test("passes through device context", async () => {
      await recorder.recordToolFailure({
        toolName: "tapOn",
        errorMessage: "err",
        deviceId: "emulator-5554",
        deviceModel: "Pixel 8",
        os: "android-15",
        appVersion: "2.0.0",
        sessionId: "session-42",
      });

      const occ = repo.last().occurrence;
      expect(occ.deviceId).toBe("emulator-5554");
      expect(occ.deviceModel).toBe("Pixel 8");
      expect(occ.os).toBe("android-15");
      expect(occ.appVersion).toBe("2.0.0");
      expect(occ.sessionId).toBe("session-42");
    });

    test("passes through screen context", async () => {
      await recorder.recordToolFailure({
        toolName: "tapOn",
        errorMessage: "err",
        ...baseContext,
        currentScreen: "LoginScreen",
        screensVisited: ["HomeScreen", "SettingsScreen", "LoginScreen"],
      });

      const occ = repo.last().occurrence;
      expect(occ.screenAtFailure).toBe("LoginScreen");
      expect(occ.screensVisited).toEqual(["HomeScreen", "SettingsScreen", "LoginScreen"]);
    });

    test("passes through test context", async () => {
      await recorder.recordToolFailure({
        toolName: "tapOn",
        errorMessage: "err",
        ...baseContext,
        testName: "login_test",
        testExecutionId: 123,
      });

      const occ = repo.last().occurrence;
      expect(occ.testName).toBe("login_test");
      expect(occ.testExecutionId).toBe(123);
    });
  });

  describe("parameter variant extraction", () => {
    test("converts string values directly", async () => {
      await recorder.recordToolFailure({
        toolName: "tapOn",
        errorMessage: "err",
        ...baseContext,
        toolArgs: { text: "Submit" },
      });

      expect(repo.last().toolCallInfo!.parameterVariants).toEqual({
        text: ["Submit"],
      });
    });

    test("JSON-stringifies non-string values", async () => {
      await recorder.recordToolFailure({
        toolName: "tapOn",
        errorMessage: "err",
        ...baseContext,
        toolArgs: { count: 5, enabled: true },
      });

      const variants = repo.last().toolCallInfo!.parameterVariants;
      expect(variants.count).toEqual(["5"]);
      expect(variants.enabled).toEqual(["true"]);
    });

    test("skips null and undefined values", async () => {
      await recorder.recordToolFailure({
        toolName: "tapOn",
        errorMessage: "err",
        ...baseContext,
        toolArgs: { text: "Hello", empty: null, missing: undefined },
      });

      const variants = repo.last().toolCallInfo!.parameterVariants;
      expect(variants.text).toEqual(["Hello"]);
      expect(variants.empty).toBeUndefined();
      expect(variants.missing).toBeUndefined();
    });

    test("returns empty variants when no toolArgs", async () => {
      await recorder.recordToolFailure({
        toolName: "tapOn",
        errorMessage: "err",
        ...baseContext,
      });

      expect(repo.last().toolCallInfo!.parameterVariants).toEqual({});
    });
  });

  describe("static methods", () => {
    test("resetInstance clears singleton", () => {
      FailureRecorder.resetInstance();
      // Should not throw
      expect(true).toBe(true);
    });

    test("createForTesting returns a new instance", () => {
      const instance = FailureRecorder.createForTesting(repo as any);
      expect(instance).toBeInstanceOf(FailureRecorder);
    });
  });

  describe("telemetry push", () => {
    const crashStack: StackTraceElement[] = [
      { className: "com.example.UserRepo", methodName: "getUser", fileName: "UserRepo.kt", lineNumber: 42, isAppCode: true },
      { className: "android.os.Handler", methodName: "dispatch", fileName: null, lineNumber: null, isAppCode: false },
    ];

    test("recordCrash pushes telemetry with stackTrace", async () => {
      timer.advanceTime(5000);
      await recorder.recordCrash({
        exceptionType: "NullPointerException",
        exceptionMessage: "null",
        stackTrace: crashStack,
        ...baseContext,
      });

      expect(telemetry.pushed).toHaveLength(1);
      expect(telemetry.pushed[0].type).toBe("crash");
      expect(telemetry.pushed[0].stackTrace).toEqual(crashStack);
    });

    test("recordAnr pushes telemetry with stackTrace", async () => {
      timer.advanceTime(6000);
      const anrStack: StackTraceElement[] = [
        { className: "com.example.Main", methodName: "run", fileName: "Main.kt", lineNumber: 10, isAppCode: true },
      ];
      await recorder.recordAnr({
        reason: "main thread blocked",
        stackTrace: anrStack,
        ...baseContext,
      });

      expect(telemetry.pushed).toHaveLength(1);
      expect(telemetry.pushed[0].type).toBe("anr");
      expect(telemetry.pushed[0].stackTrace).toEqual(anrStack);
    });

    test("recordNonFatal pushes telemetry with stackTrace", async () => {
      timer.advanceTime(7000);
      await recorder.recordNonFatal({
        exceptionType: "IOException",
        exceptionMessage: "timeout",
        stackTrace: crashStack,
        ...baseContext,
      });

      expect(telemetry.pushed).toHaveLength(1);
      expect(telemetry.pushed[0].type).toBe("nonfatal");
      expect(telemetry.pushed[0].stackTrace).toEqual(crashStack);
    });

    test("telemetry event uses timer.now() for timestamp", async () => {
      timer.advanceTime(9999);
      await recorder.recordCrash({
        exceptionType: "NPE",
        exceptionMessage: "null",
        stackTrace: crashStack,
        ...baseContext,
      });

      expect((telemetry.pushed[0] as any).timestamp).toBe(9999);
    });
  });
});
