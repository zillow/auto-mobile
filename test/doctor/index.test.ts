import { describe, expect, test } from "bun:test";
import { formatConsoleOutput, formatJsonOutput } from "../../src/doctor/formatter";
import type { DoctorReport, CheckResult, DoctorSummary } from "../../src/doctor/types";

function makeCheck(overrides: Partial<CheckResult> & Pick<CheckResult, "name" | "status">): CheckResult {
  return {
    message: overrides.status,
    ...overrides,
  };
}

function makeReport(overrides: Partial<DoctorReport> = {}): DoctorReport {
  const systemChecks = overrides.system?.checks ?? [];
  const androidChecks = overrides.android?.checks;
  const iosChecks = overrides.ios?.checks;
  const autoMobileChecks = overrides.autoMobile?.checks ?? [];

  const allChecks = [
    ...systemChecks,
    ...(androidChecks ?? []),
    ...(iosChecks ?? []),
    ...autoMobileChecks,
  ];

  const summary: DoctorSummary = overrides.summary ?? {
    total: allChecks.length,
    passed: allChecks.filter(c => c.status === "pass").length,
    warnings: allChecks.filter(c => c.status === "warn").length,
    failed: allChecks.filter(c => c.status === "fail").length,
    skipped: allChecks.filter(c => c.status === "skip").length,
  };

  return {
    timestamp: "2025-01-01T00:00:00.000Z",
    version: "1.0.0",
    platform: "darwin",
    arch: "arm64",
    system: { checks: systemChecks },
    autoMobile: { checks: autoMobileChecks },
    summary,
    recommendations: overrides.recommendations ?? [],
    ...(androidChecks ? { android: { checks: androidChecks } } : {}),
    ...(iosChecks ? { ios: { checks: iosChecks } } : {}),
  };
}

