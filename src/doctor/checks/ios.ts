/**
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CheckResult } from "../types";
import { SimCtlClient } from "../../utils/ios-cmdline-tools/SimCtlClient";

/**
 * Check if simctl is available (requires Xcode)
 */
export async function checkSimctlAvailable(): Promise<CheckResult> {
  // Only run on macOS
  if (process.platform !== "darwin") {
    return {
      name: "simctl",
      status: "skip",
      message: "iOS development requires macOS",
    };
  }

  try {
    const simctl = new SimCtlClient();
    const available = await simctl.isAvailable();

    if (available) {
      return {
        name: "simctl",
        status: "pass",
        message: "Xcode command line tools available",
      };
    }

    return {
      name: "simctl",
      status: "fail",
      message: "simctl not available",
      recommendation: "Install Xcode command line tools: xcode-select --install",
    };
  } catch (error) {
    return {
      name: "simctl",
      status: "fail",
      message: `simctl check failed: ${error instanceof Error ? error.message : String(error)}`,
      recommendation: "Install Xcode command line tools: xcode-select --install",
    };
  }
}

/**
 * Check booted iOS simulators
 */
export async function checkBootedSimulators(): Promise<CheckResult> {
  // Only run on macOS
  if (process.platform !== "darwin") {
    return {
      name: "Booted Simulators",
      status: "skip",
      message: "iOS simulators only available on macOS",
    };
  }

  try {
    const simctl = new SimCtlClient();

    // First check if simctl is available
    if (!(await simctl.isAvailable())) {
      return {
        name: "Booted Simulators",
        status: "skip",
        message: "simctl not available",
      };
    }

    const simulators = await simctl.getBootedSimulators();

    if (simulators.length === 0) {
      return {
        name: "Booted Simulators",
        status: "pass",
        message: "No simulators currently running",
        value: 0,
      };
    }

    const simNames = simulators.map(s => s.name).join(", ");
    return {
      name: "Booted Simulators",
      status: "pass",
      message: `${simulators.length} simulator(s) running: ${simNames}`,
      value: simulators.length,
    };
  } catch (error) {
    return {
      name: "Booted Simulators",
      status: "skip",
      message: `Could not check simulators: ${error instanceof Error ? error.message : String(error)}`,
      value: 0,
    };
  }
}

/**
 * Run all iOS checks (minimal)
 */
export async function runIosChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push(await checkSimctlAvailable());
  results.push(await checkBootedSimulators());

  return results;
}
