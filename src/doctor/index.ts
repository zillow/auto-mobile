/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { DoctorReport, DoctorOptions, DoctorSummary, CheckResult } from "./types";
import { runSystemChecks } from "./checks/system";
import { runAndroidChecks } from "./checks/android";
import { runIosChecks } from "./checks/ios";
import { runAutoMobileChecks } from "./checks/automobile";
import { RELEASE_VERSION } from "../constants/release";

/**
 * Calculate summary statistics from check results
 */
function calculateSummary(allChecks: CheckResult[]): DoctorSummary {
  const summary: DoctorSummary = {
    total: allChecks.length,
    passed: 0,
    warnings: 0,
    failed: 0,
    skipped: 0,
  };

  for (const check of allChecks) {
    switch (check.status) {
      case "pass":
        summary.passed++;
        break;
      case "warn":
        summary.warnings++;
        break;
      case "fail":
        summary.failed++;
        break;
      case "skip":
        summary.skipped++;
        break;
    }
  }

  return summary;
}

/**
 * Collect all recommendations from failed/warning checks
 */
function collectRecommendations(allChecks: CheckResult[]): string[] {
  const recommendations: string[] = [];

  for (const check of allChecks) {
    if ((check.status === "fail" || check.status === "warn") && check.recommendation) {
      recommendations.push(`${check.name}: ${check.recommendation}`);
    }
  }

  return recommendations;
}

/**
 * Run the doctor diagnostic tool
 */
export async function runDoctor(
  options: DoctorOptions = {}
): Promise<DoctorReport> {
  const allChecks: CheckResult[] = [];

  // Always run system checks
  const systemChecks = runSystemChecks();
  allChecks.push(...systemChecks);

  // Determine which platform checks to run
  const runAndroid = options.android === true || (options.android !== false && options.ios !== true);
  const runIos = options.ios === true || (options.ios !== true && options.android !== true && process.platform === "darwin");

  // Run Android checks if applicable
  let androidChecks: CheckResult[] | undefined;
  if (runAndroid) {
    androidChecks = await runAndroidChecks(options);
    allChecks.push(...androidChecks);
  }

  // Run iOS checks if applicable
  let iosChecks: CheckResult[] | undefined;
  if (runIos) {
    iosChecks = await runIosChecks();
    allChecks.push(...iosChecks);
  }

  // Always run AutoMobile checks
  const autoMobileChecks = await runAutoMobileChecks();
  allChecks.push(...autoMobileChecks);

  // Calculate summary and recommendations
  const summary = calculateSummary(allChecks);
  const recommendations = collectRecommendations(allChecks);

  const report: DoctorReport = {
    timestamp: new Date().toISOString(),
    version: RELEASE_VERSION,
    platform: process.platform,
    arch: process.arch,
    system: { checks: systemChecks },
    autoMobile: { checks: autoMobileChecks },
    summary,
    recommendations,
  };

  // Add platform-specific sections if they were run
  if (androidChecks) {
    report.android = { checks: androidChecks };
  }
  if (iosChecks) {
    report.ios = { checks: iosChecks };
  }

  return report;
}

// Re-export types and formatter for convenience
export { formatConsoleOutput, formatJsonOutput } from "./formatter";
export * from "./types";