describe("formatConsoleOutput", () => {
  test("includes header with version, platform, and timestamp", () => {
    const report = makeReport();
    const output = formatConsoleOutput(report, false);

    expect(output).toContain("AutoMobile Doctor");
    expect(output).toContain("=================");
    expect(output).toContain("Version: 1.0.0");
    expect(output).toContain("Platform: darwin (arm64)");
    expect(output).toContain("Timestamp: 2025-01-01T00:00:00.000Z");
  });

  test("all passing checks shows success message", () => {
    const report = makeReport({
      system: {
        checks: [makeCheck({ name: "OS", status: "pass", message: "darwin" })],
      },
      autoMobile: {
        checks: [makeCheck({ name: "Server", status: "pass", message: "ok" })],
      },
    });
    const output = formatConsoleOutput(report, false);

    expect(output).toContain("All checks passed! AutoMobile is ready to use.");
    expect(output).toContain("Passed: 2");
    expect(output).toContain("Warnings: 0");
    expect(output).toContain("Failed: 0");
  });

  test("warnings shows warning message", () => {
    const report = makeReport({
      system: {
        checks: [makeCheck({ name: "OS", status: "pass", message: "darwin" })],
      },
      autoMobile: {
        checks: [makeCheck({ name: "Cache", status: "warn", message: "stale" })],
      },
    });
    const output = formatConsoleOutput(report, false);

    expect(output).toContain("warnings to review");
    expect(output).not.toContain("Some checks failed");
  });

  test("failures shows failure message", () => {
    const report = makeReport({
      system: {
        checks: [makeCheck({ name: "OS", status: "fail", message: "unsupported" })],
      },
      autoMobile: {
        checks: [makeCheck({ name: "Server", status: "pass", message: "ok" })],
      },
    });
    const output = formatConsoleOutput(report, false);

    expect(output).toContain("Some checks failed");
  });

  test("skipped checks shows skipped count in summary", () => {
    const report = makeReport({
      system: {
        checks: [makeCheck({ name: "OS", status: "pass", message: "darwin" })],
      },
      autoMobile: {
        checks: [makeCheck({ name: "iOS Check", status: "skip", message: "not applicable" })],
      },
    });
    const output = formatConsoleOutput(report, false);

    expect(output).toContain("Skipped: 1");
  });

  test("skipped count is omitted when zero", () => {
    const report = makeReport({
      system: {
        checks: [makeCheck({ name: "OS", status: "pass", message: "darwin" })],
      },
      autoMobile: {
        checks: [makeCheck({ name: "Server", status: "pass", message: "ok" })],
      },
    });
    const output = formatConsoleOutput(report, false);

    expect(output).not.toContain("Skipped:");
  });

  test("useColors=false produces no ANSI escape codes", () => {
    const report = makeReport({
      system: {
        checks: [
          makeCheck({ name: "OS", status: "pass", message: "darwin" }),
          makeCheck({ name: "Broken", status: "fail", message: "bad" }),
          makeCheck({ name: "Iffy", status: "warn", message: "maybe" }),
          makeCheck({ name: "Skipped", status: "skip", message: "n/a" }),
        ],
      },
      autoMobile: { checks: [] },
    });
    const output = formatConsoleOutput(report, false);

    expect(output).not.toContain("\x1b[");
  });

  test("useColors=true produces ANSI escape codes", () => {
    const report = makeReport({
      system: {
        checks: [makeCheck({ name: "OS", status: "pass", message: "darwin" })],
      },
      autoMobile: { checks: [] },
    });
    const output = formatConsoleOutput(report, true);

    expect(output).toContain("\x1b[32m");
    expect(output).toContain("\x1b[0m");
  });

  test("check with value displays value instead of message", () => {
    const report = makeReport({
      system: {
        checks: [makeCheck({ name: "OS", status: "pass", message: "the message", value: "the-value" })],
      },
      autoMobile: { checks: [] },
    });
    const output = formatConsoleOutput(report, false);

    expect(output).toContain("[PASS] OS: the-value");
    expect(output).not.toContain("the message");
  });

  test("check without value displays message", () => {
    const report = makeReport({
      system: {
        checks: [makeCheck({ name: "OS", status: "pass", message: "the message" })],
      },
      autoMobile: { checks: [] },
    });
    const output = formatConsoleOutput(report, false);

    expect(output).toContain("[PASS] OS: the message");
  });

  test("recommendations on warn/fail checks in autoMobile section show tips", () => {
    const report = makeReport({
      system: { checks: [] },
      autoMobile: {
        checks: [
          makeCheck({
            name: "ADB",
            status: "fail",
            message: "not found",
            recommendation: "Install Android SDK",
          }),
        ],
      },
    });
    const output = formatConsoleOutput(report, false);

    expect(output).toContain("Tip: Install Android SDK");
  });

  test("recommendations on passing checks in autoMobile section do not show tips", () => {
    const report = makeReport({
      system: { checks: [] },
      autoMobile: {
        checks: [
          makeCheck({
            name: "ADB",
            status: "pass",
            message: "found",
            recommendation: "Should not appear",
          }),
        ],
      },
    });
    const output = formatConsoleOutput(report, false);

    expect(output).not.toContain("Tip: Should not appear");
  });

  test("recommendations on warn/fail checks in android section show tips", () => {
    const report = makeReport({
      system: { checks: [] },
      android: {
        checks: [
          makeCheck({
            name: "SDK",
            status: "warn",
            message: "outdated",
            recommendation: "Update SDK",
          }),
        ],
      },
      autoMobile: { checks: [] },
    });
    const output = formatConsoleOutput(report, false);

    expect(output).toContain("--- Android Platform ---");
    expect(output).toContain("Tip: Update SDK");
  });

  test("recommendations on warn/fail checks in ios section show tips", () => {
    const report = makeReport({
      system: { checks: [] },
      ios: {
        checks: [
          makeCheck({
            name: "Xcode",
            status: "fail",
            message: "missing",
            recommendation: "Install Xcode",
          }),
        ],
      },
      autoMobile: { checks: [] },
    });
    const output = formatConsoleOutput(report, false);

    expect(output).toContain("--- iOS Platform ---");
    expect(output).toContain("Tip: Install Xcode");
  });

  test("system section does not show tips even with recommendations", () => {
    const report = makeReport({
      system: {
        checks: [
          makeCheck({
            name: "OS",
            status: "fail",
            message: "unsupported",
            recommendation: "Use macOS",
          }),
        ],
      },
      autoMobile: { checks: [] },
    });
    const output = formatConsoleOutput(report, false);

    // System section doesn't render tips (per formatter logic)
    expect(output).toContain("[FAIL] OS");
    expect(output).not.toContain("Tip: Use macOS");
  });

  test("android section omitted when not present", () => {
    const report = makeReport({
      system: { checks: [] },
      autoMobile: { checks: [] },
    });
    const output = formatConsoleOutput(report, false);

    expect(output).not.toContain("--- Android Platform ---");
  });

  test("ios section omitted when not present", () => {
    const report = makeReport({
      system: { checks: [] },
      autoMobile: { checks: [] },
    });
    const output = formatConsoleOutput(report, false);

    expect(output).not.toContain("--- iOS Platform ---");
  });

  test("includes GitHub issues link", () => {
    const report = makeReport();
    const output = formatConsoleOutput(report, false);

    expect(output).toContain("https://github.com/kaeawc/auto-mobile/issues");
  });

  test("status icons are rendered correctly", () => {
    const report = makeReport({
      system: {
        checks: [
          makeCheck({ name: "A", status: "pass" }),
          makeCheck({ name: "B", status: "warn" }),
          makeCheck({ name: "C", status: "fail" }),
          makeCheck({ name: "D", status: "skip" }),
        ],
      },
      autoMobile: { checks: [] },
    });
    const output = formatConsoleOutput(report, false);

    expect(output).toContain("[PASS] A");
    expect(output).toContain("[WARN] B");
    expect(output).toContain("[FAIL] C");
    expect(output).toContain("[SKIP] D");
  });
});

