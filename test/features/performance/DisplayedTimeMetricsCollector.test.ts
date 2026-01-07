import { beforeEach, describe, expect, test } from "bun:test";
import { DisplayedTimeMetricsCollector } from "../../../src/features/performance/DisplayedTimeMetricsCollector";

describe("DisplayedTimeMetricsCollector - Unit Tests", function() {
  let collector: DisplayedTimeMetricsCollector;

  beforeEach(function() {
    collector = new DisplayedTimeMetricsCollector({ deviceId: "test", name: "test", platform: "android" });
  });

  test("parses ActivityManager displayed metrics with millisecond duration", function() {
    const output = "1694099696.789  1234  5678 I ActivityManager: Displayed com.example/.MainActivity: +824ms";
    const result = (collector as any).parseDisplayedMetrics(output, {
      packageName: "com.example",
      startTimestampMs: 1694099696000,
      endTimestampMs: 1694099697000
    });

    expect(result.length).toBe(1);
    expect(result[0].packageName).toBe("com.example");
    expect(result[0].activityName).toBe("com.example.MainActivity");
    expect(result[0].displayedTimeMs).toBe(824);
    expect(result[0].logcatTag).toBe("ActivityManager");
  });

  test("parses ActivityTaskManager displayed metrics with seconds duration", function() {
    const output = "1694099697.123  1111  2222 I ActivityTaskManager: Displayed com.example/com.example.MainActivity: +1s234ms";
    const result = (collector as any).parseDisplayedMetrics(output, {
      packageName: "com.example",
      startTimestampMs: 1694099697000,
      endTimestampMs: 1694099698000
    });

    expect(result.length).toBe(1);
    expect(result[0].activityName).toBe("com.example.MainActivity");
    expect(result[0].displayedTimeMs).toBe(1234);
    expect(result[0].logcatTag).toBe("ActivityTaskManager");
  });

  test("filters metrics by package and time window", function() {
    const output = [
      "1694099696.100  1234  5678 I ActivityManager: Displayed com.example/.SplashActivity: +200ms",
      "1694099600.000  1234  5678 I ActivityManager: Displayed com.example/.OldActivity: +400ms",
      "1694099696.200  1234  5678 I ActivityManager: Displayed com.other/.MainActivity: +300ms"
    ].join("\n");

    const result = (collector as any).parseDisplayedMetrics(output, {
      packageName: "com.example",
      startTimestampMs: 1694099696000,
      endTimestampMs: 1694099697000
    });

    expect(result.length).toBe(1);
    expect(result[0].activityName).toBe("com.example.SplashActivity");
    expect(result[0].displayedTimeMs).toBe(200);
  });
});
