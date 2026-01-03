/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DoctorReport, CheckResult, CheckStatus } from "./types";

const STATUS_ICONS: Record<CheckStatus, string> = {
  pass: "[PASS]",
  warn: "[WARN]",
  fail: "[FAIL]",
  skip: "[SKIP]",
};

const STATUS_COLORS: Record<CheckStatus, string> = {
  pass: "\x1b[32m",  // green
  warn: "\x1b[33m",  // yellow
  fail: "\x1b[31m",  // red
  skip: "\x1b[90m",  // gray
};

const RESET = "\x1b[0m";

/**
 * Format a single check result line
 */
function formatCheckLine(check: CheckResult, useColors: boolean): string {
  const icon = STATUS_ICONS[check.status];
  const color = useColors ? STATUS_COLORS[check.status] : "";
  const reset = useColors ? RESET : "";

  let line = `${color}${icon}${reset} ${check.name}`;

  if (check.value !== undefined && check.value !== null) {
    line += `: ${check.value}`;
  } else if (check.message) {
    line += `: ${check.message}`;
  }

  return line;
}

/**
 * Format the doctor report for console output
 */
export function formatConsoleOutput(report: DoctorReport, useColors: boolean = true): string {
  const lines: string[] = [];

  // Header
  lines.push("");
  lines.push("AutoMobile Doctor");
  lines.push("=================");
  lines.push(`Version: ${report.version}`);
  lines.push(`Platform: ${report.platform} (${report.arch})`);
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push("");

  // System section
  lines.push("--- System ---");
  for (const check of report.system.checks) {
    lines.push(formatCheckLine(check, useColors));
  }
  lines.push("");

  // Android section (if present)
  if (report.android) {
    lines.push("--- Android Platform ---");
    for (const check of report.android.checks) {
      lines.push(formatCheckLine(check, useColors));
      if (check.recommendation && (check.status === "warn" || check.status === "fail")) {
        lines.push(`       Tip: ${check.recommendation}`);
      }
    }
    lines.push("");
  }

  // iOS section (if present)
  if (report.ios) {
    lines.push("--- iOS Platform ---");
    for (const check of report.ios.checks) {
      lines.push(formatCheckLine(check, useColors));
      if (check.recommendation && (check.status === "warn" || check.status === "fail")) {
        lines.push(`       Tip: ${check.recommendation}`);
      }
    }
    lines.push("");
  }

  // AutoMobile section
  lines.push("--- AutoMobile ---");
  for (const check of report.autoMobile.checks) {
    lines.push(formatCheckLine(check, useColors));
    if (check.recommendation && (check.status === "warn" || check.status === "fail")) {
      lines.push(`       Tip: ${check.recommendation}`);
    }
  }
  lines.push("");

  // Summary
  lines.push("--- Summary ---");
  const passColor = useColors ? STATUS_COLORS.pass : "";
  const warnColor = useColors ? STATUS_COLORS.warn : "";
  const failColor = useColors ? STATUS_COLORS.fail : "";
  const skipColor = useColors ? STATUS_COLORS.skip : "";
  const reset = useColors ? RESET : "";

  const summaryParts: string[] = [
    `Total: ${report.summary.total}`,
    `${passColor}Passed: ${report.summary.passed}${reset}`,
    `${warnColor}Warnings: ${report.summary.warnings}${reset}`,
    `${failColor}Failed: ${report.summary.failed}${reset}`,
  ];

  if (report.summary.skipped > 0) {
    summaryParts.push(`${skipColor}Skipped: ${report.summary.skipped}${reset}`);
  }

  lines.push(summaryParts.join(" | "));
  lines.push("");

  // Overall status message
  if (report.summary.failed > 0) {
    lines.push(`${failColor}Some checks failed. Please address the issues above.${reset}`);
  } else if (report.summary.warnings > 0) {
    lines.push(`${warnColor}All critical checks passed, but there are warnings to review.${reset}`);
  } else {
    lines.push(`${passColor}All checks passed! AutoMobile is ready to use.${reset}`);
  }
  lines.push("");

  // Issue link
  lines.push("Include this output in GitHub issues:");
  lines.push("  https://github.com/kaeawc/auto-mobile/issues");
  lines.push("");

  return lines.join("\n");
}

/**
 * Format the doctor report as JSON
 */
export function formatJsonOutput(report: DoctorReport): string {
  return JSON.stringify(report, null, 2);
}