describe("formatJsonOutput", () => {
  test("returns valid JSON", () => {
    const report = makeReport({
      system: {
        checks: [makeCheck({ name: "OS", status: "pass", message: "darwin" })],
      },
      autoMobile: { checks: [] },
    });
    const json = formatJsonOutput(report);

    expect(() => JSON.parse(json)).not.toThrow();
  });

  test("roundtrips correctly", () => {
    const report = makeReport({
      system: {
        checks: [makeCheck({ name: "OS", status: "pass", message: "darwin", value: "darwin" })],
      },
      android: {
        checks: [makeCheck({ name: "ADB", status: "warn", message: "old", recommendation: "update" })],
      },
      autoMobile: {
        checks: [makeCheck({ name: "Server", status: "pass", message: "running" })],
      },
      recommendations: ["ADB: update"],
    });

    const json = formatJsonOutput(report);
    const parsed = JSON.parse(json) as DoctorReport;

    expect(parsed.timestamp).toBe(report.timestamp);
    expect(parsed.version).toBe(report.version);
    expect(parsed.platform).toBe(report.platform);
    expect(parsed.arch).toBe(report.arch);
    expect(parsed.system.checks).toEqual(report.system.checks);
    expect(parsed.android?.checks).toEqual(report.android?.checks);
    expect(parsed.autoMobile.checks).toEqual(report.autoMobile.checks);
    expect(parsed.summary).toEqual(report.summary);
    expect(parsed.recommendations).toEqual(report.recommendations);
  });

  test("is pretty-printed with 2-space indentation", () => {
    const report = makeReport();
    const json = formatJsonOutput(report);

    // JSON.stringify with indent 2 starts object contents at 2-space indent
    expect(json).toContain('  "timestamp"');
  });
});
