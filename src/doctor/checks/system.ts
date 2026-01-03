/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { release } from "node:os";
import { CheckResult } from "../types";

/**
 * Check operating system information
 */
export function checkOperatingSystem(): CheckResult {
  const platform = process.platform;
  const osRelease = release();

  return {
    name: "Operating System",
    status: "pass",
    message: `${platform} (${osRelease})`,
    value: platform,
  };
}

/**
 * Check system architecture
 */
export function checkArchitecture(): CheckResult {
  const arch = process.arch;

  return {
    name: "Architecture",
    status: "pass",
    message: arch,
    value: arch,
  };
}

/**
 * Check runtime environment (Node.js or Bun)
 */
export function checkRuntime(): CheckResult {
  // Check if running in Bun
  const bunVersion = (globalThis as any).Bun?.version;

  if (bunVersion) {
    return {
      name: "Runtime",
      status: "pass",
      message: `Bun ${bunVersion}`,
      value: `bun@${bunVersion}`,
    };
  }

  // Fallback to Node.js
  const nodeVersion = process.version;
  return {
    name: "Runtime",
    status: "pass",
    message: `Node.js ${nodeVersion}`,
    value: `node@${nodeVersion}`,
  };
}

/**
 * Run all system checks
 */
export function runSystemChecks(): CheckResult[] {
  return [
    checkOperatingSystem(),
    checkArchitecture(),
    checkRuntime(),
  ];
}
